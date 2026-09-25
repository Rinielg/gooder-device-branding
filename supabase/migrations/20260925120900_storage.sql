-- Buckets and their policies.
--
-- Everything private, served through signed URLs. The owner's id is the first
-- path segment so a policy is a string comparison rather than a join:
--
--   assets/{user_id}/{asset_id}.{ext}
--   thumbnails/{user_id}/{project_id}.webp
--   exports/{user_id}/{export_id}.{ext}
--   avatars/{user_id}.webp

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('assets',     'assets',     false, 104857600,
   array['image/png','image/jpeg','image/webp','image/avif','video/mp4','video/webm','application/json','image/vnd.radiance']),
  ('thumbnails', 'thumbnails', false, 2097152,
   array['image/webp','image/png','image/jpeg']),
  ('exports',    'exports',    false, 524288000,
   array['image/png','video/mp4','video/webm']),
  ('avatars',    'avatars',    false, 2097152,
   array['image/webp','image/png','image/jpeg'])
on conflict (id) do nothing;

-- Dropped first so a local reset can re-run this file.
drop policy if exists "gooder reads its own folder"   on storage.objects;
drop policy if exists "gooder writes its own folder"  on storage.objects;
drop policy if exists "gooder updates its own folder" on storage.objects;
drop policy if exists "gooder deletes its own folder" on storage.objects;

create policy "gooder reads its own folder"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('assets', 'thumbnails', 'exports', 'avatars')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "gooder writes its own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('assets', 'thumbnails', 'exports', 'avatars')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "gooder updates its own folder"
  on storage.objects for update to authenticated
  using (
    bucket_id in ('assets', 'thumbnails', 'exports', 'avatars')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id in ('assets', 'thumbnails', 'exports', 'avatars')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "gooder deletes its own folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('assets', 'thumbnails', 'exports', 'avatars')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
