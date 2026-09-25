-- What a version changed, stored beside the version.
--
-- The summary is computed on the client from the document it is replacing, by
-- the same vocabulary the undo stack uses. Computing it at read time instead
-- would mean fetching two full documents per row just to draw a list.
--
-- `changes` is the expanded detail: one row per thing that moved, so the panel
-- can show a headline and open it without another request.

alter table public.project_versions
  add column summary text check (summary is null or length(summary) <= 500),
  add column changes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(changes) = 'array');

-- Fifty, to match the editor's undo depth. The panel is meant to be the same
-- history seen from further away, and two different depths would be two
-- different answers to "how far back can I go".
create or replace function public.prune_project_versions()
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
      offset 50
   );
  return null;
end;
$$;
