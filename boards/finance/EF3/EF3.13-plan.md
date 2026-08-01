# EF3.13 — Implementation Plan

**[BE] Finance Home ledger-state read surface (active-ledger + Lead-Day), fully wired into the EF3.10 UI.**

Two halves:

1. **BE (the ticket proper):** compose the already-built primitives into a public read on `@nafios/finance` that returns the Finance-Home decision state for the logged-in user given a `today`.
2. **Integration (the user's ask):** replace EF3.10's injected/mocked seam with that real read, end-to-end, so `/finance` renders from live, RLS-scoped data — **client-side**, per ADR-0026.

---

## 0. The architectural decision that governs the wiring (settled — ADR-0026)

The wiring model is now recorded:

- **[ADR-0026 — Domain modules fetch data client-side; server functions are the shell's](../../../adr/0026-modules-client-side-data-server-fns-shell-only.md)** (Accepted, 2026-08-01), which **supersedes [ADR-0022](../../../adr/0022-tanstack-query-for-client-server-state.md) for domain-module data:**
  - **Module data is client-side.** Every domain module (Finance included) reads and writes its own data **directly from the browser** via a Supabase **browser client**, governed by **TanStack Query**. No server functions for module-domain data.
  - **Server functions are the shell's** (auth, route guards, onboarding) and kept minimal — each is a serverless invocation on prod.
  - **The browser client comes from `@nafios/*`, never raw `@supabase`.** `apps/web`'s "no direct `@supabase` imports" rule is unchanged: Finance uses `createBrowserClient()` from `@nafios/finance`.
  - **RLS is the security boundary** for module data (owner-isolation + composite-FK hardening, already enabled on every finance table). RLS-enabled is a precondition, not defense-in-depth.
  - **TanStack Query is adopted now** — EF3.13 mounts the shell's single `QueryClientProvider` and stands up the canonical `useQuery` example.

**Conclusion — client-side.** The Finance-Home read is **module-domain data** → by ADR-0026 it is a **client-side `useQuery`** against a finance **browser** client, resolving the calendar day with the **browser-local** clock (exactly EF3.10's `localTodayIso()`). No loader, no server function, no server-computed timezone.

**On the ticket's literal `createBrowserClient()`:** this now matches the ticket _verbatim_ — the finance browser client is precisely what EF3.13 asked for, and what `@nafios/finance` was built to expose (`packages/finance/src/index.ts`: _"the runtime client — Finance runs client-side… RLS applies"_). The BE read surface stays **client-agnostic** (takes a `FinanceClient`); only the _caller_ differs from an earlier server-side sketch.

---

## 1. What already exists (verified)

**`@nafios/finance` (`packages/finance/`)**

- `createBrowserClient(): FinanceClient` — public barrel export (`packages/finance/src/internal/client.ts`). The runtime client: reads the logged-in **browser** session, auto-refreshes, runs as the user (RLS applies). Takes no arguments. This is the client the read surface will be called with.
- `createLedgerRepository(client)` — internal, `packages/finance/src/internal/repositories/ledger.repo.ts`. Has `list(): Promise<LedgerHeader[]>` (chronological asc) and `findOngoing(): Promise<LedgerHeader | null>`. `LedgerHeader = Omit<MonthlyLedger, "envelopes">` — carries `month` + `status`, so `LedgerHeader[]` is structurally a `LedgerSummary[]`.
- `resolveCreationState({ today, leadDays, ledgers })` + `isWithinCreationWindow(today, leadDays)` — pure, `packages/finance/src/domain/creation-window.ts`. Returns `{ currentMonth, isWindowOpen, openable: { current, next }, rollForward }`. `today` is a `"YYYY-MM-DD"` string; `openable.current/next` are `Month | null`.
- `addMonths`, `monthOf`, `Month`, `LedgerStatus`, `FinanceDataError` — pure domain / error surface, already barrel-exported.
- Layering (`packages/finance/CLAUDE.md`): `src/domain/` (pure) → `src/internal/` (I/O). Repo + mapper stay **internal**; only the barrel (`src/index.ts`) is public. Factory idiom is `create*(client)`.
- Tests: mocked-client **unit** tests under `packages/finance/tests/unit/`; **live-DB** integration matrices at **repo-root `tests/integration/`** (`bun run test:integration`, `describe.skipIf(!HAS_ENV)`, two authed users A/B for RLS). Per-file coverage gate **≥ 90%** (`packages/finance/bunfig.toml`).

**`apps/web` (the EF3.10 UI + the shell)**

- `apps/web/src/features/finance/components/finance-home.tsx` — `FinanceHome({ seam })`; `const state = seam ?? deriveLedgerHomeState()`; branches on `state.hasActiveLedger` → `<LedgerDetailCard/>` vs `<LedgerStartCard isWithinLeadDay currentMonth nextMonth/>`.
- `apps/web/src/features/finance/lib/derive-ledger-home-state.ts` — the **mock seam**: `LedgerHomeState = { hasActiveLedger, isWithinLeadDay, currentMonth, nextMonth }`; `deriveLedgerHomeState()` runs `resolveCreationState({ today: localTodayIso(), leadDays: 7, ledgers: [] })` and hardcodes `hasActiveLedger: false`. **`localTodayIso()` (browser-local) is retained** — the client-side read uses it as-is.
- `apps/web/src/routes/_protected/_app/finance/index.tsx` — thin route; renders `<FinanceHome />`. No loader (and none is added).
- **`@tanstack/react-query` is NOT yet a dependency; no `QueryClientProvider` is mounted** (verified). EF3.13 introduces both (ADR-0026 §5) — this is the canonical-example work.
- **Env exposure gap (~~verified~~ CLOSED — W-0/R2):** `SUPABASE_URL` / `SUPABASE_ANON_KEY` were loaded into `process.env` for server functions only, **not** exposed to the client bundle, and `@nafios/supabase-core`'s browser factory reads `process.env.*` at call time. **Now closed** via a Vite `define` in `apps/web/vite.config.ts` that inlines both anon vars (public creds only — service-role/DATABASE_URL never defined; build-verified no client leak). See R2.
- **Session cookies (verify):** the shell's auth flow sets the Supabase session cookie via the server client; the `@supabase/ssr` browser client reads it from `document.cookie`. If those cookies were written `httpOnly`, the browser client sees no session and RLS returns nothing. Must be confirmed (R1).

---

## 2. Design decisions

### D1 — Return shape (superset that serves the ticket _and_ the UI)

The ticket's shape is `{ hasActiveLedger, isWithinLeadDay, openable }`. The EF3.10 UI consumes `{ hasActiveLedger, isWithinLeadDay, currentMonth, nextMonth }` where `currentMonth`/`nextMonth` are **always-present** CTA labels. `openable.current/next` are **nullable** (null when a month is already taken / out of window) — a _different_ concept from the label months. So the read returns a clean **superset**:

```ts
export interface FinanceHomeState {
  readonly hasActiveLedger: boolean; // ∃ ledger with status === 'ongoing'
  readonly isWithinLeadDay: boolean; // resolveCreationState(...).isWindowOpen
  readonly currentMonth: Month; // resolveCreationState(...).currentMonth (always present)
  readonly nextMonth: Month; // addMonths(currentMonth, 1) (always present)
  readonly openable: {
    readonly current: Month | null;
    readonly next: Month | null;
  };
}
```

This satisfies the ticket DoD (`hasActiveLedger`, `isWithinLeadDay`, `openable`) **and** replaces the EF3.10 `LedgerHomeState` one-for-one, so the web seam type becomes just `FinanceHomeState` imported from the barrel — one source of truth, no field drift.

### D2 — API surface: `createLedgerQueries(client)` factory

Match the package idiom (`create*(client)` returning an object). One query today; the object leaves room for the later composed ongoing-ledger read without another barrel churn. **Client-agnostic** — it takes a `FinanceClient`; whether that client is browser/authed/service is the caller's concern.

```ts
export interface LedgerQueries {
  /** Finance-Home decision state for the current user, given a caller-supplied
   *  "YYYY-MM-DD" today. Reads no clock (pure resolver does the day math). */
  getFinanceHomeState(today: string): Promise<FinanceHomeState>;
}
export function createLedgerQueries(client: FinanceClient): LedgerQueries;
```

Composition (one query via `list()`; `hasActiveLedger` derived from it, so no second `findOngoing()` round-trip):

```ts
const ledgers = createLedgerRepository(client); // internal — stays unexported
const list = await ledgers.list(); // LedgerHeader[] ⊇ LedgerSummary[]
const state = resolveCreationState({ today, leadDays: 7, ledgers: list });
return {
  hasActiveLedger: list.some((l) => l.status === "ongoing"), // 'ongoing' only (reconciling/settled don't count)
  isWithinLeadDay: state.isWindowOpen,
  currentMonth: state.currentMonth,
  nextMonth: addMonths(state.currentMonth, 1),
  openable: state.openable,
};
```

`FinanceDataError` from `list()` propagates unchanged (repo already classifies it; the `useQuery` error state branches on `code`).

### D3 — `today` is browser-local (the tz problem dissolves client-side)

Because the read runs **in the browser** (ADR-0026), it resolves the calendar day with the user's **actual local clock** — `localTodayIso()` from EF3.10, unchanged. There is no server-side "today," no `Asia/Singapore` fixing, and no SSR clock to reconcile: the query only runs client-side after hydration, so `new Date()` is the user's device time. This is _strictly better_ per-user-timezone accuracy than the earlier server-side sketch, and simpler (no override plumbing needed for correctness — the hook passes `localTodayIso()`; tests pass a fixed string).

### D4 — Client construction: `createBrowserClient()` from `@nafios/finance`, lazily (SSR-safe)

The read is called with `createBrowserClient()` from `@nafios/finance` — the app's client-side finance client, all through `@nafios/*` (no direct `@supabase/*`; ADR-0026 §3). Two correctness points:

- **Lazy singleton, browser-only.** `createBrowserClient` reads env at call time and (via `@supabase/ssr`) touches `document.cookie`, so constructing it at module scope would run during SSR and break. Construct it **lazily on first use** and memoize — a small `features/finance/lib/finance-client.ts` getter that builds once, only when the `queryFn` runs (queries don't execute during SSR). One browser client per app, reused across queries.
- **No finance-package change.** `createLedgerQueries` already accepts a `FinanceClient`, and `createBrowserClient()` returns exactly that. No new factory, no `asDb` assembly.

### D5 — Seam supplied by a `useQuery` hook; delete the mock

The seam now comes from a client-side query hook, not a loader or the mock. `deriveLedgerHomeState`/`localTodayIso` split: **`localTodayIso()` is kept** (the hook needs it) and moves to `features/finance/lib/`; **`deriveLedgerHomeState()` is deleted** (superseded by the real read). `FinanceHome`'s `seam` prop becomes **required** (the page supplies it from the hook; tests inject it). The `LedgerHomeState` type is superseded by `FinanceHomeState` from `@nafios/finance`.

---

## 3. BE implementation (`@nafios/finance`) — unchanged by the wiring flip

**New file — `packages/finance/src/internal/queries/ledger-queries.ts`**

- New `internal/queries/` dir (sibling of `commands/`, `repositories/`).
- Exports `FinanceHomeState`, `LedgerQueries`, `createLedgerQueries` (§D1/D2).
- Imports **internal** `createLedgerRepository` (stays unexported) + domain `resolveCreationState`, `addMonths`. No new I/O, no clock, no migration.
- `leadDays` constant `= 7` (module-local; "no finance-settings layer in EF3").

**Edit — `packages/finance/src/index.ts` (barrel)**

```ts
// Read surface — Finance Home state (EF3.13)
export {
  createLedgerQueries,
  type FinanceHomeState,
  type LedgerQueries,
} from "./internal/queries/ledger-queries";
```

Repo + mapper remain unexported (import-boundary rule stays green).

**Edit — `packages/finance/spec.md`** — add a "Data layer — Finance-Home read surface (EF3.13)" section documenting `createLedgerQueries` / `getFinanceHomeState(today)` and the `FinanceHomeState` contract (DoD: "read-surface contract documented on the barrel").

**Edit — `packages/finance/CLAUDE.md`** — add `internal/queries/ledger-queries.ts` to the Structure tree, the read surface to "Public API surface", and a line in the internal-layer boundary paragraph.

---

## 4. BE tests — unchanged by the wiring flip

**Unit — `packages/finance/tests/unit/ledger-queries.test.ts`** (mocked client; reuse the thenable query-builder stub idiom from `ledger.repo.test.ts`; `from().select().order()` resolves to `{ data: rows, error: null }`). Cover the four acceptance scenarios + boundary (≥ 90% per-file gate):

- **S1 — no ledgers:** `data: []` → `hasActiveLedger === false`; `isWithinLeadDay` tracks `isWithinCreationWindow(today, 7)`; `openable.current` = current month, `openable.next` per Lead-Day.
- **S2 — one `ongoing`:** row with `status:'ongoing'` → `hasActiveLedger === true`.
- **S3 — only non-ongoing:** `reconciling` / `settled` rows → `hasActiveLedger === false`.
- **Lead-Day boundary:** `today "2026-07-24"` → `isWithinLeadDay false`; `today "2026-07-25"` → `true` (July 31-day boundary, matching `creation-window.test.ts`).
- **openable/months:** assert `currentMonth`/`nextMonth`/`openable` for an in-window and an out-of-window `today`.
- **Error propagation:** repo returns `{ error }` → `getFinanceHomeState` rejects with `FinanceDataError` (thin — one assertion).

**Integration — `tests/integration/ledger-queries.test.ts`** (repo-root; `describe.skipIf(!HAS_ENV)`; two authed clients A/B via `asDb(createAuthedClient(token))`, mirroring `tests/integration/ledger.repo.test.ts`; cleanup via the service client). Drives the **public** `createLedgerQueries`; seeds via `createLedgerRepository(authedA).insert(...)` (the documented test-only relative import) or the service client:

- **S2 live:** seed A an `ongoing` ledger → `getFinanceHomeState(today).hasActiveLedger === true` against a real `monthly_ledger` row.
- **S4 RLS isolation:** seed B a ledger; A's `getFinanceHomeState(today)` never counts B's row (`owner_all` scoping). **This is the same RLS that now guards the direct browser read — the matrix is the proof the ADR-0026 security boundary holds.**

---

## 5. Web integration (`apps/web`) — client-side (ADR-0026)

**W-0 — Expose the Supabase anon creds to the client bundle** (unblocks the browser client; R2). Least-invasive option: a `define` in `apps/web/vite.config.ts` substituting `process.env.SUPABASE_URL` / `SUPABASE_ANON_KEY` into the client build (anon key is public by design). Alternative: rename to `VITE_SUPABASE_*` and read `import.meta.env` in `@nafios/supabase-core`'s browser factory (touches a shared package — heavier). Pick the `define` path unless the reviewer prefers the rename. Verify the browser client constructs and authenticates in a running `/finance`.

**W-1 — Stand up the single `QueryClient` + SSR-query integration in the shell** (the canonical example; ADR-0026 §5).

- Add `@tanstack/react-query` + `@tanstack/react-router-ssr-query` to `apps/web/package.json`.
- In `getRouter()` (`apps/web/src/router.tsx`): create one `QueryClient`, pass `context: { queryClient }` to `createRouter`, then call `setupRouterSsrQueryIntegration({ router, queryClient })` before returning. This is the current official TanStack Start + Query pattern — it wires the provider + SSR hydration itself, so there is **no hand-mounted `<QueryClientProvider>`**. Switch `__root.tsx` to `createRootRouteWithContext<{ queryClient: QueryClient }>()`. One client app-wide; future loaders _may_ prime the cache (EF3.13 doesn't). See R5.

**W-2 — Finance browser client (lazy singleton) — `apps/web/src/features/finance/lib/finance-client.ts`**

```ts
import { createBrowserClient, type FinanceClient } from "@nafios/finance";

let client: FinanceClient | undefined;
/** Lazy so it never constructs during SSR (reads env + document.cookie). */
export function getFinanceClient(): FinanceClient {
  client ??= createBrowserClient();
  return client;
}
```

**W-3 — The read hook — `apps/web/src/features/finance/hooks/use-finance-home-state.ts`**

```ts
import { createLedgerQueries, type FinanceHomeState } from "@nafios/finance";
import { useQuery } from "@tanstack/react-query";
import { getFinanceClient } from "../lib/finance-client";
import { localTodayIso } from "../lib/local-today-iso"; // kept from EF3.10

export function useFinanceHomeState() {
  const today = localTodayIso(); // browser-local (D3)
  return useQuery<FinanceHomeState>({
    queryKey: ["finance", "home", today],
    queryFn: () =>
      createLedgerQueries(getFinanceClient()).getFinanceHomeState(today),
  });
}
```

**W-4 — `apps/web/src/features/finance/components/finance-home.tsx`**

- `seam` prop **required**, typed `FinanceHomeState` (import from `@nafios/finance`); drop the `?? deriveLedgerHomeState()` fallback.
- Cards keep reading `seam.hasActiveLedger` / `isWithinLeadDay` / `currentMonth` / `nextMonth` (unchanged; `openable` reserved).

**W-5 — `apps/web/src/routes/_protected/_app/finance/index.tsx`** — the page calls the hook and renders loading / error / ready. No loader.

```tsx
function FinanceHomePage() {
  const { data: seam, isPending, isError } = useFinanceHomeState();
  // isPending → skeleton (hero-card footprint); isError → one generic error card + retry
  //   (a read only ever yields FinanceDataError.code === 'unknown' — no code matrix; see R3);
  // ready → <FinanceHome seam={seam} />  (+ the existing Templates panel column)
}
```

Loading state is now **mandatory** (ADR-0026: module routes don't SSR their data). Keep it minimal — a skeleton consistent with EF3.10's card; the finished empty/error UI is EF3.10's domain (R3).

**Delete** — `apps/web/src/features/finance/lib/derive-ledger-home-state.ts` and `apps/web/tests/unit/derive-ledger-home-state.test.ts` (superseded). **Keep** `localTodayIso` (extract to `features/finance/lib/local-today-iso.ts` if it currently lives inside the deleted file).

**Edit — `apps/web/CLAUDE.md`** — note the finance route now hydrates **client-side** via TanStack Query + the finance browser client (ADR-0026); document the new `QueryClientProvider` in the shell and that server functions stay shell-only. Add `features/finance/hooks/` + `features/finance/lib/finance-client.ts`.

---

## 6. Web tests

**Edit — `apps/web/tests/unit/finance-home.test.tsx`**

- `makeSeam` returns `FinanceHomeState` (import type from `@nafios/finance`; add `openable: { current: monthOf("2026-07-01"), next: null }` to the default).
- Change the "default seam / no seam injected" test to inject a seam (seam is now required). Other display-decision / Lead-Day / placeholder assertions stand. `FinanceHome` itself takes no query dependency (pure props), so no provider wrapper needed for this test.

**New — `apps/web/tests/unit/use-finance-home-state.test.tsx`** (the hook, with a mocked finance browser client)

- Mock `@nafios/finance`'s `createBrowserClient` to return a **list-capable** thenable builder (`from().select().order()` → `{ data: rows, error: null }`) — the finance analogue of the shared onboarding `from` mock, kept **local** to this test (the "EF3.13 will need more" the harness memo anticipated; the `tests/setup.ts` `asDb` passthrough still applies since the real `createLedgerQueries` + resolver run).
- Render the hook with a `QueryClientProvider` wrapper (a small `renderHook` helper with a fresh `QueryClient`, `retry: false`). Assert the mapped seam: `hasActiveLedger` for rows with/without an `ongoing` row; `isWithinLeadDay` at the boundary; `currentMonth`/`nextMonth`. (The hook uses `localTodayIso()`; to keep the boundary assertions deterministic, either stub the date or assert shape-only and cover the exact-boundary mapping in the BE unit test.)
- Error path: builder returns `{ error }` → hook surfaces `isError` with a `FinanceDataError`.

**New (optional) — `apps/web/tests/unit/finance-index-route.test.tsx`** — **not needed for coverage** (the route file lives under `routes/`, which `apps/web/bunfig.toml` excludes from the gate; see R4). Keep it only as behaviour coverage: render `FinanceHomePage` under a `QueryClientProvider` + mocked `createBrowserClient`; assert the loading state, then the ready state renders `<FinanceHome>`; assert the error state. Otherwise drop it.

**Verify** — `apps/web/bunfig.toml` per-file coverage threshold; ensure `finance-client.ts`, `use-finance-home-state.ts`, and the route file meet it (the tests above cover both branches).

---

## 7. Risks / open decisions

| #   | Item                                                                                                                                                                                                  | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | **Session cookie readability by the browser client** — if auth wrote the session cookie `httpOnly`, `@supabase/ssr`'s browser client sees no session and RLS returns nothing (the whole model fails). | **RESOLVED (code-level).** The session cookie is **not** `httpOnly`: (1) the app never forces it — `server-cookies.ts:26` forwards `options.httpOnly` from Supabase, no hardcode, and a repo-wide grep found no override; (2) `@supabase/ssr@0.6.1` `DEFAULT_COOKIE_OPTIONS` is `httpOnly: false` (`constants.js:7`; `sameSite:"lax"`, `path:"/"`) — by design, so the same cookie is readable by both server and browser clients. The `httpOnly:true` in `server-cookies.test.ts` is a pass-through fixture, not production behavior. **Existing client-side retrieval path already exists** (unused in web): `createBrowserClient()` (supabase-core → auth-core → `@nafios/finance`) — the `@supabase/ssr` browser client reads the session from `document.cookie` and auto-refreshes; no session-fetch code to write. Remaining: a **live** `/finance` confirmation, which is gated on W-0 (anon creds not yet in the client bundle), not on any cookie change. |
| R2  | **Anon creds not in the client bundle** (verified)                                                                                                                                                    | **RESOLVED (code-level).** Closed via a Vite `define` in `apps/web/vite.config.ts` inlining `process.env.SUPABASE_URL` / `SUPABASE_ANON_KEY` (public anon creds only; **never** service-role / DATABASE_URL). Verified by a prod build: service-role key appears in **0** client-bundle files (no leak); the anon URL is inlined in the server bundle (proves the `define` is active — a top-level `define` applies to every build environment incl. client). The anon creds read **0** in the client bundle **today only because nothing calls `createBrowserClient()` yet** (no client caller ⇒ the `process.env.*` read is tree-shaken out); they inline into the client bundle once W-2/W-3 add a caller. Remaining: the **live** "constructs + authenticates in a running `/finance`" check, coupled to W-2/W-3/W-5 + a logged-in session (folds in with R1), not to any further config change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| R3  | Loading / error UX                                                                                                                                                                                    | **RESOLVED (decision).** Not a blocking risk — ambiguity removed; the implementation is ordinary W-5 work. **Loading:** one `<Skeleton>` (`@nafios/ui/components/ui/skeleton`, verified present) sized to the hero-card footprint in the left column — the Templates panel + Pending/Settled placeholders already render statically, so only the hero region needs a placeholder. **Error:** a **single generic** error card (`Alert`, or a `Card` + a `Try again` calling `refetch`). Key simplification: `getFinanceHomeState` is a **read** (`list()` → SELECT), and of the six `FinanceDataError` codes only the write-path ones exist (`duplicate_month`/`ongoing_exists`/`check_violation`/`foreign_key_violation`/`not_null_violation`); a SELECT under RLS returns filtered rows (never 42501), so a read realistically yields only `unknown`. ⟹ **no code matrix to branch** — detect `FinanceDataError` → one generic message. Finished-state polish stays EF3.10's.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| R4  | Coverage gate on new web files (`finance-client.ts`, hook, route)                                                                                                                                     | **RESOLVED (config-confirmed).** `apps/web/bunfig.toml`: `coverageThreshold = 0.9`, enforced only under `--coverage`. Crucially `coveragePathIgnorePatterns` includes `**/routes/**` → the route file `finance/index.tsx` is **exempt** from the gate. Only two files are counted — `features/finance/lib/finance-client.ts` + `features/finance/hooks/use-finance-home-state.ts` (plus the extracted `local-today-iso.ts`) — all exercised transitively by §6's `use-finance-home-state.test.tsx` (its `queryFn` runs `getFinanceClient()` + `localTodayIso()`; bun measures line/function coverage, so one exercising call clears each — no double-call test needed). ⟹ the §6 `finance-index-route.test.tsx` is **not** required for the gate (routes/ exempt) — keep it only as behaviour coverage, or drop it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| R5  | `QueryClientProvider` + Router/Query integration placement                                                                                                                                            | **RESOLVED (verified against the installed version line).** The current official integration is `setupRouterSsrQueryIntegration` from `@tanstack/react-router-ssr-query` (confirmed against TanStack's `start-basic-react-query` example for Router ~1.170 / Start ~1.168, matching our deps) — it wires the provider + SSR dehydration/hydration itself, so there is **no hand-mounted `<QueryClientProvider>` in `__root`**. Exact wiring: (1) add deps `@tanstack/react-query` + `@tanstack/react-router-ssr-query`; (2) in `getRouter()` (`apps/web/src/router.tsx`) create `const queryClient = new QueryClient()`, pass `context: { queryClient }` to `createRouter`, then `setupRouterSsrQueryIntegration({ router, queryClient })` before `return router`; (3) `__root.tsx`: `createRootRoute` → `createRootRouteWithContext<{ queryClient: QueryClient }>()` (type from `@tanstack/react-query`). Reconciles ADR-0026 §5 "single `QueryClientProvider`": the integration provides exactly one client app-wide — that intent is met by the router integration, not a literal JSX provider. Unit/hook tests still wrap with their own `QueryClientProvider` (independent of the router).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| R6  | Deleting the mock seam removes an injectable default                                                                                                                                                  | **RESOLVED (blast radius verified).** Repo-wide grep confirms `deriveLedgerHomeState` / `LedgerHomeState` / `localTodayIso` have **no consumers outside** the finance slice: the lib file + its test (both deleted, W-6), `finance-home.tsx` (W-4: seam required, type → `FinanceHomeState`), `finance-home.test.tsx` (W-7: swap the type import, add `openable` to `makeSeam`, change the one "no seam injected" test to inject one), and the route `finance/index.tsx` (W-5: it currently renders `<FinanceHome />` with no seam → will pass the hook's seam). `localTodayIso` has a **single caller** (the deleted file) → safe to extract to `local-today-iso.ts` and reuse from the hook (covered transitively by the hook test). Nothing outside the plan is touched.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

---

## 8. Acceptance-criteria & DoD traceability

| Ticket item                                                                                                          | Covered by                                                                                              |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| AC S1 no ledgers → `hasActiveLedger false`, `isWithinLeadDay = isWithinCreationWindow(today,7)`, `openable` per rule | Unit S1 + boundary                                                                                      |
| AC S2 `ongoing` → `hasActiveLedger true`                                                                             | Unit S2 + Integration S2 (live row)                                                                     |
| AC S3 only non-ongoing → `hasActiveLedger false`                                                                     | Unit S3                                                                                                 |
| AC S4 RLS isolation                                                                                                  | Integration S4 (also the ADR-0026 security-boundary proof)                                              |
| DoD: public read on barrel returns `{ hasActiveLedger, isWithinLeadDay, openable }` given `today`                    | §3 `createLedgerQueries` + barrel export (superset incl. `currentMonth`/`nextMonth`)                    |
| DoD: `hasActiveLedger` iff `status==='ongoing'`                                                                      | `list.some(l => l.status === 'ongoing')`                                                                |
| DoD: `isWithinLeadDay`/`openable` via existing resolver, `leadDays=7`                                                | §D2 composition                                                                                         |
| DoD: repo + mapper stay unexported; import-boundary green                                                            | §3 (barrel exports the query only)                                                                      |
| DoD: unit tests (no ledgers / ongoing / only non-ongoing / Lead-Day boundary)                                        | §4 unit                                                                                                 |
| DoD: integration (live-DB lane, `skipIf`) RLS + real row                                                             | §4 integration                                                                                          |
| DoD: per-file coverage ≥ 90% on new files                                                                            | §4 + §6                                                                                                 |
| DoD: read-surface contract documented on barrel                                                                      | §3 `spec.md` + `CLAUDE.md`                                                                              |
| DoD: `bun run check` green                                                                                           | §9 gate                                                                                                 |
| **Integration (user ask):** EF3.10 seam swapped for the real read                                                    | §5 (`useQuery` → finance browser client → barrel read → `<FinanceHome seam>`), client-side per ADR-0026 |

---

## 9. Execution checklist (ordered)

**Verify-first**

- [x] R1. **Closed (code-level).** Session cookie is not `httpOnly` — `@supabase/ssr@0.6.1` defaults `httpOnly: false` (`constants.js:7`) and the app never overrides it (`server-cookies.ts:26` forwards it as-is; no repo override). Client-side retrieval path (`createBrowserClient()` → browser client reads `document.cookie`) already exists. Live `/finance` confirmation folds into W-0 (needs anon creds in the bundle first), not a cookie change.

**BE** (client-agnostic read surface — unchanged from the pre-ADR-0026 plan)

- [ ] B-1. Add `packages/finance/src/internal/queries/ledger-queries.ts` (§3).
- [ ] B-2. Barrel export in `packages/finance/src/index.ts` (§3).
- [ ] B-3. Unit test `packages/finance/tests/unit/ledger-queries.test.ts` (§4).
- [ ] B-4. Integration test `tests/integration/ledger-queries.test.ts` (§4).
- [ ] B-5. Docs: `packages/finance/spec.md` + `packages/finance/CLAUDE.md` (§3).

**Web** (client-side wiring — ADR-0026)

- [x] W-0. Expose anon URL+key to the client bundle (Vite `define` in `apps/web/vite.config.ts`) — done + build-verified (no service-role leak; `define` active). Live `/finance` construct+authenticate check pending W-2/W-3/W-5 (§5, R2).
- [ ] W-1. Add `@tanstack/react-query` + `@tanstack/react-router-ssr-query`; in `getRouter()` create the `QueryClient`, pass `context: { queryClient }`, call `setupRouterSsrQueryIntegration`; `__root` → `createRootRouteWithContext` (§5, R5).
- [ ] W-2. `features/finance/lib/finance-client.ts` — lazy browser-client singleton (§5).
- [ ] W-3. `features/finance/hooks/use-finance-home-state.ts` — the `useQuery` hook (§5).
- [ ] W-4. `finance-home.tsx`: seam required, type `FinanceHomeState` (§5).
- [ ] W-5. `finance/index.tsx`: call the hook, render loading/error/ready (§5).
- [ ] W-6. Delete `derive-ledger-home-state.ts` (+ its test); keep/extract `localTodayIso` (§5).
- [ ] W-7. Web tests: update `finance-home.test.tsx`; add hook test (+ optional route test) (§6).
- [ ] W-8. `apps/web/CLAUDE.md` note (client-side data + shell `QueryClientProvider`); verify web coverage config (R4).

**Gate**

- [ ] G-1. `bun run check` (typecheck + coverage + lint + format + verify) green.
- [ ] G-2. `bun run test:integration` green locally where Supabase env is present (skips cleanly otherwise).
- [ ] G-3. Reviewer sign-off on ADR-0026 direction + R1 (cookie) + W-0 (env exposure) approach.

---

## 10. Out of scope (unchanged from the ticket)

- The composed ongoing-ledger read **with envelopes + metrics** (COL / Health Margin / ASM) — a separate ticket.
- Roll-forward warning banner (`rollForward.active` exists on the resolver; not surfaced here).
- Finance-settings / configurable `leadDays` (fixed at 7).
- **Supabase Realtime** — ADR-0026 makes a browser client + Query cache the substrate for it (subscription → `invalidateQueries` for live cross-session sync), but no realtime subscription ships in EF3.13. The create-ledger mutation (`useMutation` + invalidation) is the natural next client-side write.
- New migration / table (EF1 ships `monthly_ledger` + owner RLS; EF3.6 ships the repo).
