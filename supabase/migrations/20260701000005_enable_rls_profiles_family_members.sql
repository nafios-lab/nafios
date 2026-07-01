-- ---------------------------------------------------------------------------
-- Enable RLS on the auth-epic tables: profiles + family_members
-- ---------------------------------------------------------------------------
-- Brings the two auth-epic tables onto the owner-isolation RLS pattern that
-- ADR-0023 established for owned finance tables. Until now these tables kept RLS
-- DISABLED with authorization done purely at the app layer (ADR-0019), and
-- ADR-0023 deliberately left them out of scope. This migration closes that gap
-- so ALL owner-rooted public tables are protected by defense-in-depth, not just
-- the finance schema.
--
-- ⚠ GOVERNANCE: this DEVIATES from ADR-0019 ("profiles do not enable RLS") and
-- from ADR-0023's explicit "auth-epic tables keep RLS disabled … out of scope."
-- The decision to bring them under RLS is recorded in ADR-0024, which supersedes
-- that portion of 0019/0023. (The app/web CLAUDE.md "RLS is intentionally
-- disabled" note is now stale and should be updated.)
--
-- OWNERSHIP PREDICATES (why these columns):
--   * profiles.id IS the user id — the PK references auth.users(id) and the
--     signup trigger stamps it with the new auth user's id. So the owner check
--     is `(select auth.uid()) = id`.
--   * family_members.profile_id → profiles.id (= the user id). So the owner
--     check is `(select auth.uid()) = profile_id`.
--   (select auth.uid()) is wrapped so Postgres evaluates it once per statement.
--
-- WHY EXISTING ACCESS PATHS KEEP WORKING (verified against the code):
--   * Signup insert — public.handle_new_user() is SECURITY DEFINER (owner =
--     postgres, a table owner) and therefore BYPASSES RLS. No policy needed for
--     it; the bare profile row is still created on every auth.users insert.
--   * Onboarding writes — insert_user_profile / save_onboarding_profile are
--     SECURITY INVOKER, so they run as `authenticated`. They UPDATE profiles
--     WHERE id = auth.uid() and DELETE/INSERT family_members WHERE profile_id =
--     auth.uid() — every touched row satisfies USING and WITH CHECK above.
--   * Profile reads — getOnboardingStatusFn / getOnboardingProfileFn read
--     profiles via the authenticated cookie client, filtered .eq("id", user.id).
--     The SELECT arm of owner_all returns exactly that row.
--   * service_role (Storage-only in this app) and migrations/seeds bypass RLS.
--
-- Grants are unchanged (profiles: SELECT,UPDATE to authenticated; family_members:
-- SELECT,INSERT,UPDATE,DELETE to authenticated; SELECT to service_role). RLS only
-- scopes which rows those grants can reach; it does not widen or narrow the
-- privilege set. FORCE ROW LEVEL SECURITY is intentionally NOT set, so table
-- owners (the SECURITY DEFINER trigger, migrations, seeds) keep bypassing RLS.
-- ---------------------------------------------------------------------------

-- profiles: a user sees/writes only their own profile row (id = the user id).
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY owner_all ON public.profiles
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- family_members: a user sees/writes only members under their own profile.
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY owner_all ON public.family_members
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) = profile_id)
  WITH CHECK ((select auth.uid()) = profile_id);
