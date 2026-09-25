-- The angle library.
--
-- Presets travel inside a project's document so a project is self-contained;
-- this is the copy that outlives any one project. The description is the whole
-- point: it is what a request gets matched against later — "the bottom section
-- where the navigation is" finding a tight low angle.
--
-- A description is authored text that something will read. It is DATA, never
-- an instruction. Anything that puts these in front of a model treats them as
-- untrusted input.

create table public.angle_presets (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users (id) on delete cascade,

  name           text not null check (length(name) between 1 and 80),
  description    text not null default '' check (length(description) <= 2000),
  tags           text[] not null default '{}',
  scope          text not null,
  value          jsonb not null check (jsonb_typeof(value) = 'object'),
  thumbnail_path text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger angle_presets_updated_at
  before update on public.angle_presets
  for each row execute procedure extensions.moddatetime (updated_at);

-- Full text first. An embedding column can be added when plain matching is
-- demonstrably not good enough; backfilling one is a single job, and carrying
-- a vector index nobody queries is not free.
alter table public.angle_presets
  add column search tsvector
  generated always as (
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))
  ) stored;

create index angle_presets_owner_idx on public.angle_presets (owner_id);
create index angle_presets_search_idx on public.angle_presets using gin (search);
create index angle_presets_tags_idx on public.angle_presets using gin (tags);

alter table public.angle_presets enable row level security;

create policy "presets are readable by their owner"
  on public.angle_presets for select using ((select auth.uid()) = owner_id);
create policy "presets are created by their owner"
  on public.angle_presets for insert with check ((select auth.uid()) = owner_id);
create policy "presets are updated by their owner"
  on public.angle_presets for update
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "presets are deleted by their owner"
  on public.angle_presets for delete using ((select auth.uid()) = owner_id);
