-- What each tier may do, as data.
--
-- Scattering `if (plan === 'pro')` through the app means the answer lives in
-- whichever file you happen to be reading. Here it is one table, and the
-- limits that matter are enforced by a trigger — a limit only in the UI is a
-- suggestion that anyone with the anon key can ignore.

create table public.plans (
  key               text primary key,
  name              text not null,
  rank              int not null,
  stripe_product_id text references public.products (id) on delete set null
);

create table public.plan_limits (
  plan_key    text not null references public.plans (key) on delete cascade,
  feature     text not null,
  -- Null means unlimited. Absent means denied: a feature nobody listed for a
  -- plan is one that plan does not have.
  limit_value numeric,
  primary key (plan_key, feature)
);

insert into public.plans (key, name, rank) values
  ('free',   'Free',   0),
  ('pro',    'Pro',    1),
  ('studio', 'Studio', 2)
on conflict (key) do nothing;

insert into public.plan_limits (plan_key, feature, limit_value) values
  ('free',   'projects',     3),
  ('free',   'export_px',    1920),
  ('free',   'video_export', 0),
  ('pro',    'projects',     null),
  ('pro',    'export_px',    3840),
  ('pro',    'video_export', 1),
  ('studio', 'projects',     null),
  ('studio', 'export_px',    7680),
  ('studio', 'video_export', 1)
on conflict (plan_key, feature) do nothing;

/* ------------------------------------------------------------------ */

-- Takes a uid, so triggers can ask about the row's owner. NOT granted to
-- users: `current_plan(someone_else)` would otherwise read a stranger's
-- billing state. The no-argument wrapper below is the public door.
create function public.plan_for(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select coalesce(pl.key, pd.metadata ->> 'plan_key')
       from public.subscriptions s
       join public.prices pr on pr.id = s.price_id
       join public.products pd on pd.id = pr.product_id
       left join public.plans pl on pl.stripe_product_id = pd.id
      where s.user_id = p_uid
        and s.status in ('trialing', 'active')
      order by s.current_period_end desc
      limit 1),
    'free');
$$;

revoke execute on function public.plan_for(uuid) from public, anon, authenticated;

create function public.current_plan()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.plan_for((select auth.uid()));
$$;

create function public.plan_allows(p_feature text, p_wanted numeric, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select l.limit_value is null or p_wanted <= l.limit_value
       from public.plan_limits l
      where l.plan_key = public.plan_for(p_uid) and l.feature = p_feature),
    false);
$$;

revoke execute on function public.plan_allows(text, numeric, uuid) from public, anon, authenticated;

-- What a signed-in user may ask about themselves.
create function public.may_i(p_feature text, p_wanted numeric default 1)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.plan_allows(p_feature, p_wanted, (select auth.uid()));
$$;

/* ------------------------------------------------------------------ */

create function public.enforce_project_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  select count(*) into n
    from public.projects
   where owner_id = new.owner_id and deleted_at is null;

  if not public.plan_allows('projects', n + 1, new.owner_id) then
    raise exception 'This plan allows % project(s).', n
      using errcode = 'check_violation', hint = 'Upgrade, or archive a project first.';
  end if;
  return new;
end;
$$;

create trigger projects_enforce_limit
  before insert on public.projects
  for each row execute function public.enforce_project_limit();

alter table public.plans       enable row level security;
alter table public.plan_limits enable row level security;

create policy "plans are readable" on public.plans
  for select to authenticated using (true);
create policy "plan limits are readable" on public.plan_limits
  for select to authenticated using (true);
