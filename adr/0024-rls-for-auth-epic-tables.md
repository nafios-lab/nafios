# 0024. Row-Level Security for the auth-epic tables

- **Status:** Accepted
- **Date:** 2026-07-01
- **Source:** Follow-up to EF1.11 (finance ownership hardening) — extending RLS
  coverage to `profiles` and `family_members`.

## Context

[ADR-0019](0019-app-layer-authz-rls-deferred.md) put authorization in the app
layer and **deferred** RLS; the auth-epic tables `profiles` and `family_members`
were created with RLS disabled. [ADR-0023](0023-rls-for-owned-domain-tables.md)
then turned RLS **on** for owned finance tables, but explicitly left the
auth-epic tables out:

> The auth-epic tables (`profiles`, `family_members`) keep RLS disabled — their
> access goes through `SECURITY DEFINER` RPCs and app-layer scoping, and
> changing them is out of scope here.

Two things have changed since then:

1. The ownership model for these tables is now concrete and stable —
   `profiles.id` **is** the user id (PK → `auth.users(id)`), and
   `family_members.profile_id` → `profiles.id`. There is no ambiguity about what
   "owner" means, which was the main reason RLS was deferred in ADR-0019.
2. The finance epic (ADR-0023) made owner-isolation RLS the house pattern, and
   EF1.11 hardened cross-owner integrity across finance. Leaving the two tables
   that hold the user's **profile and family PII** as the only owner-rooted
   tables without a database safety net is now the weakest link: a single missed
   filter in a server function would leak another user's profile/family data.

The access paths were audited before adopting RLS:

- **Signup insert** — `public.handle_new_user()` is `SECURITY DEFINER` (owner =
  a table owner) and bypasses RLS.
- **Onboarding writes** — `insert_user_profile` / `save_onboarding_profile` are
  `SECURITY INVOKER`; they touch only rows where `id`/`profile_id = auth.uid()`.
- **Profile reads** — the onboarding server functions read `profiles` through the
  authenticated cookie client, filtered on `id = user.id`.
- **service_role** — used in this app only for Storage (avatar uploads), never
  for these tables; bypasses RLS regardless.

None of these paths reads or writes another user's rows, so an owner-isolation
policy keyed on `auth.uid()` protects them without any application change.

## Decision

**Enable RLS on `profiles` and `family_members`**, using the same
owner-isolation pattern as ADR-0023:

- `profiles` — one `FOR ALL TO authenticated` policy:
  `USING ((select auth.uid()) = id)` and the same `WITH CHECK`.
- `family_members` — one `FOR ALL TO authenticated` policy:
  `USING ((select auth.uid()) = profile_id)` and the same `WITH CHECK`.

`FORCE ROW LEVEL SECURITY` is **not** set, so the `SECURITY DEFINER` signup
trigger, migrations, and seeds continue to bypass RLS as table owners. Grants are
unchanged — RLS scopes which rows the existing grants can reach.

This **supersedes** the "keep the auth-epic tables RLS-disabled" stance of
ADR-0019 and ADR-0023. App-layer authorization (ADR-0019) **remains** as the
first layer; RLS is defense-in-depth on top, exactly as in ADR-0023. Both ADRs
otherwise stand.

Shipped as migration `20260701000005_enable_rls_profiles_family_members.sql`.

## Consequences

- A missing owner filter in any server function touching `profiles` /
  `family_members` can no longer leak another user's profile or family PII — the
  database refuses the rows. Two layers must both fail to cause a leak.
- The pattern is now uniform: every owner-rooted `public` table enables RLS.
  ADR-0023's per-table opt-in still holds for genuinely non-owned tables.
- The `SECURITY INVOKER` onboarding RPCs are now also protected by RLS, not just
  by their own `WHERE id = auth.uid()` clauses — a belt-and-braces improvement.
- Docs to reconcile: the `apps/web/CLAUDE.md` "RLS is intentionally disabled"
  note for these tables is superseded by this ADR and should be updated.
- Testable end-to-end the same way finance RLS is: sign in as two users and
  assert cross-user profile/family reads return zero rows and cross-user writes
  are rejected by `WITH CHECK`.
- Related: ADR-0016 (`auth.uid()` canonical), ADR-0019 (app-layer authz — still
  the first layer), ADR-0023 (owner-isolation RLS pattern this reuses).

## Alternatives considered

- **Keep RLS disabled (status quo, ADR-0019/0023).** Consistent with the
  original auth-epic decision, but leaves the user's profile and family PII as
  the only owner-rooted tables without a database safety net — precisely the
  single-point-of-failure ADR-0023 removed for finance.
- **Add a `user_id` column to `family_members` to mirror finance exactly.**
  Unnecessary: `profile_id` already equals the user id transitively, so the
  policy can key on it directly. Adding a redundant column would duplicate the
  ownership signal and require backfill + a new FK for no security gain. (A
  `user_id` on `family_members` was considered separately for EF1.11 composite-FK
  hardening; that is a distinct, still-open question and not required here.)
- **FORCE ROW LEVEL SECURITY.** Would break the `SECURITY DEFINER` signup trigger
  and seeds, which must bypass RLS to create the bootstrap profile row. Rejected.
