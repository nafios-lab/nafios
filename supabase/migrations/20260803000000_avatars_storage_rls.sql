-- ---------------------------------------------------------------------------
-- Avatars bucket + owner-isolation RLS on storage.objects
-- ---------------------------------------------------------------------------
-- The SPA shell (apps/nafios-web) has NO server runtime — every read and write,
-- avatars included, runs from the browser via an anon-key client carrying the
-- user's session, with RLS as the security boundary (ADR-0026). The original
-- avatar path uploaded via the service-role key from a server function
-- (@nafios/storage, "SERVER-ONLY"); that has no browser equivalent. This
-- migration stands up the browser path: it (1) ensures the private `avatars`
-- bucket exists and (2) adds owner-isolation policies on storage.objects so an
-- authenticated user can upload / read / replace / remove ONLY objects under
-- their own uid prefix.
--
-- ⚠ GOVERNANCE: the avatars-storage-bucket spec (specs/data/avatars-storage-bucket.md,
-- decision #4) deliberately chose service-role writes and DEFERRED storage RLS,
-- to avoid opposing the then-current RLS-off table posture (ADR-0019). That
-- posture has since flipped — ADR-0024 enabled RLS on profiles/family_members,
-- and ADR-0026 mandates client-side module data. Sanctioning browser avatar
-- uploads governed by storage RLS is the natural extension; recorded in ADR-0027,
-- which supersedes that portion of the storage-bucket spec.
--
-- OWNERSHIP PREDICATE (why this expression):
--   @nafios/storage writes avatars at a per-user path:
--     account → `{uid}/avatar.webp`   family → `{uid}/family/{key}.webp`
--   so the owning uid is always the FIRST path segment. `storage.foldername(name)`
--   returns the path segments as a text[]; element [1] is that first segment.
--   The owner check is therefore `(storage.foldername(name))[1] = auth.uid()::text`.
--   (select auth.uid()) is wrapped so Postgres evaluates it once per statement.
--
-- NOTE on upsert: Supabase Storage upsert (used by uploadAvatar for idempotent
-- retries) needs INSERT + SELECT + UPDATE policies — INSERT alone makes a
-- replacement silently fail. All four verbs are covered below (DELETE too, so a
-- future "remove avatar" affordance works without another migration).
--
-- RLS on storage.objects is already ENABLED by Supabase; we only add policies.
-- ---------------------------------------------------------------------------

-- 1) Ensure the private avatars bucket exists (idempotent). Mirrors
--    specs/data/avatars-storage-bucket.md §A1 so the bucket is reproducible
--    from migrations rather than a one-off dashboard action.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  5242880,                                        -- 5 MiB, in BYTES
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2) Owner-isolation policies on storage.objects, scoped to the avatars bucket.
--    A user reaches only objects whose first path segment is their own uid.
drop policy if exists avatars_owner_select on storage.objects;
create policy avatars_owner_select on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists avatars_owner_insert on storage.objects;
create policy avatars_owner_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists avatars_owner_update on storage.objects;
create policy avatars_owner_update on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists avatars_owner_delete on storage.objects;
create policy avatars_owner_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
