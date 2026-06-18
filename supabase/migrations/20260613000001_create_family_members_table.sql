-- ---------------------------------------------------------------------------
-- public.family_members
-- ---------------------------------------------------------------------------
-- Family members belonging to a user profile. One profile can have zero or
-- more family members. Owned entity — cascades on profile deletion.
--
-- RLS intentionally disabled — app-layer authorization per ADR-0019.

CREATE TABLE public.family_members (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  name          text        NOT NULL,
  relationship  text        NOT NULL
    CONSTRAINT family_members_relationship_check
    CHECK (relationship IN ('spouse', 'child', 'parent', 'sibling', 'other')),
  avatar_url    text,
  nric          text,
  mobile_no     text,
  date_of_birth date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  created_by    uuid        REFERENCES auth.users (id),
  updated_by    uuid        REFERENCES auth.users (id)
);

COMMENT ON TABLE public.family_members IS
  'Family members belonging to a user profile. One profile can have zero or more family members.';
COMMENT ON COLUMN public.family_members.nric IS
  'Malaysian IC number. Sensitive PII — encrypt at rest when Vault is adopted.';
COMMENT ON COLUMN public.family_members.relationship IS
  'Relationship to the profile owner. Allowed: spouse, child, parent, sibling, other.';

-- Auto-maintain updated_at (reuses function from profiles migration)
CREATE TRIGGER set_family_members_updated_at
  BEFORE UPDATE ON public.family_members
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Lookup by profile
CREATE INDEX family_members_profile_id_idx ON public.family_members (profile_id);

-- Grant access to PostgREST roles (auto_expose_new_tables = false in config).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_members TO authenticated;
GRANT SELECT ON public.family_members TO service_role;
