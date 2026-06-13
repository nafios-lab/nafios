-- seed.sql
--
-- This file is executed automatically after `supabase db reset` replays all
-- migrations. Use it to insert development/test data that every local
-- contributor needs (fixture users, sample rows, etc.).
--
-- Keep seeds idempotent — they run on every reset, so use
-- INSERT ... ON CONFLICT DO NOTHING or similar patterns.

-- ============================================================================
-- Test user for local development
-- ============================================================================
-- Creates a confirmed user via Supabase's auth.users table.
-- Email: test@nafios.local
-- Password: password123
--
-- The user is pre-confirmed (email_confirmed_at is set) so auth flows work
-- immediately without needing to click a confirmation link.

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  role,
  aud,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  email_change_token_current,
  email_change_confirm_status,
  phone,
  phone_change,
  phone_change_token
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'test@nafios.local',
  crypt('password123', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider": "email", "providers": ["email"]}',
  '{}',
  false,
  'authenticated',
  'authenticated',
  '',
  '',
  '',
  '',
  '',
  0,
  '',
  '',
  ''
)
ON CONFLICT (id) DO NOTHING;

-- Supabase requires a matching auth.identities row for email/password sign-in.
INSERT INTO auth.identities (
  id,
  user_id,
  provider_id,
  provider,
  identity_data,
  last_sign_in_at,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'test@nafios.local',
  'email',
  '{"sub": "00000000-0000-0000-0000-000000000001", "email": "test@nafios.local", "email_verified": true, "phone_verified": false}',
  now(),
  now(),
  now()
)
ON CONFLICT (provider_id, provider) DO NOTHING;

-- ============================================================================
-- Test profile for local development
-- ============================================================================
-- The on_auth_user_created trigger creates profiles automatically for new
-- signups, but seeded auth.users rows bypass the trigger (they're inserted
-- before migrations run during `supabase db reset`). Seed the profile
-- explicitly so the test user is fully usable.

INSERT INTO public.profiles (id, created_by)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Test family members for local development
-- ============================================================================

INSERT INTO public.family_members (id, profile_id, name, relationship, date_of_birth, created_by)
VALUES
  (
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000001',
    'Test Spouse',
    'spouse',
    '1990-01-15',
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000001',
    'Test Child',
    'child',
    '2020-06-01',
    '00000000-0000-0000-0000-000000000001'
  )
ON CONFLICT (id) DO NOTHING;
