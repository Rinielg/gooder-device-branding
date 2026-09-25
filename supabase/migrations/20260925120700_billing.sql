-- The Stripe mirror.
--
-- Supabase does not sell subscriptions to your users; Stripe does. These four
-- tables are a local copy kept in step by a webhook, because reading Stripe on
-- a request path means a network call per query.
--
-- Written ONLY by the webhook handler, using the service role — which bypasses
-- RLS, and whose key never reaches a browser. There is deliberately no insert
-- or update policy on any of them: a subscription a user can edit is not a
-- subscription.

create table public.customers (
  id                 uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text unique
);

create table public.products (
  id          text primary key,
  active      boolean,
  name        text,
  description text,
  image       text,
  metadata    jsonb
);

create type public.pricing_type     as enum ('one_time', 'recurring');
create type public.pricing_interval as enum ('day', 'week', 'month', 'year');

create table public.prices (
  id                text primary key,
  product_id        text references public.products (id) on delete cascade,
  active            boolean,
  description       text,
  currency          text check (currency is null or char_length(currency) = 3),
  unit_amount       bigint,
  type              public.pricing_type,
  interval          public.pricing_interval,
  interval_count    int,
  trial_period_days int,
  metadata          jsonb
);

-- The enum mirrors Stripe's own values exactly. A tidier set would mean
-- translating on every webhook, and translations are where state machines go
-- wrong.
create type public.subscription_status as enum (
  'trialing', 'active', 'canceled', 'incomplete',
  'incomplete_expired', 'past_due', 'unpaid', 'paused'
);

create table public.subscriptions (
  id                   text primary key,
  user_id              uuid not null references auth.users (id) on delete cascade,
  status               public.subscription_status,
  price_id             text references public.prices (id),
  quantity             int,
  cancel_at_period_end boolean not null default false,
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
create index subscriptions_live_idx
  on public.subscriptions (user_id, current_period_end desc)
  where status in ('trialing', 'active');

alter table public.customers     enable row level security;
alter table public.products      enable row level security;
alter table public.prices        enable row level security;
alter table public.subscriptions enable row level security;

-- The catalogue is public to anyone signed in; what it costs is not a secret.
create policy "products are readable" on public.products
  for select to authenticated using (true);
create policy "prices are readable" on public.prices
  for select to authenticated using (true);

create policy "a customer row is readable by its owner" on public.customers
  for select using ((select auth.uid()) = id);
create policy "a subscription is readable by its owner" on public.subscriptions
  for select using ((select auth.uid()) = user_id);
