-- ---------------------------------------------------------------------------
-- Reusable trigger function: auto-set updated_at on row update.
-- Created once here (first migration), attached to every table that has an
-- updated_at column.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.set_updated_at() IS
  'Sets updated_at to now() on every UPDATE. Attach to any table with an updated_at column.';

-- ---------------------------------------------------------------------------
-- public.profiles
-- ---------------------------------------------------------------------------
-- App-owned profile row, one per auth.users entry. All domain tables FK to
-- profiles.id, never to auth.users directly (ADR-0016).
--
-- RLS intentionally disabled — app-layer authorization per ADR-0019.

CREATE TABLE public.profiles (
  id         uuid        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid        REFERENCES auth.users (id),
  updated_by uuid        REFERENCES auth.users (id)
);

COMMENT ON TABLE public.profiles IS
  'App-owned profile row, one per auth.users entry. FK target for all domain tables.';

-- Auto-maintain updated_at
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Grant access to PostgREST roles (auto_expose_new_tables = false in config).
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO service_role;

-- ---------------------------------------------------------------------------
-- Trigger: auto-create a profile row when a new auth user is inserted
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, created_by)
  VALUES (NEW.id, NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Creates a public.profiles row whenever a new auth.users row is inserted.';

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
