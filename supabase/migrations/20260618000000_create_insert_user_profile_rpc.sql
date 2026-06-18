-- ---------------------------------------------------------------------------
-- RPC: public.insert_user_profile
-- ---------------------------------------------------------------------------
-- Completes onboarding for the authenticated user as a SINGLE transaction:
--   1. fills in the profile row (avatar) — the row already exists, created by
--      the on_auth_user_created trigger on signup, so this is an UPDATE.
--   2. inserts the user's family members.
--
-- Both happen in one function body == one implicit transaction, so they commit
-- or roll back together (the atomicity the client SDK cannot give across two
-- separate .from() calls — see @nafios/database spec).
--
-- profile_id is derived from auth.uid() (the caller's JWT), never trusted from
-- the client. SECURITY INVOKER (default): runs as the `authenticated` role, so
-- the existing table GRANTs and app-layer authorization (ADR-0019) apply.
--
-- p_family_members is a JSONB array of objects shaped like the family_members
-- columns (snake_case): name, relationship, avatar_url, nric, mobile_no,
-- date_of_birth. The relationship CHECK constraint on the table rejects invalid
-- values, which aborts the whole transaction.

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

  -- 1) Complete the profile row (already created by the signup trigger).
  UPDATE public.profiles
     SET avatar_url = COALESCE(p_avatar_url, avatar_url),
         updated_by = v_uid
   WHERE id = v_uid;

  -- 2) Insert the family members from the JSONB array.
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
  'Atomically completes a user profile (avatar) and inserts their family members. profile_id is taken from auth.uid().';

-- Expose to the authenticated role (PostgREST RPC).
GRANT EXECUTE ON FUNCTION public.insert_user_profile(text, jsonb) TO authenticated;
