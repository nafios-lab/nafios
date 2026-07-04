# EF3.9 — Default-category catalog + per-user provisioning API

> - `M1`
> - `type:feature`
> - `module:finance`
> - `area:domain` · `area:data`
> - `P0`
> - `size:S`
> - **Epic:** EF3 — Get started: open your first ledger & track it with manual envelopes

> **This ticket is self-contained.** Everything needed to give a **brand-new user a stocked category list** — the pure **default-category catalog** (`src/domain/`), a minimal **category repository** (count + bulk-insert + list + the row↔domain mapper), the **`provisionDefaultCategories(client, userId)`** onboarding API, and the runtime **`listCategories(client)`** read the envelope picker consumes — is in this file. Stack: **Supabase JS SDK** (`@supabase/supabase-js`) via EF2.2's client factories, typed from `@nafios/db`. The catalog is pure and lives in `src/domain/`; the repository/provisioning/read live in the **data layer** (`src/internal/`) — the only layer where Supabase / `@nafios/db` may appear. **No ORM / no Drizzle.**
>
> **The mechanism, settled (resolves the EF3 epic's open question).** The epic left it open — *"a DB trigger on user creation, or an app-side seed-on-first-load… the mechanism choice is settled inside EF3.9."* **Decision:** provisioning is a **finance-owned TypeScript API** that the **auth/onboarding package imports and calls** for each new user, as a trusted backend job. The logic belongs to finance (its catalog, its idempotency, its table) — the auth layer owns only the *when* (one call in the onboarding flow). This keeps finance's default list out of platform onboarding code, testable with EF3.6's harness, and never touches the Supabase-managed `auth.users` schema.
>
> **This ticket adds NO migration — and EF3 therefore adds ZERO migrations.** Categories are **per-user rows** the user can rename, reorder, and **delete** (finance-domain-spec §3; RFC-008), the `category` table already exists (EF1.2), and provisioning is plain INSERTs via the SDK. **This supersedes the "one migration" framing** carried in the epic's Data-section header, in EF3.6 §8 note 3, in EF3.7 §4.2/§8 ("EF3's one migration = the EF3.9 seed"), and in EF3.8 — all of which should be corrected to "EF3 adds no migration" (§8 note 3). EF3.7's atomicity conclusion (ordered writes + compensation, no RPC) is unaffected; only its "we've already spent our one migration" rationale needs a wording tweak.
>
> **This is the THIRD `src/internal/` repository.** It **reuses verbatim** the data-layer foundations EF3.6 established: the row↔domain **mapper** pattern, the **`FinanceDataError` + SQLSTATE→code** classifier (reused unextended), and the two-user **integration-test harness** (local Supabase). It is simpler than EF3.7/EF3.8 — provisioning takes a `userId`, not free user input, so there is **no `{ ok:false }` rejection union**: it either seeds, no-ops (already stocked), or throws `FinanceDataError` on a DB fault.
>
> **Depends on:**
>
> - **EF1.2** (the `category` table) — its columns (`id`, `user_id` default `auth.uid()` / FK CASCADE, `name varchar(80)`, `display_order integer default 0`, `color varchar(32)` null, `created_at`, `updated_at`), the `set_category_updated_at` moddatetime trigger, the `idx_category_user_order` index, and the `owner_all` RLS policy are the exact surface this layer reads/writes. **No `UNIQUE(user_id, name)`** exists (EF1.2 §13 #3) — idempotency is a **count-guard**, not `ON CONFLICT` (§4.3). EF1.2 §13 #5 explicitly defers "default-category seeding" to "E2.5 / E3" — **this ticket is that owner.**
> - **EF2.2** (client factories) — the provisioning API is called by the auth layer as a **trusted backend job** via **`createServiceClient()`** (bypasses RLS; per DB-design §8.2 it **must set `user_id` explicitly** — which is why the API takes an explicit `userId`, §2.3). The runtime read uses **`createAuthedClient()`** (RLS-scoped). Both are the `FinanceClient` alias.
> - **EF3.6** (ledger repository + data foundations) — **reuses** `FinanceDataError` / `mapPostgrestError` and the mapper/harness patterns; does not re-derive them. The category repository is the **third** repository on those foundations (after the ledger repo EF3.6 and the envelope repo EF3.8), and needs **no** classifier extension (a category write has no user-facing FK — `user_id` is always valid).
>
> **Consumed by:**
>
> - **The auth / onboarding package** (primary) — `import { createServiceClient, provisionDefaultCategories } from "@nafios/finance"` and calls `provisionDefaultCategories(createServiceClient(), newUserId)` as one step in the new-user onboarding flow (story-map S1: *"my workspace comes pre-loaded with a sensible default category set"*). This ticket ships the finance-side API + the integration contract (§4.5); wiring the call into the onboarding flow is a coordinated edit in the auth/platform repo, not finance code.
> - **EF3.14** (manual envelope CRUD + status UI) — the add/edit form's **category picker** lists the user's categories via **`listCategories(authedClient)`**; the chosen id becomes EF3.8's `CreateEnvelopeInput.category`. Because onboarding provisioned them, the picker is never empty and EF3.8's `category_id` FK (`RESTRICT`) resolves.
> - **EF3.13** (ongoing-ledger view) — groups envelopes **by category**; labels + order come from these rows.
> - **EF3.8** (envelope commands) — already assumes "a category the user owns (provisioned by EF3.9)"; this ticket makes that true. A bad/unowned category still throws `foreign_key_violation` there — provisioning removes the *common* cause (an empty set), not the FK guard.
>
> **Build-order & PR readiness.** The **third `src/internal/` feature** + one pure `src/domain/` catalog. PR-able once **EF1.2** (the table), **EF3.6** (data foundations), and **EF2.2** (client factories) are merged — **independent of EF3.7/EF3.8** (no ledger, no envelope, no money). Its tests are **integration tests against a local Supabase** (two seeded users, reusing EF3.6's harness); `bun run check` runs them (§9). It adds **no migration** (§4.4).
>
> **Assumes EF2 is done** (the `@nafios/finance` package shell — `src/domain/` + `src/internal/` layers, the eslint import-boundary rule, the authed/service client factories, green `bun run check`).

---

## 1. What you're building

Three things — one pure, two data:

1. **The default-category catalog** (`src/domain/`, pure, zero I/O) — `DEFAULT_CATEGORIES`, the canonical seed list from the domain spec (§4.1), and the `Category` domain type persisted rows decode to. The **single source of truth** for the default set; nothing hardcodes the list in SQL or in the auth package.

2. **The category repository** (`src/internal/`) — `createCategoryRepository(client)` returning a `CategoryRepository`: `countForUser(userId)`, `insertManyForUser(userId, inputs)`, `listByUser()`. Each maps rows to `Category` and raw SDK errors to `FinanceDataError`. It carries the **category mapper** (row ↔ `Category`). No enum, no money, no status seam — the simplest repository in the package. The `*ForUser(userId)` methods set/filter `user_id` **explicitly**, so they are correct under a **service client** (RLS bypassed — the onboarding path) as well as an authed one.

3. **The onboarding API + the picker read** (`src/internal/`) — **`provisionDefaultCategories(client, userId)`**, idempotent: if `userId` already has ≥1 category it no-ops and returns them; otherwise it inserts `DEFAULT_CATEGORIES` as that user's rows (`user_id = userId`, explicit) and returns them. And **`listCategories(client)`**, the runtime authed read the picker (EF3.14) and grouping (EF3.13) consume.

Framework-thin TypeScript. The repository adds **no business rule** (a data primitive, like EF3.6/EF3.8). Provisioning adds exactly one rule — the **idempotency count-guard** — and reads the list from the pure catalog; it re-derives nothing.

**Why it exists — the problem it solves:**

A manual envelope **requires** a category — EF1.6 makes `envelope.category_id` a `NOT NULL` FK with `ON DELETE RESTRICT`, and EF3.8's `createEnvelope` throws `foreign_key_violation` for an absent/unowned one. So a brand-new user with **zero categories cannot create a single envelope** — the entire track-a-month loop (story-map S4) is blocked at line one. The fix is to make sure every new user starts **stocked**: the eight default categories from the user's real sheet, present the moment they enter NafiOS (story-map S1).

The subtlety is *who owns the list and how it lands*. Categories are **not** shared reference data — the spec makes them **user-owned and fully mutable**: the user renames, reorders, recolors, and **deletes** them (finance-domain-spec §3; RFC-008 keeps "Set-Asides" only as a *seed name*). And EF1.2 enforces this physically — `user_id NOT NULL` + `owner_all` RLS mean a category is only ever visible to, and editable by, its owner. So there is no global category row; the seed must write **each user their own copy**. This ticket pins that in one place the **finance module owns**: a pure catalog that is the source of truth, and a `provisionDefaultCategories(client, userId)` API the **auth/onboarding layer calls once per new user** — running as a trusted backend job that sets `user_id` explicitly, exactly the pattern the DB design sanctions for seeds (§8.2).

> **Cross-ticket decision (settles the EF3 epic's open mechanism).** Provisioning is a **finance-owned TS API invoked by the auth package at onboarding** — not a DB trigger, not a lazy seed-on-first-load, not a list embedded in platform code. Finance owns *what* (the catalog) and *how* (idempotent insert); the auth layer owns *when* (one call in onboarding). Consequence: **EF3 adds no migration** — superseding the "one migration" wording in the epic, EF3.6, EF3.7, and EF3.8 (§8 note 3).

---

## 2. Public API / contract

Exact TS signatures. `provisionDefaultCategories`, `listCategories`, the `Category` / `ProvisionCategoriesResult` types, and the `DEFAULT_CATEGORIES` / `DefaultCategory` catalog are the **app-facing surface** and are **barrel-exported** from `src/index.ts`. The `CategoryRepository` factory + the mapper stay **internal**. `FinanceDataError` / `FinanceDataErrorCode` are already barrel-exported (EF3.6); `createServiceClient` / `createAuthedClient` / `FinanceClient` are already barrel-exported (EF2.2).

### 2.1 The domain catalog + type (`src/domain/`, pure)

```ts
// src/domain/category.ts

/** A persisted category, decoded from a `category` row. User-owned, fully mutable
 *  (rename / reorder / recolor / delete) — categories are labels, no semantics
 *  (finance-domain-spec §3). `user_id`/`created_at`/`updated_at` are NOT surfaced. */
export interface Category {
  readonly id: string;
  readonly name: string;
  readonly displayOrder: number; // -> display_order
  readonly color: string | null; // hex or token; null = unset
}

// src/domain/default-categories.ts

/** One entry in the canonical seed list. `color` is omitted — defaults ship uncolored
 *  (recolor is a later reference-data capability, out of scope in EF3). */
export interface DefaultCategory {
  readonly name: string;
  readonly displayOrder: number;
}

/** The canonical default category set (finance-domain-spec §3 "Categories (default set)").
 *  Source of truth for provisioning — no SQL, and no auth-package code, hardcodes this list.
 *  Order is 0-based (the spec's 1–8 numbering is a display default, not a payment priority).
 *  PROVISIONAL: expected to be tuned during development (EF3 epic Notes). */
export const DEFAULT_CATEGORIES: readonly DefaultCategory[];
```

### 2.2 The category repository (internal)

```ts
import type { Category } from "../../domain/category";
import type { FinanceClient } from "../client"; // EF2.2
// reuses FinanceDataError from ../errors (EF3.6)

/** Fields to insert a category. `user_id` is supplied by the repository method (explicit —
 *  §4.2), never by the caller here; `id`, `created_at`, `updated_at` are DB defaults. */
export interface NewCategory {
  readonly name: string;
  readonly displayOrder?: number; // -> display_order, default 0
  readonly color?: string | null; // default null
}

export interface CategoryRepository {
  /** Count the categories owned by `userId`. Filters user_id EXPLICITLY, so it is correct
   *  under a service client (RLS bypassed) and an authed one. The idempotency guard's input. */
  countForUser(userId: string): Promise<number>;

  /** Bulk-insert categories owned by `userId` (user_id set EXPLICITLY — service/trusted-job
   *  safe, DB-design §8.2). Returns the created rows. Throws FinanceDataError on a DB fault. */
  insertManyForUser(userId: string, inputs: readonly NewCategory[]): Promise<Category[]>;

  /** The AUTHED caller's own categories under RLS, ordered by display_order asc then name asc.
   *  [] when they have none. The runtime picker read (do NOT call on a service client). */
  listByUser(): Promise<Category[]>;
}

/** Construct a category repository bound to a FinanceClient (EF2.2). */
export function createCategoryRepository(client: FinanceClient): CategoryRepository;
```

### 2.3 The onboarding API + the picker read (app-facing)

```ts
import type { Category } from "../../domain/category";
import type { FinanceClient } from "../client"; // EF2.2

/** Outcome of provisioning. `seeded` is true iff this call inserted the defaults; false means
 *  the user already had ≥1 category (no write). `categories` is always the user's current set. */
export interface ProvisionCategoriesResult {
  readonly seeded: boolean;
  readonly categories: Category[];
}

/**
 * Idempotently give `userId` the default category set. Called by the AUTH/ONBOARDING layer as a
 * trusted backend job — pass a SERVICE client (EF2.2 createServiceClient) so RLS is bypassed and
 * `user_id` is set explicitly (DB-design §8.2). If the user already owns ≥1 category → no-op,
 * returns { seeded:false, categories:<existing, ordered> }; otherwise inserts DEFAULT_CATEGORIES
 * as that user's rows → { seeded:true, categories:<new, ordered> }. Takes a userId, not free user
 * input → no rejection union; throws FinanceDataError on a DB fault only.
 * (Also correct with an authed client whose auth.uid() === userId — the explicit user_id then
 *  simply matches the RLS WITH CHECK.)
 */
export function provisionDefaultCategories(
  client: FinanceClient,
  userId: string,
): Promise<ProvisionCategoriesResult>;

/** The AUTHED caller's categories, ordered by display_order then name. The picker source for
 *  EF3.14 and the grouping source for EF3.13. Thin passthrough to the repository's listByUser. */
export function listCategories(client: FinanceClient): Promise<Category[]>;
```

---

## 3. Package placement, layer & exports

**Catalog + type** land in `src/domain/` (pure, zero I/O). **Repository + provisioning + read** land in `src/internal/` (the only layer that may import `@supabase/supabase-js` / `@nafios/db`; it may import `src/domain/`).

```
packages/finance/
├── src/
│   ├── index.ts                                   # barrel: + Category, DefaultCategory, DEFAULT_CATEGORIES,
│   │                                              #   provisionDefaultCategories, ProvisionCategoriesResult, listCategories
│   ├── domain/
│   │   ├── category.ts                            # Category type                                   ← this ticket
│   │   └── default-categories.ts                  # DefaultCategory, DEFAULT_CATEGORIES (pure)       ← this ticket
│   └── internal/
│       ├── client.ts                              # FinanceClient, createAuthedClient/createServiceClient (EF2.2)
│       ├── errors.ts                              # FinanceDataError + mapPostgrestError (EF3.6) — reused as-is
│       ├── mappers/
│       │   └── category-mapper.ts                 # row ↔ Category                                  ← this ticket
│       ├── repositories/
│       │   └── category-repository.ts             # createCategoryRepository / CategoryRepository   ← this ticket
│       └── provisioning/
│           └── provision-default-categories.ts    # provisionDefaultCategories, listCategories      ← this ticket
└── tests/
    └── integration/
        ├── category-repository.test.ts            # §6.1 matrix (reuses EF3.6's harness)            ← this ticket
        └── provision-default-categories.test.ts   # §6.2 matrix                                     ← this ticket
```

- **Reuses EF3.6's foundations; extends nothing.** The mapper copies EF3.6's one-function-per-direction shape; `FinanceDataError` / `mapPostgrestError` are imported, not re-declared, and need **no** new SQLSTATE branch (a category insert has no user-facing FK — `user_id` is validated by RLS/`NOT NULL`, not a user-supplied FK like EF3.8's `category_id`).
- **Two client contexts, one API surface.** Provisioning is designed for a **service client** (onboarding trusted job — RLS bypassed, `user_id` explicit); the read is designed for an **authed client** (runtime — RLS-scoped). The `*ForUser(userId)` repository methods work under either.
- **Barrel exports the catalog + provisioning + read only.** The repository + mapper stay internal; the raw `SupabaseClient` and `@nafios/db` row types are never re-exported.
- Files kebab-case; `typecheck` + `test` keys (from EF2.1) keep this wired into the root `bun run check`.

---

## 4. Behavior & rules

### 4.1 The catalog (the canonical default set)

`DEFAULT_CATEGORIES` is the eight-category set from finance-domain-spec §3, in the spec's display order:

| # (`displayOrder`) | `name` |
| --- | --- |
| 0 | Debt |
| 1 | Subscriptions |
| 2 | Taxes |
| 3 | Bills |
| 4 | Set-Asides |
| 5 | Advisories |
| 6 | Insurances & Investments |
| 7 | Life |

- **`displayOrder` is 0-based** and monotonic. The spec numbers them 1–8, but that numbering is an explicit *display default, not a payment priority* (finance-domain-spec §3) — 0-based keeps it consistent with the envelope `sortOrder` convention. `color` is unset (null) for every default.
- **Names are seed values, not reserved words.** Once provisioned they are ordinary user rows; the user may rename/reorder/recolor/delete any of them (finance-domain-spec §3; RFC-008 — "Set-Asides" is only a seed name). Nothing downstream keys off a default name.
- **The list is provisional** and expected to be tuned during development (EF3 epic Notes). It lives here, in one pure constant, so tuning is a one-line domain edit — never a migration and never an auth-package change.

### 4.2 The mapper (row ↔ domain) + explicit `user_id`

1. **Read: row → `Category`.** `id`/`name` pass through; `displayOrder` = `row.display_order`; `color` = `row.color` (verbatim, may be null). **`user_id`, `created_at`, `updated_at` are NOT surfaced** — they are not on the `Category` type. No money, no enum, no status seam.
2. **Write: `(userId, NewCategory)` → insert row.** `user_id` = `userId` (**explicit** — this is the service/trusted-job path, DB-design §8.2: a `service_role` insert that omits `user_id` is rejected by `NOT NULL` because `auth.uid()` is null); `name` set; `display_order` = `input.displayOrder ?? 0`; `color` = `input.color ?? null`. `id`, `created_at`, `updated_at` are omitted (DB defaults).
3. **Why explicit `user_id`, not the `auth.uid()` default.** Onboarding runs as a trusted job on a **service client** with no user session, so the `auth.uid()` default is null — the repository must supply `user_id`. Setting it explicitly is also harmless on an authed client (it equals `auth.uid()`, passing the `owner_all` WITH CHECK), so the one method serves both callers.

### 4.3 Provisioning — the idempotency count-guard

`provisionDefaultCategories(client, userId)`:

1. `const existing = await repo.countForUser(userId)`.
2. If `existing > 0` → **no write**; return `{ seeded: false, categories: <userId's rows, ordered> }`.
3. Else `const categories = await repo.insertManyForUser(userId, DEFAULT_CATEGORIES)` (mapping each `DefaultCategory` → `NewCategory`, `color` null) → return `{ seeded: true, categories }`.

- **Idempotency is a count-guard, not `ON CONFLICT`.** EF1.2 ships **no `UNIQUE(user_id, name)`** (EF1.2 §13 #3), so a per-name upsert isn't available. "Provision iff the user owns zero categories" is the rule — running onboarding twice for a stocked user is a safe no-op. **Consequence (intentional for EF3):** a user who *deletes all* their categories and is somehow re-provisioned would be re-stocked — a zero-category state is unusable (no envelope can be created), so re-seeding it is benign. Because provisioning fires once at onboarding, this edge is largely theoretical; a precise "provisioned once, ever" marker is a later refinement.
- **The count-guard is best-effort against a concurrent double-call.** Two simultaneous onboarding calls for the same `userId` could both read `count = 0` and both insert, producing duplicate defaults. This is a **rare, non-corrupting** outcome: EF1.2 already permits duplicate `(user_id, name)` (its matrix #4), and the extras are deletable. EF3 accepts it rather than add locking; `UNIQUE(user_id, name)` + `ON CONFLICT DO NOTHING` is the clean fix when reference-data management lands (EF1.2 §13 #3). Documented, not silently ignored.
- **`listCategories(client)`** is a thin passthrough to `repo.listByUser()` — the ordered **authed** read the picker/grouping consume. It performs no provisioning (onboarding already ran) and must not be called on a service client (RLS bypassed → would return every user's rows).

### 4.4 Purity, RLS, and no schema changes

1. **No money, no metrics, no ledger, no envelope.** This layer touches only the `category` table. It never imports EF3.1/EF3.2/EF3.3 and never calls `computeLedgerMetrics`.
2. **RLS still governs the runtime read; provisioning is the sanctioned service path.** `listCategories` runs on an authed client → `owner_all` scopes it. `provisionDefaultCategories` runs on a service client → RLS bypassed **by design** (DB-design §8.2), which is exactly why `user_id` is set explicitly. Using the service client anywhere on a *request* path is forbidden (EF2.2 §7.2) — provisioning is a trusted onboarding job, not a request path.
3. **No migration, no new Postgres object.** The layer reads/writes the EF1.2 schema unchanged. This is the ticket that resolves the epic's "EF3 owns one seed migration" to **"EF3 owns a per-user provisioning API and adds no migration"** (§8 note 3).
4. **Two failure channels only.** A DB/query failure → thrown `FinanceDataError` (EF3.6), consistent with EF3.6 §8.4. There is **no `{ ok:false }` rejection union** — provisioning takes a `userId` (not free user input), so there is no deterministic input rejection to model. (No `CodecError` channel either — categories carry no `Money`/`Month` codec.)

### 4.5 Integration contract for the auth/onboarding layer

This ticket ships the finance-side API + this contract; the call itself is a coordinated edit in the auth/platform repo (outside `@nafios/finance`), tracked there.

```ts
// in the auth package's new-user onboarding flow, AFTER the auth.users row exists:
import { createServiceClient, provisionDefaultCategories } from "@nafios/finance";

await provisionDefaultCategories(createServiceClient(), newUser.id);
// idempotent — safe to run again if onboarding retries; finance owns the list + the guard.
```

- **The auth layer supplies only the new user's id and the trigger point.** It never sees the category list, the table, or the insert logic — those stay in finance. Tuning the defaults is a finance-only change.
- **Idempotent by contract**, so onboarding retries / at-least-once delivery are safe. Because it is idempotent, the finance shell (EF3.11) *may* also call it defensively on first authed load as a safety net during the window before the auth wiring lands — optional, not required, and harmless if both fire.

---

## 5. Worked example — the auth layer stocks a new user, then finance reads it

```ts
// ── S1 · Onboarding (auth package, trusted backend job) ──────────────────────
import { createServiceClient, provisionDefaultCategories } from "@nafios/finance";
const r1 = await provisionDefaultCategories(createServiceClient(), newUser.id);
// => { seeded: true, categories: [ {name:"Debt",displayOrder:0,color:null}, …, {name:"Life",displayOrder:7} ] }
r1.categories.length; // => DEFAULT_CATEGORIES.length (8)

// ── Idempotent — an onboarding retry does NOT duplicate ──────────────────────
const r2 = await provisionDefaultCategories(createServiceClient(), newUser.id);
// => { seeded: false, categories: <the same 8, ordered> }   (no write)

// ── Runtime (finance app, EF3.14 picker) — authed read under RLS ─────────────
import { createAuthedClient, listCategories } from "@nafios/finance";
const authed = createAuthedClient({ session });      // the logged-in user
const cats = await listCategories(authed);           // only THIS user's 8, ordered
const bills = cats.find((c) => c.name === "Bills");

// ── S4 · Now an envelope can be created (EF3.8) against a provisioned category ─
const cmd = createEnvelopeCommands(authed);
await cmd.createEnvelope({ ledgerId: L, category: bills.id, item: "PUB", amount: decodeMoney("85.00") });
// => { ok: true, … }   (category_id FK resolves because Bills is the user's own row)

// ── RLS — user B never sees A's categories on the runtime read ───────────────
await listCategories(createAuthedClient({ session: sessionB })); // only B's own set
```

---

## 6. Verification matrix (integration tests)

SDK-driven integration tests against a local Supabase (`supabase db reset`) with **two seeded users A and B** — **reusing EF3.6's harness**, each user starting **category-clean** (if the harness seed pre-creates categories, clear them first so "fresh user" is genuine). Provisioning is exercised via a **service client** + explicit `userId`; the read via an **authed client**. "No write" rows assert the row count is unchanged.

### 6.1 Repository (`category-repository.test.ts`)

| # | Action | Expected |
| --- | --- | --- |
| 1 | `insertManyForUser(A, [{name:'Debt',displayOrder:0},{name:'Bills',displayOrder:3}])` (service client) | ✅ two `Category`; `color=null`; ids assigned |
| 2 | Read row 1 back (service client); check stored `user_id` | `user_id` = A (set **explicitly** — never null, never the omit path) |
| 3 | Authed-as-A `listByUser()` after inserting names out of order (`displayOrder` 2,0,1) | ordered `[0,1,2]` by `displayOrder` |
| 4 | Authed-as-A `listByUser()` on a category-clean user | `[]` |
| 5 | `countForUser(A)` after inserting 8 for A | `8` |
| 6 | `insertManyForUser` omitting `displayOrder`/`color` | ✅ `display_order=0`, `color=null` (mapper/DB defaults) |
| 7 | `insertManyForUser(A, [{name:'Debt',…},{name:'Debt',…}])` (same `(user_id,name)`) | ✅ both (EF1.2 has no uniqueness — documents the count-guard's assumption) |
| 8 | Service-client `insertManyForUser(A, …)`; authed-as-B `listByUser()` | B sees none of A's rows (RLS scopes the runtime read) |

### 6.2 Provisioning + read (`provision-default-categories.test.ts`)

| # | Action | Expected |
| --- | --- | --- |
| 9 | `provisionDefaultCategories(serviceClient, A)` on category-clean A | `{ seeded:true }`; `categories.length === DEFAULT_CATEGORIES.length`; names+order match the catalog exactly; each row's `user_id` = A |
| 10 | Call it **again** for A (onboarding retry) | `{ seeded:false }`; **no new rows** (`countForUser(A)` unchanged) |
| 11 | Provision A, delete **one** category (authed-as-A), provision A again | `{ seeded:false }`; still 7 (guard sees ≥1 → no re-seed) |
| 12 | Provision A, delete **all** (authed-as-A), provision A again | `{ seeded:true }`; re-stocked to the full 8 (documented re-seed-on-empty, §4.3) |
| 13 | `listCategories(authedAsA)` after provisioning A | the 8 defaults, ordered by `displayOrder` then `name`; performs no write |
| 14 | Provision A **and** B; `listCategories(authedAsA)` / `listCategories(authedAsB)` | each sees exactly their own 8 — no cross-leak (RLS) |
| 15 | Provision A; `listCategories(authedAsB)` (B unprovisioned) | `[]` — B sees nothing of A's |

---

## 7. Acceptance criteria

- [ ] **AC1** — `src/domain/category.ts`, `src/domain/default-categories.ts`, `src/internal/mappers/category-mapper.ts`, `src/internal/repositories/category-repository.ts`, and `src/internal/provisioning/provision-default-categories.ts` exist in `@nafios/finance`; `Category`, `DefaultCategory`, `DEFAULT_CATEGORIES`, `provisionDefaultCategories`, `ProvisionCategoriesResult`, and `listCategories` are re-exported from `src/index.ts` (the repository + mapper stay internal); wired into `bun run check` (`typecheck` + `test`).
- [ ] **AC2** — `DEFAULT_CATEGORIES` is the exact eight-entry set of §4.1 (names + 0-based `displayOrder`), living in `src/domain/` (pure, zero I/O); the list is defined **once** here — nothing in SQL or in the auth package hardcodes it.
- [ ] **AC3** — The category mapper decodes `display_order`→`displayOrder` and passes `color` (nullable) verbatim; it does **not** surface `user_id`/`created_at`/`updated_at`; `insertManyForUser` sets `user_id` **explicitly** to the passed `userId` (row 2), omits `id`/`created_at`/`updated_at`, and defaults `display_order=0`/`color=null` (row 6). No money, no enum, no status seam.
- [ ] **AC4** — `provisionDefaultCategories(client, userId)` is designed for a **service client** (RLS bypassed, `user_id` explicit per DB-design §8.2) and is idempotent via a **count-guard**: `{ seeded:true }` + full catalog on a zero-category user (row 9); `{ seeded:false }` + **no write** when the user owns ≥1 (rows 10–11); re-stocks on an emptied user (row 12). Returns the user's ordered set in `categories` either way. No `{ ok:false }` union (takes a `userId`, not free input).
- [ ] **AC5** — `listCategories(client)` is the **authed**, RLS-scoped runtime read, ordered by `displayOrder` then `name`, performing **no** write (row 13); RLS isolates the read between users A and B (rows 8, 14–15).
- [ ] **AC6** — The §4.5 **integration contract** is documented: the auth/onboarding layer imports `@nafios/finance` and calls `provisionDefaultCategories(createServiceClient(), newUserId)` once per new user; finance owns the list + guard, the auth layer owns only the trigger; the call is idempotent (retry-safe).
- [ ] **AC7** — DB faults surface as thrown `FinanceDataError` (EF3.6, reused unextended, no new SQLSTATE branch); no metrics, no ledger, no envelope logic; no category `update`/`delete`/CRUD.
- [ ] **AC8** — Every row of the §6 matrix passes as an integration test against a local Supabase with two seeded users (reusing EF3.6's harness, each user starting category-clean); the harness is idempotent across runs; `bun run check` is green across the workspace.
- [ ] **AC9** — **Boundary stays clean:** the catalog + `Category` type are pure in `src/domain/`; `@supabase/supabase-js` / `@nafios/db` appear **only** in `src/internal/`; no `src/domain/` file imports the data layer; the eslint import-boundary rule stays green; **no migration** is added.

---

## 8. Notes / decisions

1. **Categories are per-user rows, not global reference data — the schema and the spec both force it.** finance-domain-spec §3 makes categories *user-defined labels* the user can *rename, reorder, add, or remove*, and RFC-008 keeps "Set-Asides" only as a *seed name*. EF1.2 enforces it physically: `user_id NOT NULL` (default `auth.uid()`) + the `owner_all` RLS policy mean a category is only ever visible to, and mutable by, its owner. A `user_id`-free "system-wide" row is impossible (fails `NOT NULL`, invisible under RLS) **and** semantically wrong (you can't let one user rename a row shared by all). So the seed **copies the catalog into each user's own rows** — keyed on the `userId` the onboarding layer supplies.
2. **Finance owns the API; the auth layer owns the trigger — this is the settled mechanism.** The epic left it open (trigger vs seed-on-first-load); the decision is a **finance-owned TS API** the auth/onboarding package **imports and calls**. Rationale: the canonical list stays a single `src/domain/` constant (never duplicated into SQL or platform code), it fits the EF3.6/EF3.7/EF3.8 `src/internal/` spine and tests on EF3.6's harness, it never touches the Supabase-managed `auth.users` schema, and it puts the *when* where onboarding already lives. The auth-package call site (§4.5) is a coordinated cross-repo edit, not finance code.
3. **EF3 adds no migration — this supersedes the "one migration" framing across the board.** The epic's Data-section header (*"Data (`src/internal/` + one migration)"*) and Scope item 9 (*"+ the migration/mechanism"*), **EF3.6 §8** (*"EF3 adds none but EF3.9's seed"*), **EF3.7 §4.2/§8** (*"EF3's scope is firm: one migration total — the EF3.9 category seed"*), and **EF3.8** (*"EF3's one migration is the EF3.9 category seed"*) all assumed EF3.9 ships a migration. Choosing a TS provisioning API means it does **not**: the `category` table already exists (EF1.2), and seeding is plain INSERTs. Those references should be corrected to *"EF3 adds no migration; EF3.9 provisions via a finance-owned API."* EF3.7's atomicity **conclusion** (ordered writes + compensation, no RPC) is unaffected — only its "we've already spent our one migration" **rationale** needs a wording tweak (the conclusion stands on the SDK's lack of multi-statement transactions alone). Flagged for a follow-up epic + EF3.6/EF3.7/EF3.8 edit — this ticket is internally correct as written.
4. **Service client + explicit `user_id` is the sanctioned onboarding path.** DB-design §8.2 / §7.8 #8 name a *"seed script (E2.5), run as `service_role`, which must set `user_id` explicitly"* — provisioning is exactly that. The `provisionDefaultCategories(client, userId)` signature takes the id so the service path is correct; it also works on an authed client whose `auth.uid()` equals `userId` (the explicit `user_id` just matches the RLS WITH CHECK), so the one API serves both onboarding and any authed fallback (§4.5).
5. **Idempotency is a count-guard because EF1.2 has no `UNIQUE(user_id, name)`.** With no natural key, `ON CONFLICT DO NOTHING` isn't available, so "provision iff zero categories" is the guard. Its edges — a rare concurrent double-call double-seeds (benign, deletable), and re-provisioning an emptied user re-stocks — are cheap to eliminate once `UNIQUE(user_id, name)` + a "provisioned" marker land with reference-data management (EF1.2 §13 #3), deliberately out of scope for EF3.
6. **`listCategories` is the runtime authed read; category CRUD is out of scope.** EF3 needs to *seed* (onboarding) and *read* (the EF3.14 picker / EF3.13 grouping) categories, so this ticket ships both. It does **not** ship category **mutation** — rename/reorder/recolor/delete + a management UI are a later reference-data epic (EF3 epic Out-of-scope). The repository has no `update`/`delete`.
7. **Third repository, no classifier extension.** EF3.6 established the classifier; EF3.8 extended it once (`23503`) because an envelope write can violate a user-supplied FK. A category write cannot — its only FK is `user_id`, supplied by the trusted job and validated by `NOT NULL`/RLS, not a picker value — so `mapPostgrestError` is reused **unchanged**.

_Provenance (not required reading): the eight-category default set, categories-as-user-defined-labels, and the rename/reorder/add/remove affordance are from finance-domain-spec §3 (and RFC-008, "Set-Asides" as a seed name); the `category` columns/index/`owner_all` RLS/`user_id` default `auth.uid()`/absence of `UNIQUE(user_id,name)`/deferral of "default-category seeding" to E3 are from EF1.2 (§2–§6, §13 #3 & #5); the authed vs service client factories, `FinanceClient`, and "service_role must set `user_id` explicitly / never on a request path" are from EF2.2 (§2, §4, §7) and DB-design §8.2 / §7.8 #8; the `FinanceDataError` + `mapPostgrestError` classifier, the mapper pattern, and the two-user integration harness are from EF3.6 (§2–§4, §8); the "default-category catalog lives in `src/domain/` (zero I/O)", per-user provisioning, and the (now-resolved) trigger-vs-seed mechanism question are from the EF3 epic (Stack & approach, Scope item 9, Notes, Out of scope)._

---

## 9. Definition of Done (PR-ready)

This ticket is **one PR** that closes EF3.9. It is the third `src/internal/` feature (+ one pure `src/domain/` catalog), depending on EF1.2 (the table), EF3.6 (data foundations), and EF2.2 (client factories) — **independent of EF3.7/EF3.8**. Mergeable when all of the following hold — no follow-up, no stubs, no TODOs:

- [ ] `src/domain/category.ts`, `src/domain/default-categories.ts`, `src/internal/mappers/category-mapper.ts`, `src/internal/repositories/category-repository.ts`, `src/internal/provisioning/provision-default-categories.ts`, `tests/integration/category-repository.test.ts`, and `tests/integration/provision-default-categories.test.ts` are present; the §2.1/§2.3 surface is re-exported from `src/index.ts`; the repository + mapper stay internal.
- [ ] **All §7 acceptance criteria (AC1–AC9) pass**, including the exact eight-entry catalog, explicit `user_id` on the service-client insert path, the count-guard idempotency (no double-seed on retry, re-stock on an emptied user), RLS isolation on the runtime read, and the pure-domain/data boundary.
- [ ] **`bun run check` is green across the workspace** — `typecheck`, all §6 integration tests against a local Supabase with two seeded users (reusing EF3.6's harness, each user starting category-clean), and the eslint domain/data import-boundary rule (AC9). This is the merge gate.
- [ ] The §4.5 **integration contract** for the auth/onboarding layer is documented (finance owns the API + list; the auth layer calls `provisionDefaultCategories(createServiceClient(), userId)` once per new user; idempotent/retry-safe). The auth-package call site itself is a coordinated edit tracked in the auth/platform repo, not this PR.
- [ ] No surface beyond §2 — in particular **no** migration, **no** category `update`/`delete`/CRUD or management UI, **no** money/metrics/ledger/envelope logic, and **no** rejection union.
- [ ] The canonical list exists **once** as `DEFAULT_CATEGORIES` in `src/domain/`; nothing hardcodes it in SQL or the auth package; provisioning sets `user_id` explicitly and funnels DB errors through EF3.6's `FinanceDataError`.
- [ ] This ticket's Revision History is updated; the EF3.9 checkbox in `EF3.md` is ticked when merged. (Separately: the epic's / EF3.6's / EF3.7's / EF3.8's "one migration" wording is corrected per §8 note 3.)

---

## Revision History

| Version | Date       | Author            | Changes |
| ------- | ---------- | ----------------- | ------- |
| 0.1     | 2026-07-03 | NafiOS Foundation | Initial standalone task for **default-category provisioning** in `@nafios/finance`. Settles the EF3 epic's open mechanism as a **finance-owned TypeScript API the auth/onboarding package imports and calls** for each new user — `provisionDefaultCategories(client, userId)`, run as a trusted backend job on a **service client** (RLS bypassed, `user_id` set **explicitly** per DB-design §8.2), idempotent via a count-guard (seed iff zero categories; retry-safe; no `{ ok:false }` union since it takes a `userId`, not free input). Grounded in finance-domain-spec §3 / RFC-008 (categories are user-owned, mutable, deletable rows — a global/system-wide table is impossible under EF1.2's `user_id NOT NULL` + `owner_all` RLS). Ships: a **pure domain catalog** (`DEFAULT_CATEGORIES`, the eight-category set, + the `Category` type) as the single source of truth; a minimal **category repository** (`countForUser` / `insertManyForUser` (explicit `user_id`) / `listByUser` + mapper, the third repository on EF3.6's foundations, no classifier extension); the **`provisionDefaultCategories`** onboarding API + the §4.5 integration contract for the auth layer; and the runtime authed **`listCategories`** read the EF3.14 picker / EF3.13 grouping consume. **EF3 adds no migration** — superseding the "one migration = EF3.9 seed" wording in the epic, EF3.6, EF3.7, and EF3.8 (§8 note 3; EF3.7's no-RPC conclusion is unaffected). Scopes OUT category mutation/CRUD (later reference-data epic), any migration, and money/metrics/ledger/envelope logic. Verification matrix (repository explicit-`user_id`/order/RLS/defaults + provisioning idempotency/re-seed/isolation via service+authed clients) + AC1–AC9 + §9 Definition of Done (green `bun run check` incl. local-Supabase integration tests as the merge gate); PR-able on EF1.2 + EF3.6 + EF2.2, independent of EF3.7/EF3.8. |
