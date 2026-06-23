-- ---------------------------------------------------------------------------
-- Per-step onboarding: save_onboarding_profile (Step 2 / Profile)
-- ---------------------------------------------------------------------------
-- The v2.0.0 onboarding flow persists incrementally — one step at a time
-- (see specs/domain/onboarding-flow.md). This is the Step-2 (Profile) write.
--
-- Profile collects an OPTIONAL avatar and an OPTIONAL mobile. The mobile lands
-- in auth.users.user_metadata (via auth.updateUser, not this function); the only
-- profile-table field Step 2 owns is avatar_url. So this function takes just the
-- avatar object path and updates that column.
--
-- Crucially it does NOT stamp onboarding_completed_at — that is written ONLY by
-- the final step (Family + Review). Stamping here would mark a user "done" the
-- moment they touch the Profile step, defeating the per-step completion gate.
--
-- Idempotent: COALESCE keeps the existing avatar when called with NULL, and the
-- same path re-writes the same value, so a resumed/retried Save cannot corrupt
-- anything. profile_id is derived from auth.uid(); the client never supplies it.
--
-- NOTE: the Step-3 final RPC (complete_onboarding: family rows + completion
-- stamp, replacing insert_user_profile) lands with the Family/Review pass.

CREATE OR REPLACE FUNCTION public.save_onboarding_profile(
  p_avatar_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'save_onboarding_profile: no authenticated user (auth.uid() is null)'
      USING ERRCODE = '28000';
  END IF;

  UPDATE public.profiles
     SET avatar_url = COALESCE(p_avatar_url, avatar_url),
         updated_by = v_uid
   WHERE id = v_uid;
END;
$$;

COMMENT ON FUNCTION public.save_onboarding_profile(text) IS
  'Per-step (Step 2 / Profile) write: idempotently sets profiles.avatar_url for the authenticated user. Does NOT stamp onboarding_completed_at (that is the final step). profile_id is auth.uid(). Safe to retry.';

GRANT EXECUTE ON FUNCTION public.save_onboarding_profile(text) TO authenticated;
