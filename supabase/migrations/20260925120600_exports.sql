-- What was rendered, and how big.
--
-- Exports run in the browser today, so a row is a record rather than a job.
-- The queued and running states exist so moving rendering to a worker later is
-- not a migration.

create type public.export_format as enum ('png', 'mp4', 'webm');
create type public.export_status as enum ('queued', 'running', 'done', 'failed');

create table public.exports (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users (id) on delete cascade,
  project_id       uuid references public.projects (id) on delete set null,

  format           public.export_format not null,
  width            int not null check (width > 0),
  height           int not null check (height > 0),
  fps              int check (fps is null or fps > 0),
  duration_seconds numeric(8,3) check (duration_seconds is null or duration_seconds >= 0),
  transparent      boolean not null default false,

  status           public.export_status not null default 'done',
  error            text,
  storage_path     text,
  byte_size        bigint check (byte_size is null or byte_size > 0),

  created_at       timestamptz not null default now()
);

create index exports_owner_recent_idx on public.exports (owner_id, created_at desc);
create index exports_project_idx on public.exports (project_id) where project_id is not null;

alter table public.exports enable row level security;

create policy "exports are readable by their owner"
  on public.exports for select using ((select auth.uid()) = owner_id);
create policy "exports are created by their owner"
  on public.exports for insert with check ((select auth.uid()) = owner_id);
create policy "exports are deleted by their owner"
  on public.exports for delete using ((select auth.uid()) = owner_id);
