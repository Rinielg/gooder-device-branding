-- Uploaded media, by reference.
--
-- This closes a hole the editor has today: images and video live behind blob:
-- URLs that die with the page, so `loadPersisted` nulls them on the way in.
--
-- The document stores asset ids, never URLs. A signed URL written into a saved
-- project rots — it expires, buckets get renamed, and a project that was fine
-- last month opens with a missing texture and no explanation. An id does not.

create type public.asset_kind as enum (
  'screen_image', 'screen_video',
  'background_image', 'background_video',
  'hdri', 'lottie', 'thumbnail', 'export'
);

create table public.assets (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users (id) on delete cascade,
  -- Null means a library asset, reusable across projects.
  project_id       uuid references public.projects (id) on delete cascade,

  kind             public.asset_kind not null,
  bucket           text not null default 'assets',
  storage_path     text not null,
  original_name    text check (original_name is null or length(original_name) <= 255),

  mime_type        text not null,
  byte_size        bigint not null check (byte_size > 0),
  width            int check (width is null or width > 0),
  height           int check (height is null or height > 0),
  duration_seconds numeric(8,3) check (duration_seconds is null or duration_seconds >= 0),
  checksum         text,

  created_at       timestamptz not null default now()
);

create unique index assets_location_idx on public.assets (bucket, storage_path);
create index assets_owner_idx on public.assets (owner_id);
create index assets_project_idx on public.assets (project_id) where project_id is not null;
-- The same file uploaded twice is one asset.
create unique index assets_dedupe_idx
  on public.assets (owner_id, kind, checksum) where checksum is not null;

alter table public.assets enable row level security;

create policy "assets are readable by their owner"
  on public.assets for select using ((select auth.uid()) = owner_id);
create policy "assets are created by their owner"
  on public.assets for insert with check ((select auth.uid()) = owner_id);
create policy "assets are updated by their owner"
  on public.assets for update
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "assets are deleted by their owner"
  on public.assets for delete using ((select auth.uid()) = owner_id);
