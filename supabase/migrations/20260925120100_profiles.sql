-- One row per account.
--
-- `auth.users` belongs to Supabase: never written to, and never copied from.
-- The email in particular stays there — two answers to one question is one
-- answer too many, and the session already carries it.

create table public.profiles (
  id                      uuid primary key references auth.users (id) on delete cascade,
  display_name            text check (display_name is null or length(display_name) between 1 and 80),
  -- An uploaded avatar lives in storage; one that came from an OAuth provider
  -- is somebody else's URL. They are different things, so they are different
  -- columns rather than one column with a rule nobody remembers.
  avatar_path             text,
  avatar_url              text,
  company                 text check (company is null or length(company) <= 120),
  locale                  text not null default 'en',
  theme                   text not null default 'system' check (theme in ('light', 'dark', 'system')),
  marketing_opt_in        boolean not null default false,
  onboarding_completed_at timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure extensions.moddatetime (updated_at);

-- A profile is created with the account, so it can never be missing. Doing it
-- from the client would mean a signed-in user with nowhere to put their name.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
-- Empty search_path is not optional on a security definer function: without
-- it the body resolves names against whatever path the caller has, and the
-- caller chooses their path.
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, 'there@'), '@', 1)
    ),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

-- `(select auth.uid())` rather than `auth.uid()` throughout: wrapped, Postgres
-- evaluates it once as an InitPlan instead of once per row.
create policy "profiles are readable by their owner"
  on public.profiles for select
  using ((select auth.uid()) = id);

create policy "profiles are editable by their owner"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
