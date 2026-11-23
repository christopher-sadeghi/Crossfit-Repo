create table public.coach_stripe_accounts (
  coach_id uuid primary key references public.coaches(id) on delete cascade,
  stripe_account_id text not null unique,
  charges_enabled boolean not null default false,
  details_submitted boolean not null default false,
  portal_configuration_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.coach_stripe_accounts enable row level security;
revoke all on public.coach_stripe_accounts from public, anon, authenticated;
grant select on public.coach_stripe_accounts to authenticated;
grant all on public.coach_stripe_accounts to service_role;
create policy "Coaches can view their Stripe account" on public.coach_stripe_accounts
  for select to authenticated using (coach_id = (select public.current_gym_id()));

create table public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  amount_cents integer not null check (amount_cents between 50 and 10000000),
  currency text not null default 'usd' check (currency = 'usd'),
  interval text not null check (interval in ('month', 'year')),
  stripe_product_id text not null,
  stripe_price_id text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.membership_plans enable row level security;
revoke all on public.membership_plans from public, anon, authenticated;
grant select on public.membership_plans to authenticated;
grant all on public.membership_plans to service_role;
create policy "Coaches can view their membership plans" on public.membership_plans
  for select to authenticated using (coach_id = (select public.current_gym_id()));
create policy "Athletes can view active coach plans" on public.membership_plans
  for select to authenticated using (
    active and coach_id = (select public.current_athlete_coach_id())
  );

create table public.athlete_stripe_customers (
  athlete_id uuid primary key references public.athletes(id) on delete cascade,
  coach_id uuid not null references public.coaches(id) on delete cascade,
  stripe_customer_id text not null,
  created_at timestamptz not null default now()
);
alter table public.athlete_stripe_customers enable row level security;
revoke all on public.athlete_stripe_customers from public, anon, authenticated;
grant select on public.athlete_stripe_customers to authenticated;
grant all on public.athlete_stripe_customers to service_role;

create table public.athlete_memberships (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  coach_id uuid not null references public.coaches(id) on delete cascade,
  plan_id uuid references public.membership_plans(id) on delete set null,
  stripe_subscription_id text not null unique,
  stripe_customer_id text not null,
  status text not null check (status in (
    'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due',
    'canceled', 'unpaid', 'paused'
  )),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index athlete_memberships_athlete_created_idx
  on public.athlete_memberships (athlete_id, created_at desc);
alter table public.athlete_memberships enable row level security;
revoke all on public.athlete_memberships from public, anon, authenticated;
grant select on public.athlete_memberships to authenticated;
grant all on public.athlete_memberships to service_role;
create policy "Coaches can view their athlete memberships" on public.athlete_memberships
  for select to authenticated using (coach_id = (select public.current_gym_id()));
create policy "Athletes can view their own memberships" on public.athlete_memberships
  for select to authenticated using (athlete_id = (select public.current_athlete_id()));

create table public.stripe_webhook_events (
  id text primary key,
  received_at timestamptz not null default now()
);
alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from public, anon, authenticated;
grant select on public.stripe_webhook_events to authenticated;
grant all on public.stripe_webhook_events to service_role;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (
  kind in (
    'result_logged', 'workout_adjusted', 'low_readiness', 'message', 'missed_workouts',
    'coach_message', 'schedule_changed', 'suggestion_approved', 'progress_report',
    'progress_check_in', 'high_training_load', 'form_check', 'assistant_red_flag',
    'form_reviewed', 'check_in_reminder', 'payment_failed'
  )
);
