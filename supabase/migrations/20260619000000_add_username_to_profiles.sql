-- ----------------------------------------------------------------------------
--  Add public.profiles.username + thread it through insert_user_profile
-- ----------------------------------------------------------------------------


-- The onboarding flow now collects a username for the account holder. It is
-- captured AFTER email verification (the onboarding spec's \"no data before
-- verification\" invariant), so the column must be nullable: the signup trigger
-- (on_auth_user_created → handle_new_user) creates a bare profile row up front
-- with username NULL, and insert_user_profile fills it in when the onboarding
-- wizard submits.

-- Username is intentionally NOT UNIQUE for now — uniqueness (and the
-- duplicate-username UX it implies) is a deliberate follow-up, out of scope for
-- the email-verification epic.

ALTER TABLE public.profiles ADD COLUMN username TEXT;

COMMENT ON COLUMN public.profiles.username IS
   "'Account holder'' chosen display name. NULL untill the onboarding wizard submits (collected post-verification). Not unique (uniqueness is a future change).)" ;


---------------------------------------------------------------------------
-- Re-create insert_user_profile with a p_username parameter.
-- ---------------------------------------------------------------------------
-- Adding a parameter changes the function signature, so CREATE OR REPLACE would
-- create a second overload rather than replace. Drop the old (text, jsonb)
-- function first, then create the (text, text, jsonb) version. supabase-js calls
-- this RPC with named args, so the new parameter is matched by name regardless
-- of position.

DROP FUNCTION public.insert_user_profile(text, jsonb),


CREATE OR REPLACE FUNCTION public.insert_user_profile(
    p_avatar_url   text DEFAULT NULL,
    p_family_members jsonb DEFAULT '[]':: jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_uid uuid := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'insert_user_profile: no authenticated user (auth.uid) is null'
        USING ERRCODE = '28000';
    END IF




 COMMENT ON FUNCTION public.insert_user_profile(text, text, jsonb) IS
  "'Idempotently completes a user profile (avatar + username + onboarding_completed_at) and replaces their family members. profile_id is taken from auth.uid(). Safe to retry.'",
  
GRANT EXECUTE ON FUNCTION public.insert_user_profile(text, text, jsonb) TO authenticated 







  