-- The project itself.
--
-- One jsonb document rather than a hundred rows. The editor already treats a
-- project as a single validated object — `PROJECT_KEYS` lists what travels and
-- `sanitiseProject` coerces it — and nothing queries inside it. Decomposition
-- would buy queries nobody runs and charge for them on every save, plus a
-- migration each time the editor grows a setting. What is promoted to columns
-- is what a *list* of projects needs.

create type public.project_status as enum ('draft', 'active', 'archived');

create table public.projects (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users (id) on delete cascade,

  name             text not null default 'Untitled' check (length(name) between 1 and 120),
  -- A draft is a project that has not been declared finished, not a different
  -- kind of thing. A second table would mean two code paths for one document.
  status           public.project_status not null default 'draft',

  document         jsonb not null check (jsonb_typeof(document) = 'object'),
  schema_version   int not null default 1 check (schema_version > 0),

  device           text,
  thumbnail_path   text,
  duration_seconds numeric(8,3) check (duration_seconds is null or duration_seconds >= 0),

  -- Optimistic concurrency. Two tabs on one project is normal, not exotic: a
  -- save carries the revision it read, the update matches on it, and zero rows
  -- back means somebody else got there first.
  revision         bigint not null default 1,

  last_opened_at   timestamptz,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger projects_updated_at
  before update on public.projects
  for each row execute procedure extensions.moddatetime (updated_at);

-- Every column an RLS policy reads has to be indexed, or the policy is a scan.
create index projects_owner_idx on public.projects (owner_id);
create index projects_owner_recent_idx
  on public.projects (owner_id, updated_at desc) where deleted_at is null;
create index projects_owner_status_idx
  on public.projects (owner_id, status) where deleted_at is null;

alter table public.projects enable row level security;

-- One policy per action rather than one for ALL: read and write want different
-- predicates the moment sharing exists, and splitting them later means
-- rewriting the one that was right.
create policy "projects are readable by their owner"
  on public.projects for select
  using ((select auth.uid()) = owner_id);

create policy "projects are created by their owner"
  on public.projects for insert
  with check ((select auth.uid()) = owner_id);

create policy "projects are updated by their owner"
  on public.projects for update
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "projects are deleted by their owner"
  on public.projects for delete
  using ((select auth.uid()) = owner_id);
