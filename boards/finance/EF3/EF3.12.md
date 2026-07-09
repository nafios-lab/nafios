# EF3.12 — [Integration] Provision default categories at onboarding (+ finance first-load backstop)

> - `M1`
> - `type:feature`
> - `module:finance`
> - `area:web` · `area:data`
> - `P0`
> - `size:S`
> - **Epic:** EF3 — Get started: open your first ledger & track it with manual envelopes
> - **Blocked by:** [EF3.9](EF3.9.md) — the provisioning API (`provisionDefaultCategories` / `listCategories`) this ticket invokes; EF3.12 cannot merge until EF3.9 lands them on the `@nafios/finance` barrel.

> **This ticket is self-contained.** Everything needed to make a real, signed-up user actually *own* the default category set — the one server-side call from the onboarding commit and an idempotent browser-side backstop on first finance entry — is described here. It ships **no** new domain logic, **no** schema change, and **no** finance API: it is pure **wiring** in `apps/web` that *invokes* the finance-owned API from EF3.9. Stack: **TanStack Start (`apps/web`)** server functions + the interim finance route, calling `@nafios/finance` (EF3.9's `provisionDefaultCategories` / `listCategories`).
>
> **Why it exists — the gap it closes.** [EF3.9](EF3.9.md) settled the *mechanism* (a finance-owned `provisionDefaultCategories(client, userId)` API) and the *contract* (§4.5), but explicitly punted the call site: *"the call itself is a coordinated edit in the auth/platform repo, tracked there."* There is **no** separate auth/platform repo — this is a monorepo and onboarding lives in [`completeOnboardingFn`](../../../apps/web/src/lib/onboarding-fns.ts). So the *"when"* EF3.9 assigned to the auth layer is currently **unowned and unbuilt**. Until it lands, every new user has **zero categories**, and EF1.6's `NOT NULL` `envelope.category_id` FK means they **cannot create a single envelope** — the whole track-a-month loop (story-map S4) is blocked at line one. This is why it must land **before** the FE tickets ([EF3.10](EF3.10.md) fresh dashboard, [EF3.11](EF3.11.md) new-ledger flow, EF3.13/EF3.14), which all consume `listCategories` and assume a stocked picker.
>
> **The settled decision this ticket implements (do not re-open):** provisioning is a **finance-owned TS API the onboarding layer calls once per new user** — EF3.9 §1/§4.5, EF3.md Notes. This ticket adds *only the invocation*; it does not touch the catalog, the repository, the idempotency guard, or the table.
>
> **Two triggers, two clients (the non-obvious part).**
>
> 1. **Primary — onboarding commit (server-only).** In `completeOnboardingFn`, **after** the `insert_user_profile` RPC has committed and stamped `onboarding_completed_at`, call `provisionDefaultCategories(createServiceClient(), uid)`. This is the trusted backend job EF3.9 §4.5 describes — it runs inside a `createServerFn` handler, so the **secret** `service_role` key never reaches the client bundle.
> 2. **Backstop — finance first-load (browser, authed).** On first entry to the finance module, call `provisionDefaultCategories(createBrowserClient(), uid)` idempotently. This covers **already-onboarded users** (who finished onboarding before this ticket and so have no categories) and any onboarding-time miss. It **must** use the browser/authed client, **never** `createServiceClient()` — the `service_role` secret must not ship to the browser. The API works on an authed client because it sets `user_id` explicitly, which equals `auth.uid()` and passes the `owner_all` RLS `WITH CHECK` (EF3.9 §2.3, §8 note 4).
>
> **Error handling — best-effort, non-blocking (settled here).** A provisioning fault at the onboarding commit is **logged and swallowed**; `completeOnboardingFn` still returns `{ ok: true }`. Rationale in §4.3 — chiefly that `onboarding_completed_at` is *already committed* before provisioning runs, so failing the response would misreport a succeeded onboarding, and the route guard would admit the user anyway. The backstop + idempotency make a miss self-healing.
>
> **Depends on:**
>
> - **[EF3.9](EF3.9.md)** (hard) — this ticket calls `provisionDefaultCategories` / `listCategories` and imports `createServiceClient` / `createBrowserClient` from `@nafios/finance`. `provisionDefaultCategories` / `listCategories` are **not yet on the barrel** ([`packages/finance/src/index.ts`](../../../packages/finance/src/index.ts) exports the client factories + ledger/envelope commands only). **EF3.12 cannot merge until EF3.9 lands.**
> - The existing onboarding flow — [`completeOnboardingFn`](../../../apps/web/src/lib/onboarding-fns.ts) (the Step-3/Finish commit) and the interim finance route [`_protected/_app/finance/route.tsx`](../../../apps/web/src/routes/_protected/_app/finance/route.tsx). Both already exist.
>
> **Consumed by / unblocks:** every EF3 finance-web surface that reads categories — [EF3.10](EF3.10.md) (fresh dashboard), [EF3.11](EF3.11.md) (new-ledger flow), EF3.13 (ongoing-ledger grouping), EF3.14 (envelope category picker). After EF3.12, a fresh user's picker is never empty and EF3.8's `category_id` FK resolves.
>
> **No `apps/finance` app yet.** The epic (EF3.md) anticipates a future `apps/finance`, but finance currently mounts as **interim in-shell stub routes** at `apps/web/src/routes/_protected/_app/finance/` (per `apps/web/CLAUDE.md`). The backstop rides on that existing route entry; when the real finance shell / module-mount machinery lands, the hook migrates with it (§8 note 5).

---

## 1. What you're building

Pure wiring in `apps/web` — no finance logic, no schema, no new API:

1. **Add the dependency.** `@nafios/finance` (`workspace:*`) to `apps/web/package.json`. `apps/web` currently depends on `@nafios/auth-core`, `@nafios/database`, `@nafios/storage`, `@nafios/ui` only. Importing `@nafios/finance` is allowed under the app's "no direct `@supabase/*`" rule — finance wraps Supabase via `@nafios/supabase-core`, so the app never touches the SDK directly.

2. **The primary call — onboarding commit.** In [`completeOnboardingFn`](../../../apps/web/src/lib/onboarding-fns.ts), after `insertUserProfile(...)` resolves, call `provisionDefaultCategories(createServiceClient(), uid)` inside its **own** `try/catch`; on fault, log + continue (best-effort, §4.3). Still returns `{ ok: true }`.

3. **The backstop — finance first-load.** On entry to the finance module (the interim `route.tsx` loader/`beforeLoad`), call `provisionDefaultCategories(createBrowserClient(), uid)` **once per module entry**, relying on EF3.9's idempotent count-guard. Best-effort — a fault just means the picker may be empty (surfaced by EF3.14), never a broken navigation.

4. **Env.** Ensure `SUPABASE_SERVICE_ROLE_KEY` is present in `apps/web`'s **server** runtime (Netlify SSR function) — `createServiceClient()` reads it. It is referenced only inside the `createServerFn` handler, so it never enters the client bundle (§4.4).

5. **Tests.** Onboarding fn provisions after the profile write; a provisioning fault is swallowed (`ok:true` still returned); the backstop fires once on entry and is idempotent.

---

## 2. Integration contract — the two call sites

### 2.1 Primary — `completeOnboardingFn` (server-only, service client)

```ts
// apps/web/src/lib/onboarding-fns.ts — inside completeOnboardingFn's handler,
// AFTER the existing insertUserProfile(...) call succeeds:

import { createServiceClient, provisionDefaultCategories } from "@nafios/finance";

// ...existing family-member upload + mapping...
await insertUserProfile(createServerDb(cookies), { familyMembers });
// ^ commits the family rows AND stamps onboarding_completed_at (transactional).

// Best-effort: stock the new user's default categories. Its own try/catch so a
// finance-side fault never fails a completed onboarding (§4.3). Idempotent — a
// retry of Finish is a safe no-op (EF3.9 count-guard).
try {
  await provisionDefaultCategories(createServiceClient(), uid);
} catch (error) {
  // Log for observability; do NOT surface. The first-load backstop re-provisions.
  console.error("provisionDefaultCategories (onboarding) failed", { uid, error });
}

return { ok: true };
```

### 2.2 Backstop — finance module entry (browser, authed client)

```ts
// apps/web/src/routes/_protected/_app/finance/route.tsx — in the route loader
// (runs on entry to /finance/**). Uses the BROWSER/authed client (RLS applies,
// user_id === auth.uid()) — NEVER the service client (secret must not ship to
// the browser). Idempotent count-guard makes this a cheap no-op once stocked.

import { createBrowserClient, provisionDefaultCategories } from "@nafios/finance";

// best-effort backstop; uid from the authed session already resolved by the guard
try {
  await provisionDefaultCategories(createBrowserClient(), uid);
} catch {
  // swallow — an empty picker is surfaced downstream (EF3.14), never breaks nav
}
```

> **`uid` source.** `completeOnboardingFn` already resolves `session.user.id` (its `uid`). The backstop takes the authed user's id from the session the `_protected` guard already established. `session.user.id` is simultaneously the `auth.users.id` and the `profiles.id` (1:1), so it is the correct `userId` for the finance `category.user_id` FK either way.

---

## 3. Placement & touched files

```
apps/web/
├── package.json                                   # + "@nafios/finance": "workspace:*"        ← this ticket
└── src/
    ├── lib/
    │   └── onboarding-fns.ts                       # completeOnboardingFn — add the primary call ← this ticket
    └── routes/_protected/_app/finance/
        └── route.tsx                               # add the first-load backstop in the loader   ← this ticket
```

- **No new files, no new packages, no migration, no domain/data code.** Three edits + one dependency line.
- All finance access is via the `@nafios/finance` **barrel** — no deep imports into `src/internal/`, consistent with the monorepo hard rule.
- The service-client call lives **only** in a `createServerFn` handler (server-only); the browser-client call lives **only** in the route loader (client/isomorphic). Neither crosses that boundary.

---

## 4. Behavior & rules

### 4.1 Ordering — provision strictly after the onboarding commit

`provisionDefaultCategories` runs **after** `insertUserProfile` resolves — i.e. after the family rows and `onboarding_completed_at` are committed. This matches EF3.9 §4.5 ("after the auth.users row exists") and the settled "onboarding owns the *when*." It is never interleaved with, or inside the same `try` as, the profile/family writes (§4.3).

### 4.2 Two clients, by context — and the "request path" reconciliation

| Trigger | Runs in | Client | Why |
| --- | --- | --- | --- |
| Onboarding commit | `createServerFn` handler (server) | `createServiceClient()` | Trusted backend job; `service_role` bypasses RLS and sets `user_id` explicitly (DB-design §8.2). Secret stays server-side. |
| First-load backstop | Finance route loader (browser/isomorphic) | `createBrowserClient()` | Authed/RLS; `user_id` explicit === `auth.uid()` passes `owner_all` WITH CHECK. **No secret** needed or allowed here. |

- **Reconciling with "`createServiceClient` — never on a request path."** `@nafios/finance`'s docs (client.ts, package CLAUDE.md) forbid the service client on a request path. EF3.9 §4.4 note 2 resolves the apparent tension: onboarding provisioning is a **trusted onboarding job**, not a data-serving request path — it runs server-side, sets `user_id` explicitly, and never returns another user's data. The *browser* backstop deliberately does **not** use the service client precisely because that would be a request/browser path (and would leak the secret).

### 4.3 Error handling — best-effort, non-blocking (settled)

A provisioning fault at **either** site is logged and swallowed; it never fails onboarding and never breaks a finance navigation. Rationale:

1. **The commit already happened.** `insert_user_profile` stamps `onboarding_completed_at` and commits *before* provisioning runs. Returning `{ ok:false }` afterward would misreport a *succeeded* onboarding, and the route guard (which keys off `onboarding_completed_at`) admits the user regardless — so blocking is incoherent with the ordering.
2. **It self-heals.** Provisioning is idempotent (EF3.9 count-guard) and the first-load backstop re-runs on next finance entry, so a miss is recovered without user action.
3. **Layering.** NafiOS is an app suite; a finance-side seed fault must not gate the *general* onboarding commit.

The swallow is **logged** (server-side `console.error` with `uid`), never silent — an operator can see repeated failures.

### 4.4 Env & bundle safety

`createServiceClient()` reads the secret `SUPABASE_SERVICE_ROLE_KEY` (finance CLAUDE.md env table). It must be set in `apps/web`'s server runtime (Netlify SSR function env). Because the only reference is inside the `createServerFn` handler (server-only code, tree-shaken out of the client bundle), the secret never ships to the browser. The backstop path references only `createBrowserClient()` (anon key + session), so the finance route bundle carries no secret.

### 4.5 Idempotency & cost

- Running Finish twice (onboarding retry) → the second `provisionDefaultCategories` no-ops (count-guard sees ≥1). Safe.
- The backstop runs once per **module entry** (route loader), not per navigation within finance. Its cost when already stocked is a single `count` query. Acceptable; a session-scoped "already checked" flag is an optional later optimisation, out of scope here.
- Both sites firing for the same user is harmless (idempotent) — exactly the belt-and-suspenders EF3.9 §4.5 sanctions.

---

## 5. Worked example — a new user, then an already-onboarded user

```
── New user, happy path ─────────────────────────────────────────────────────
1. Sign up → auth.users row → on_auth_user_created trigger makes profiles row.
2. Onboarding Steps 1–3 → Finish → completeOnboardingFn:
     insertUserProfile(...)  → family rows + onboarding_completed_at committed
     provisionDefaultCategories(createServiceClient(), uid)  → { seeded:true } (8 rows)
3. User opens /finance → route loader → provisionDefaultCategories(browser, uid)
     → { seeded:false } (already stocked) — cheap no-op.
4. EF3.14 picker → listCategories(browser) → the 8 defaults. Envelope creatable. ✅

── New user, provisioning throws at step 2 (DB blip) ────────────────────────
2'. insertUserProfile committed; provision throws → logged, swallowed → { ok:true }.
    User lands in the app normally (onboarding IS complete).
3'. User opens /finance → backstop provisions → { seeded:true }. Self-healed. ✅

── Already-onboarded user (finished before EF3.12 shipped) ──────────────────
   Has onboarding_completed_at set but ZERO categories.
   Opens /finance → backstop → { seeded:true } (8 rows). Picker no longer empty. ✅
```

---

## 6. Verification matrix

Wiring-level tests (mock the finance API surface; the finance-side behaviour is covered by EF3.9's own matrix). "No throw to caller" asserts the response, not the internal log.

| # | Action | Expected |
| --- | --- | --- |
| 1 | `completeOnboardingFn` happy path | `insertUserProfile` called, **then** `provisionDefaultCategories(serviceClient, uid)` called once, with the session's `uid`; returns `{ ok:true }` |
| 2 | Provisioning throws inside `completeOnboardingFn` | Still returns `{ ok:true }`; error logged; the throw does **not** propagate; `insertUserProfile` result unaffected |
| 3 | `insertUserProfile` itself throws (profile write fails) | Existing behaviour unchanged — returns `{ ok:false }`; provisioning is **not** attempted (runs only after the commit) |
| 4 | Onboarding retried (Finish pressed twice) | Second call's provisioning no-ops (EF3.9 count-guard); no duplicate categories |
| 5 | Finance route loader on entry | Calls `provisionDefaultCategories(browserClient, uid)` once; on `{ seeded:false }` proceeds normally |
| 6 | Backstop provisioning throws | Loader still resolves; navigation into `/finance` is **not** blocked |
| 7 | Onboarding call site — client used | Uses `createServiceClient()` (server-only); **never** referenced in client-bundled code |
| 8 | Backstop call site — client used | Uses `createBrowserClient()`; `createServiceClient` is **not** imported into the finance route |
| 9 | `bun run check` | Green across the workspace (`typecheck` + lint + tests); `@nafios/finance` resolves as a workspace dep of `apps/web` |

---

## 7. Acceptance criteria

- [ ] **AC1** — `@nafios/finance` is a `workspace:*` dependency of `apps/web`; imports use the barrel only (no deep `src/internal/` paths); the app takes on **no** direct `@supabase/*` dependency.
- [ ] **AC2** — `completeOnboardingFn` calls `provisionDefaultCategories(createServiceClient(), uid)` **after** `insertUserProfile` resolves, in its **own** `try/catch`; a provisioning fault is logged and **swallowed**, and the fn still returns `{ ok:true }` (matrix #1–#2). A failed profile write still short-circuits before provisioning (matrix #3).
- [ ] **AC3** — The finance module entry (interim `route.tsx` loader) calls `provisionDefaultCategories(createBrowserClient(), uid)` once per entry, idempotently, best-effort — a fault never blocks navigation (matrix #5–#6).
- [ ] **AC4** — Client-by-context is correct and bundle-safe: the service client appears **only** in the server-only onboarding handler; the browser client is used for the backstop; `SUPABASE_SERVICE_ROLE_KEY` is server-runtime only and never in the client bundle (matrix #7–#8, §4.4).
- [ ] **AC5** — No new domain/data code, **no** migration, no change to the finance API or the `category` table; EF3.12 is pure `apps/web` wiring over EF3.9's surface.
- [ ] **AC6** — `bun run check` is green across the workspace (matrix #9). This is the merge gate.

---

## 8. Notes / decisions

1. **This ticket is the "when" EF3.9 assigned to the auth layer.** EF3.9 owns the *what* + *how* + the idempotent guard; EF3.12 owns the *invocation* and nothing else. If the default list, ordering, or idempotency behaviour needs to change, that is an EF3.9 edit — never here.
2. **Best-effort, not blocking — because the commit precedes provisioning.** Documented in §4.3. The decisive reason is ordering: `onboarding_completed_at` is committed by `insertUserProfile` before provisioning runs, so a blocking failure would both misreport onboarding and be overridden by the route guard. Best-effort + idempotent backstop is the coherent choice.
3. **Two clients is a security boundary, not an inconvenience.** The `service_role` secret is usable only server-side. The browser backstop uses the authed client and works because the finance API sets `user_id` explicitly (= `auth.uid()`), satisfying `owner_all` RLS (EF3.9 §2.3, §8 note 4). Never import `createServiceClient` into a browser/route bundle.
4. **The backstop covers already-onboarded users.** Users who completed onboarding before EF3.12 have `onboarding_completed_at` set but zero categories; the onboarding call will never fire for them again. The first-load backstop is what stocks them (matrix worked-example, third case). This is why "onboarding + first-load" was chosen over "onboarding only."
5. **Interim route today; migrates with the real shell.** `apps/finance` does not exist yet; finance is interim in-shell routes (`apps/web/.../_protected/_app/finance/`). The backstop hooks the existing `route.tsx` loader. When the module-mount machinery / real finance shell lands ([EF3.10](EF3.10.md)/[EF3.11](EF3.11.md) and the module epic), the backstop hook moves to that entry loader — a mechanical relocation, same call.
6. **Suite-scaling caveat (noted, not solved here).** As more modules join the suite, hooking each module's provisioning into the *general* onboarding commit will not scale cleanly (onboarding would accrete per-module seeds). For M1, finance is the flagship and one call is fine. A generalised "post-onboarding provisioning" hook is a future platform concern, explicitly out of scope.

---

## 9. Definition of Done (PR-ready)

One PR in `apps/web`. Mergeable when all hold — no stubs, no TODOs:

- [ ] `@nafios/finance` added to `apps/web/package.json`; `completeOnboardingFn` and the interim finance `route.tsx` edited per §2; no other files touched.
- [ ] **All §7 acceptance criteria (AC1–AC6) pass**, including best-effort swallow with logging, correct client-by-context, and bundle safety.
- [ ] **`bun run check` is green across the workspace** — the merge gate.
- [ ] **Blocked on [EF3.9](EF3.9.md).** This PR imports `provisionDefaultCategories` / `listCategories` from `@nafios/finance`; it can only merge once EF3.9 has landed those on the barrel. Sequence: EF3.9 → EF3.12 → the FE tickets (EF3.10/EF3.11/EF3.13/EF3.14).
- [ ] No surface beyond §2 — no migration, no finance-API change, no domain/data code, no new package.
- [ ] The EF3.12 checkbox is ticked in `EF3.md` when merged. (Note: the epic's sub-issue list numbers EF3.12 as "New-ledger creation flow"; the **board** renumbered — that flow is board **EF3.11**, and this integration ticket takes the free board slot **EF3.12**.)

---

## Revision History

| Version | Date       | Author            | Changes |
| ------- | ---------- | ----------------- | ------- |
| 0.2     | 2026-07-09 | NafiOS Foundation | Added the explicit reciprocal link to [EF3.9](EF3.9.md) — a **Blocked by: EF3.9** marker in the header (EF3.9 carries the matching **Blocks: EF3.12**). No scope change; the hard dependency was already stated in the intro's *Depends on* block and §9. |
| 0.1     | 2026-07-09 | NafiOS Foundation | Initial task — **wire EF3.9's `provisionDefaultCategories` into `apps/web`**, the "when" EF3.9 §4.5 assigned to the (non-existent) auth/platform repo. Two triggers: the **primary** server-only call in `completeOnboardingFn` after the onboarding commit (`createServiceClient()`, trusted job), and an idempotent **browser first-load backstop** in the interim finance route (`createBrowserClient()`, authed) that also stocks already-onboarded users. **Error handling settled: best-effort/non-blocking** — a provisioning fault is logged + swallowed, `{ ok:true }` still returned, because `onboarding_completed_at` is already committed before provisioning runs (§4.3). Documents the two-client security boundary (service secret server-only; browser backstop authed via explicit `user_id` = `auth.uid()`), the `SUPABASE_SERVICE_ROLE_KEY` server-runtime/bundle-safety requirement, and the interim-route→real-shell migration. **Hard-blocked on EF3.9**; unblocks the FE tickets (EF3.10/EF3.11/EF3.13/EF3.14) that consume `listCategories`. Scopes OUT any migration, finance-API change, or domain/data code — pure `apps/web` wiring. AC1–AC6 + §6 matrix + §9 DoD (green `bun run check` as the merge gate). Board-vs-epic numbering note: board EF3.11 = the epic's "new-ledger flow"; this ticket takes the free board slot EF3.12. |
