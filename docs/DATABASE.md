# Database

The schema for putting Gooder Device Branding behind Supabase: accounts,
projects, drafts, media, saved angles, exports and billing.

**Built.** The migrations are in [`supabase/migrations/`](../supabase/migrations),
applied against a real database, with an RLS suite in
[`supabase/tests/rls.mjs`](../supabase/tests/rls.mjs) — 23 assertions, all
passing. Nothing in the app talks to them yet; that is the next job, and the
order is at the end of this file.

Where the migrations differ from what is written below, they are right and a
note says why.

---

## One correction before anything else

**Supabase does not sell subscriptions to your users.** It has auth, Postgres,
storage and edge functions; billing is Stripe. What people mean by "the
Supabase subscription feature" is the documented Stripe integration — a set of
tables in your database kept in step with Stripe by a webhook. Supabase also
ships a Stripe **foreign data wrapper**, which queries Stripe live as if it
were a table; that is right for an admin screen and wrong for anything on a
request path, because every read is a network call to Stripe.

So: Stripe holds the money, your database holds a mirror, and a webhook keeps
the mirror honest. The mirror is what your policies and limits read.

---

## The decision that shapes everything else

**A project is stored as one `jsonb` document, not as a hundred rows.**

The app already treats a project as a single validated object. `PROJECT_KEYS`
lists exactly what travels, `sanitiseProject` coerces an untrusted one onto the
defaults, and the whole thing is read and written at once. Nothing queries
inside it — no screen asks "which projects have a keyframe after 3 seconds".

Decomposing it into `tracks`, `keyframes`, `lights`, `channels` tables would
buy queries nobody runs, and charge for them on every save: five round trips
instead of one, a transaction to keep them consistent, and a migration every
time the editor grows a setting. The editor grows a setting most weeks.

What gets promoted out of the document into real columns is the handful of
things a *list* of projects needs: name, status, device, thumbnail, when it
changed. Those are indexed and queried; everything else rides along inside.

The rule to hold onto: **a row from the database is as untrusted as a file.**
`sanitiseProject` runs on load from Postgres exactly as it runs on load from
disk. A document written by an older build, a different build, or a hand-edited
row is the same problem, and it already has a solution.

---

## Tables

### Overview

| Table | Holds | Row count, roughly |
|---|---|---|
| `profiles` | Who someone is | 1 per user |
| `projects` | The working document | 10s–100s per user |
| `project_versions` | Autosaves and named snapshots | 10s per project |
| `assets` | Uploaded media, by reference | 10s per user |
| `angle_presets` | The reusable angle library | 10s per user |
| `exports` | What was rendered, and how big | 100s per user |
| `customers` · `products` · `prices` · `subscriptions` | The Stripe mirror | 1 per user / small |
| `plans` · `plan_limits` | What each tier may do | Tens, total |

Every table has RLS on, owns a `created_at`, and — where it can be edited — an
`updated_at` kept by a trigger rather than by the client.

---

### `profiles`

One row per account, created by a trigger so it can never be missing.

```sql
create table public.profiles (
  id                     uuid primary key references auth.users (id) on delete cascade,
  display_name           text,
  -- An uploaded avatar is a storage path; one from an OAuth provider is
  -- somebody else's URL. Different things, so different columns rather than
  -- one column with a rule nobody remembers.
  avatar_path            text,
  avatar_url             text,
  company                text,
  locale                 text default 'en',
  theme                  text check (theme in ('light','dark','system')) default 'system',
  marketing_opt_in       boolean not null default false,
  onboarding_completed_at timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
```

`auth.users` is Supabase's; never write to it, never duplicate the email into
`profiles`. Read the email from the session. Copying it gives you two answers
to one question and no rule for which wins.

```sql
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_path)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

`set search_path = ''` on every `security definer` function is not optional —
without it the function resolves names against whatever path the caller has,
and a caller controls their path. Supabase's own linter flags its absence.

---

### `projects`

```sql
create type public.project_status as enum ('draft', 'active', 'archived');

create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users (id) on delete cascade,

  name            text not null default 'Untitled' check (length(name) between 1 and 120),
  status          public.project_status not null default 'draft',

  -- The Project object the editor already serialises. PROJECT_KEYS defines it.
  document        jsonb not null check (jsonb_typeof(document) = 'object'),
  schema_version  int  not null default 1,

  -- Promoted out of the document because the project list needs them.
  device          text,
  thumbnail_path  text,
  duration_seconds numeric(8,3),

  -- Optimistic concurrency. Two tabs on one project is normal, not exotic.
  revision        bigint not null default 1,

  last_opened_at  timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index projects_owner_recent_idx
  on public.projects (owner_id, updated_at desc)
  where deleted_at is null;

create index projects_owner_status_idx
  on public.projects (owner_id, status)
  where deleted_at is null;

-- Every column an RLS policy reads must be indexed, or the policy is a scan.
create index projects_owner_idx on public.projects (owner_id);
```

**`status` covers the draft requirement directly.** A draft is a project like
any other — it has a document, it opens in the editor, it just has not been
declared finished. A separate drafts table would mean two code paths for one
thing.

**`deleted_at` is a soft delete**, so "deleted" is undoable and a trash view is
a `where deleted_at is not null`. Hard-delete on a schedule if you want.

**`revision` is how two tabs stop clobbering each other.** Every save carries
the revision it read; the update matches on it and bumps it:

```sql
update public.projects
   set document = $1, revision = revision + 1, updated_at = now()
 where id = $2 and revision = $3
returning revision;
```

Zero rows back means somebody else saved first. Show that, rather than
overwriting work silently — the alternative is a last-write-wins race that
loses whichever tab the user was not looking at.

---

### `project_versions`

History and autosave in one table, told apart by a flag.

```sql
create table public.project_versions (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  document       jsonb not null check (jsonb_typeof(document) = 'object'),
  schema_version int not null,
  label          text,                       -- 'Before the rebrand', or an edit label
  is_autosave    boolean not null default true,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index project_versions_recent_idx
  on public.project_versions (project_id, created_at desc);
```

The live document lives on `projects`; this is the trail behind it. The editor
already has 50 steps of in-memory undo, so this is not undo — it is the answer
to "what did this look like last Tuesday".

Autosaves need pruning or they will outgrow everything else. Keep the last 20
per project and every named version forever:

```sql
create function public.prune_project_versions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.project_versions
   where id in (
     select id from public.project_versions
      where project_id = new.project_id and is_autosave
      order by created_at desc
      offset 20
   );
  return null;
end;
$$;

create trigger prune_versions
  after insert on public.project_versions
  for each row when (new.is_autosave)
  execute function public.prune_project_versions();
```

---

### `assets`

This closes a hole the app has today. Uploaded images and video currently live
behind `blob:` URLs that die with the page — `loadPersisted` nulls them on the
way in, which is honest but means media never survives a reload.

```sql
create type public.asset_kind as enum (
  'screen_image', 'screen_video',
  'background_image', 'background_video',
  'hdri', 'lottie', 'thumbnail', 'export'
);

create table public.assets (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users (id) on delete cascade,
  -- Null means a library asset, reusable across projects.
  project_id     uuid references public.projects (id) on delete cascade,

  kind           public.asset_kind not null,
  bucket         text not null default 'assets',
  storage_path   text not null,
  original_name  text,

  mime_type      text not null,
  byte_size      bigint not null check (byte_size > 0),
  width          int,
  height         int,
  duration_seconds numeric(8,3),
  checksum       text,                        -- sha-256, for dedupe

  created_at     timestamptz not null default now()
);

create unique index assets_owner_path_idx on public.assets (bucket, storage_path);
create index assets_owner_idx on public.assets (owner_id);
create index assets_project_idx on public.assets (project_id) where project_id is not null;
create unique index assets_dedupe_idx
  on public.assets (owner_id, kind, checksum) where checksum is not null;
```

**The document stores asset ids, never URLs.** `background.imageUrl` becomes
`background.assetId`, resolved to a signed URL when the project loads. A URL
written into a saved project is a time bomb: signed URLs expire, buckets get
renamed, and a project that was fine last month opens with a missing texture
and no explanation. An id does not rot.

That is a change to the app's `Project` shape, so it needs a `migrateAssets`
beside the existing `migrateKeyframes` — same pattern, same reason, and
`STORAGE_KEY` still does not get bumped.

---

### `angle_presets`

Angle presets live in the project document today. They should *also* exist as a
user-level library, because the whole point of the description field is to be
matched against later, across projects.

```sql
create table public.angle_presets (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users (id) on delete cascade,

  name           text not null check (length(name) between 1 and 80),
  -- What the angle is FOR, in plain language. Data an agent reads,
  -- never an instruction it follows.
  description    text not null default '',
  tags           text[] not null default '{}',
  scope          text not null,                -- 'pose' | 'camera' | 'scene' | …
  value          jsonb not null,               -- a Sample: TrackId -> channel values
  thumbnail_path text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index angle_presets_owner_idx on public.angle_presets (owner_id);
create index angle_presets_tags_idx  on public.angle_presets using gin (tags);
```

For the Figma plugin these descriptions were written for — "the bottom section
where the navigation is" matching a zoomed-in low angle — add a search column
now so the data is there when the feature is:

```sql
-- Cheap, exact-ish, no extra service:
alter table public.angle_presets
  add column search tsvector
  generated always as (
    to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,''))
  ) stored;
create index angle_presets_search_idx on public.angle_presets using gin (search);

-- Or semantic, if plain-language matching needs to be good:
create extension if not exists vector with schema extensions;
alter table public.angle_presets add column embedding extensions.vector(1536);
create index on public.angle_presets
  using hnsw (embedding extensions.vector_cosine_ops);
```

Start with `tsvector`. Add the embedding when full-text matching demonstrably
is not good enough — the column can sit empty until then, and backfilling it is
one job.

**Security note, repeating what the code already says:** a preset description
is authored text that an agent will read. It is data. Anything that feeds these
into a model must treat them as untrusted input, never as instructions.

---

### `exports`

Worth having the moment plan limits exist, because a limit you cannot count is
a limit you cannot enforce.

```sql
create type public.export_format as enum ('png', 'mp4', 'webm');
create type public.export_status as enum ('queued', 'running', 'done', 'failed');

create table public.exports (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  project_id    uuid references public.projects (id) on delete set null,

  format        public.export_format not null,
  width         int not null,
  height        int not null,
  fps           int,
  duration_seconds numeric(8,3),
  transparent   boolean not null default false,

  status        public.export_status not null default 'done',
  error         text,
  storage_path  text,
  byte_size     bigint,

  created_at    timestamptz not null default now()
);

create index exports_owner_month_idx on public.exports (owner_id, created_at desc);
```

Exports run in the browser today, so a row is a record rather than a job. The
`queued`/`running` states are there so moving rendering to a worker later does
not need a migration.

---

### Billing: the Stripe mirror

Four tables, written **only** by the webhook handler using the service role.
Nothing client-side may write to any of them — a subscription a user can update
is not a subscription.

```sql
create table public.customers (
  id                 uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text unique
);

create table public.products (
  id          text primary key,        -- Stripe product id
  active      boolean,
  name        text,
  description text,
  image       text,
  metadata    jsonb
);

create type public.pricing_type     as enum ('one_time', 'recurring');
create type public.pricing_interval as enum ('day', 'week', 'month', 'year');

create table public.prices (
  id                text primary key,  -- Stripe price id
  product_id        text references public.products (id),
  active            boolean,
  currency          text check (char_length(currency) = 3),
  unit_amount       bigint,
  type              public.pricing_type,
  interval          public.pricing_interval,
  interval_count    int,
  trial_period_days int,
  metadata          jsonb
);

create type public.subscription_status as enum (
  'trialing', 'active', 'canceled', 'incomplete',
  'incomplete_expired', 'past_due', 'unpaid', 'paused'
);

create table public.subscriptions (
  id                   text primary key,   -- Stripe subscription id
  user_id              uuid not null references auth.users (id) on delete cascade,
  status               public.subscription_status,
  price_id             text references public.prices (id),
  quantity             int,
  cancel_at_period_end boolean,
  current_period_start timestamptz not null default now(),
  current_period_end   timestamptz not null default now(),
  trial_start          timestamptz,
  trial_end            timestamptz,
  cancel_at            timestamptz,
  canceled_at          timestamptz,
  ended_at             timestamptz,
  created              timestamptz not null default now(),
  metadata             jsonb
);

create index subscriptions_user_idx on public.subscriptions (user_id);
```

The enum mirrors Stripe's own values exactly. Inventing a tidier set means
translating on every webhook, and translations are where state machines go
wrong.

### Entitlements, as data

Do not scatter `if (plan === 'pro')` through the app. Put the limits in a table
and read them.

```sql
create table public.plans (
  key        text primary key,                  -- 'free' | 'pro' | 'studio'
  name       text not null,
  rank       int not null,                      -- for upgrade/downgrade comparisons
  stripe_product_id text references public.products (id)
);

create table public.plan_limits (
  plan_key   text not null references public.plans (key) on delete cascade,
  feature    text not null,                     -- 'projects' | 'export_px' | 'video_export'
  limit_value numeric,                          -- null = unlimited
  primary key (plan_key, feature)
);

insert into public.plans (key, name, rank) values
  ('free', 'Free', 0), ('pro', 'Pro', 1), ('studio', 'Studio', 2);

insert into public.plan_limits values
  ('free',   'projects',     3),
  ('free',   'export_px',    1920),
  ('free',   'video_export', 0),
  ('pro',    'projects',     null),
  ('pro',    'export_px',    3840),
  ('pro',    'video_export', 1),
  ('studio', 'projects',     null),
  ('studio', 'export_px',    7680),
  ('studio', 'video_export', 1);
```

Two corrections the migration makes to this, both found by building it:

- **A function that takes a uid must not be callable by users.**
  `current_plan(someone_else)` would read a stranger's billing state. The
  uid-taking pair — `plan_for(uuid)` and `plan_allows(text, numeric, uuid)` —
  have `execute` revoked, so only triggers and the service role reach them.
  Users get `current_plan()` and `may_i(feature, wanted)`, which can only ever
  ask about themselves. The RLS suite asserts the leak is closed.
- **Parameters are prefixed `p_`.** `where l.feature = feature` is ambiguous
  against the column of the same name, and Postgres says so.

```sql
-- Takes a uid, so a trigger can ask about the row's owner. NOT granted.
create function public.plan_for(p_uid uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select coalesce(pl.key, pd.metadata ->> 'plan_key')
       from public.subscriptions s
       join public.prices pr on pr.id = s.price_id
       join public.products pd on pd.id = pr.product_id
       left join public.plans pl on pl.stripe_product_id = pd.id
      where s.user_id = p_uid and s.status in ('trialing', 'active')
      order by s.current_period_end desc
      limit 1),
    'free');
$$;
revoke execute on function public.plan_for(uuid) from public, anon, authenticated;

-- The public door: it can only ask about you.
create function public.may_i(p_feature text, p_wanted numeric default 1)
returns boolean language sql stable security definer set search_path = ''
as $$ select public.plan_allows(p_feature, p_wanted, (select auth.uid())); $$;
```

Then a limit is enforced where it cannot be argued with:

```sql
create function public.enforce_project_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare n int;
begin
  select count(*) into n
    from public.projects
   where owner_id = new.owner_id and deleted_at is null;

  if not public.plan_allows('projects', n + 1, new.owner_id) then
    raise exception 'project limit reached for the current plan'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger projects_limit
  before insert on public.projects
  for each row execute function public.enforce_project_limit();
```

A limit enforced only in the UI is not a limit. It is a suggestion that anyone
with the anon key and five minutes can ignore — the same lesson as the frame
bounds that lived in the number field while a loaded file could set any size.

---

## Row level security

On for every table, always. Deny by default, then say who may do what.

```sql
alter table public.profiles         enable row level security;
alter table public.projects         enable row level security;
alter table public.project_versions enable row level security;
alter table public.assets           enable row level security;
alter table public.angle_presets    enable row level security;
alter table public.exports          enable row level security;
alter table public.customers        enable row level security;
alter table public.subscriptions    enable row level security;
alter table public.products         enable row level security;
alter table public.prices           enable row level security;
alter table public.plans            enable row level security;
alter table public.plan_limits      enable row level security;
```

```sql
-- Your own profile.
create policy "read own profile"   on public.profiles
  for select using ((select auth.uid()) = id);
create policy "update own profile" on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Your own projects. One policy per action beats one for ALL: the read and the
-- write want different predicates the moment sharing exists.
create policy "read own projects"   on public.projects
  for select using ((select auth.uid()) = owner_id);
create policy "create own projects" on public.projects
  for insert with check ((select auth.uid()) = owner_id);
create policy "update own projects" on public.projects
  for update using ((select auth.uid()) = owner_id)
              with check ((select auth.uid()) = owner_id);
create policy "delete own projects" on public.projects
  for delete using ((select auth.uid()) = owner_id);

-- Versions follow their project.
create policy "read own versions" on public.project_versions
  for select using (exists (
    select 1 from public.projects p
     where p.id = project_id and p.owner_id = (select auth.uid())));
create policy "write own versions" on public.project_versions
  for insert with check (exists (
    select 1 from public.projects p
     where p.id = project_id and p.owner_id = (select auth.uid())));

-- Catalogue is readable by anyone signed in; nobody writes it but the webhook.
create policy "read products" on public.products for select to authenticated using (true);
create policy "read prices"   on public.prices   for select to authenticated using (true);
create policy "read plans"    on public.plans    for select to authenticated using (true);
create policy "read limits"   on public.plan_limits for select to authenticated using (true);

-- Billing is readable by its owner and writable by no one.
create policy "read own subscription" on public.subscriptions
  for select using ((select auth.uid()) = user_id);
create policy "read own customer" on public.customers
  for select using ((select auth.uid()) = id);
```

Three things that are easy to get wrong:

- **Wrap `auth.uid()` in a `select`.** `using ((select auth.uid()) = owner_id)`
  lets Postgres evaluate it once as an InitPlan instead of once per row. On a
  list of projects it is the difference between a millisecond and a scan.
- **Index every column a policy touches.** `owner_id` is in every predicate
  here, so it is indexed in every table above.
- **The service role bypasses RLS entirely.** The webhook handler, and only
  the webhook handler, uses it. That key never reaches the browser.

---

## Storage

```sql
insert into storage.buckets (id, name, public) values
  ('assets',     'assets',     false),
  ('thumbnails', 'thumbnails', false),
  ('exports',    'exports',    false),
  ('avatars',    'avatars',    false);
```

Everything private, served through signed URLs. Path convention puts the owner
first so the policy is a string comparison rather than a join:

```
assets/{user_id}/{asset_id}.{ext}
thumbnails/{user_id}/{project_id}.webp
exports/{user_id}/{export_id}.{ext}
avatars/{user_id}.webp
```

```sql
create policy "own folder read" on storage.objects
  for select to authenticated
  using (bucket_id in ('assets','thumbnails','exports','avatars')
         and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "own folder write" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('assets','thumbnails','exports','avatars')
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "own folder delete" on storage.objects
  for delete to authenticated
  using ((storage.foldername(name))[1] = (select auth.uid())::text);
```

Size and type limits belong on the bucket, not on the upload form — set
`file_size_limit` and `allowed_mime_types` per bucket.

---

## Cross-cutting requirements

| Requirement | How |
|---|---|
| `updated_at` is never the client's word | `moddatetime` trigger on every table with the column |
| Ids sort by time | `gen_random_uuid()` works; UUIDv7 is better for index locality if you can use it |
| Migrations are reviewable | Supabase CLI, `supabase/migrations/*.sql`, committed |
| Types match the app | `supabase gen types typescript --linked > src/state/database.types.ts`, in CI |
| Nothing leaks by default | RLS on before the first insert, not after the first user |
| Long text is bounded | `check (length(x) between …)` on every user-authored string |
| Deletes are recoverable | `deleted_at`, with a scheduled hard delete via `pg_cron` |
| The webhook is idempotent | Stripe retries; upsert on the Stripe id, never insert |
| Nothing trusts the document | `sanitiseProject` on the way out of the database as well as the way in |

---

## How it meets the app

The editor changes less than it looks.

**1. The document is what already exists.** `Project` — device, variant, frame,
stage, lighting, transform, background, screen, composition, presets — becomes
`projects.document` verbatim. `pickProject` already produces exactly this
object for `localStorage` and for the export file.

**2. localStorage becomes the offline cache.** Signed out, the app works as it
does now against `STORAGE_KEY`. Signing in offers to bring that project up as a
row; after that the local copy is a cache and a crash mat, not the source.

**3. Loading is a boundary, so it is validated.** The same call:

```ts
const shell = sanitiseProject(row.document, DEFAULT_SHELL)
```

A row is not safer than a file. It was written by some version of this app,
possibly not this one.

**4. Saving is debounced and versioned.** The existing persist is 400ms to
localStorage; over a network make it 2–5 seconds, send `revision`, and handle
the zero-rows-updated case as a conflict rather than an error to swallow.

**5. Media stops being ephemeral.** `imageUrl`/`videoUrl`/`meshUrl` become
asset ids resolved at load. This is the one real change to the document shape,
and it wants a `migrateAssets` beside `migrateKeyframes`.

**6. Angle presets gain a second home.** They stay in the document so a project
is self-contained, and sync to `angle_presets` so the library outlives any one
project. The library row is the copy the Figma plugin will match against.

---

## Build order

Each step is usable on its own, which is the point of the order.

| | Step | Why here |
|---|---|---|
| 1 | Auth, `profiles`, the trigger | Nothing else can be owned until something owns it |
| 2 | `projects` + RLS + save/load/list | The whole product, minus polish |
| 3 | `assets` + buckets + `migrateAssets` | Closes the media hole that exists today |
| 4 | `project_versions` + autosave | Cheap once saving works |
| 5 | `angle_presets` library | Unblocks the Figma plugin |
| 6 | Stripe mirror, webhook, `plans` | Only worth it once there is something to sell |
| 7 | `exports` + limit triggers | Enforcement needs both of the above |

Step 2 is where the risk is: RLS wrong is a data breach, and RLS is the one
part of this that cannot be verified by looking at it. That test exists —
`npm run db:test` creates two users and asserts they stay apart, including that
a project cannot be created in someone else's name, that a stale save changes
nothing, that the project limit is refused by the database rather than the
interface, and that nobody can ask what somebody else is paying for. Run it
after any change to a policy.

---

## Deliberately not designed

**Teams and shared workspaces.** Everything above is owned by a `user_id`. A
workspace layer would put a join in every policy, and nothing asked for one
yet. If it comes: add `workspace_id` to the owned tables, give every existing
user a personal workspace, backfill, and swap the policy predicate from
`owner_id = auth.uid()` to a membership check. Doing it later costs a migration.
Doing it now costs every query, forever.

**Realtime collaboration.** `revision` makes two tabs safe. Two *people* on one
project at once is a different product, and it needs CRDTs or a lock, not a
bigger schema.

**Comments, sharing links, public galleries.** All plausible; none asked for.
Each is a table and a policy, added when the feature is.
