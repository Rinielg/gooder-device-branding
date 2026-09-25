-- History and autosave, told apart by a flag.
--
-- Not undo: the editor already keeps fifty steps in memory. This answers "what
-- did this look like last Tuesday".

create table public.project_versions (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  document       jsonb not null check (jsonb_typeof(document) = 'object'),
  schema_version int not null default 1 check (schema_version > 0),
  label          text check (label is null or length(label) <= 120),
  is_autosave    boolean not null default true,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index project_versions_recent_idx
  on public.project_versions (project_id, created_at desc);

-- Autosaves would outgrow everything else. Twenty per project, and every
-- version somebody bothered to name kept forever.
create function public.prune_project_versions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.project_versions
   where id in (
     select v.id
       from public.project_versions v
      where v.project_id = new.project_id and v.is_autosave
      order by v.created_at desc
      offset 20
   );
  return null;
end;
$$;

create trigger project_versions_prune
  after insert on public.project_versions
  for each row when (new.is_autosave)
  execute function public.prune_project_versions();

alter table public.project_versions enable row level security;

create policy "versions are readable through their project"
  on public.project_versions for select
  using (exists (
    select 1 from public.projects p
     where p.id = project_id and p.owner_id = (select auth.uid())
  ));

create policy "versions are written through their project"
  on public.project_versions for insert
  with check (exists (
    select 1 from public.projects p
     where p.id = project_id and p.owner_id = (select auth.uid())
  ));

create policy "versions are deleted through their project"
  on public.project_versions for delete
  using (exists (
    select 1 from public.projects p
     where p.id = project_id and p.owner_id = (select auth.uid())
  ));
