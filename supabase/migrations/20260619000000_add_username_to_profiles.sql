-- ----------------------------------------------------------------------------
--  Add public.profiles.username (deferred field — no flow writes it yet)
-- ----------------------------------------------------------------------------
--
-- A nullable, NON-UNIQUE display-name column. The signup trigger
-- (on_auth_user_created → handle_new_user) creates a bare profile row with
-- username NULL; no onboarding step currently captures it (the v2.0.0 Profile
-- step collects only avatar + mobile — see specs/domain/onboarding-flow.md).
-- The column is provisioned ahead of a future "choose a username" change.
--
-- Uniqueness is intentionally NOT enforced for now — a unique index and the
-- "username taken" UX it implies are a deliberate follow-up.
--
-- NOTE: this migration was previously broken (it attempted a malformed rework of
-- insert_user_profile that would not apply). It is reduced to the column add only.
-- The per-step onboarding RPCs are introduced in their own later migration. The
-- add is idempotent (IF NOT EXISTS) so it is safe whether or not a prior attempt
-- partially applied against staging.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text;

COMMENT ON COLUMN public.profiles.username IS
  'Account holder''s chosen display name. NULL until a future "choose a username" flow writes it (the v2 onboarding Profile step does not collect it). Not unique (uniqueness is a future change).';
