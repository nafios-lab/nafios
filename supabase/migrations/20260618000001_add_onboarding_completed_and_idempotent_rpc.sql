-- ---------------------------------------------------------------------------
-- Onboarding completion signal + idempotent insert_user_profile
-- ---------------------------------------------------------------------------
-- Two coupled changes:
--
-- 1. Add public.profiles.onboarding_completed_at. The signup trigger creates a
--    bare profile row up front, so "row exists" cannot mean "onboarding done".
--    A user can legitimately finish onboarding with ZERO family members, so
--    family-member count is not a valid completeness signal either — we need an
--    explicit timestamp. The route guards gate the dashboard on this column:
--    a session whose profile has a NULL onboarding_completed_at is bounced back
--    into the signup flow to finish, rather than into the app.
--
-- 2. Make insert_user_profile idempotent and completion-stamping. Onboarding can
--    now be retried/resumed (a prior attempt may have created the auth user +
--    session but failed at this step). So this function must be safe to run more
--    than once for the same user:
--      * family members are DELETEd then re-INSERTed (no duplicates on retry);
--      * onboarding_completed_at is stamped, marking the account usable.
--    Still one function body == one transaction: all of it commits or rolls
--    back together.

ALTER TABLE public.profiles
  ADD COLUMN onboarding_completed_at timestamptz;

COMMENT ON COLUMN public.profiles.onboarding_completed_at IS
  'Set when the user completes the signup/onboarding flow. NULL = onboarding not yet finished; route guards bounce such sessions back into signup.';

CREATE OR REPLACE FUNCTION public.insert_user_profile(
  p_avatar_url    text  DEFAULT NULL,
  p_family_members jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insert_user_profile: no authenticated user (auth.uid() is null)'
      USING ERRCODE = '28000';
  END IF;

  -- 1) Complete the profile row (already created by the signup trigger) and
  --    mark onboarding done. Re-running re-stamps the completion time, which is
  --    harmless — this only runs during onboarding.
  UPDATE public.profiles
     SET avatar_url = COALESCE(p_avatar_url, avatar_url),
         updated_by = v_uid,
         onboarding_completed_at = now()
   WHERE id = v_uid;

  -- 2) Replace this profile's family members. The DELETE makes the function
  --    idempotent: a resumed/retried onboarding submit won't duplicate rows.
  DELETE FROM public.family_members WHERE profile_id = v_uid;

  INSERT INTO public.family_members (
    profile_id, name, relationship, avatar_url, nric, mobile_no, date_of_birth,
    created_by, updated_by
  )
  SELECT
    v_uid,
    m->>'name',
    m->>'relationship',
    m->>'avatar_url',
    m->>'nric',
    m->>'mobile_no',
    NULLIF(m->>'date_of_birth', '')::date,
    v_uid,
    v_uid
  FROM jsonb_array_elements(COALESCE(p_family_members, '[]'::jsonb)) AS m;
END;
$$;

COMMENT ON FUNCTION public.insert_user_profile(text, jsonb) IS
  'Idempotently completes a user profile (avatar + onboarding_completed_at) and replaces their family members. profile_id is taken from auth.uid(). Safe to retry.';

GRANT EXECUTE ON FUNCTION public.insert_user_profile(text, jsonb) TO authenticated;
