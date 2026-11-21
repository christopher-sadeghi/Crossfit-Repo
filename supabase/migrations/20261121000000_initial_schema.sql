-- FitCoach AI initial schema.
-- Every coach-owned table carries coach_id so row level security is a single check
-- (coach_id = auth.uid()). Composite foreign keys on (id, coach_id) guarantee that
-- child rows can only point at parents owned by the same coach.
-- Weights and loads are stored in kg; the UI converts to the coach's preferred unit.

-- Types --------------------------------------------------------------------

create type public.weight_unit as enum ('lb', 'kg');
create type public.experience_level as enum ('beginner', 'intermediate', 'advanced', 'competitor');
create type public.athlete_status as enum ('active', 'archived');
create type public.movement_category as enum ('weightlifting', 'gymnastics', 'monostructural', 'other');
create type public.movement_measure as enum ('reps', 'load', 'distance', 'calories', 'time');
create type public.workout_type as enum ('for_time', 'amrap', 'emom', 'strength', 'other');
create type public.meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack');
create type public.goal_type as enum ('performance', 'body_composition', 'skill');
create type public.goal_status as enum ('active', 'achieved', 'abandoned');
create type public.suggestion_type as enum ('write_workout', 'scale_workout', 'adjust_macros', 'progress_summary');
create type public.suggestion_status as enum ('pending', 'approved', 'edited', 'rejected', 'failed');

-- Helpers ------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Coaches ------------------------------------------------------------------

create table public.coaches (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  gym_name text,
  units public.weight_unit not null default 'lb',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.coaches (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Accounts created before this migration also need a coach profile.
insert into public.coaches (id, full_name)
select id, raw_user_meta_data ->> 'full_name' from auth.users
on conflict (id) do nothing;

-- Athletes -----------------------------------------------------------------

create table public.athletes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches (id) on delete cascade,
  user_id uuid unique references auth.users (id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text,
  birth_date date,
  sex text check (sex in ('female', 'male', 'other')),
  height_cm numeric(5, 1) check (height_cm > 0),
  experience_level public.experience_level not null default 'intermediate',
  injuries text,
  notes text,
  status public.athlete_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, coach_id)
);

create table public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches (id) on delete cascade,
  athlete_id uuid not null,
  measured_on date not null default current_date,
  weight_kg numeric(5, 2) check (weight_kg > 0),
  body_fat_pct numeric(4, 1) check (body_fat_pct between 0 and 100),
  notes text,
  created_at timestamptz not null default now(),
  foreign key (athlete_id, coach_id) references public.athletes (id, coach_id) on delete cascade
);

-- Movements (coach_id null = shared starter library) -----------------------

create table public.movements (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid default auth.uid() references public.coaches (id) on delete cascade, -- null = shared library movement
  name text not null,
  category public.movement_category not null,
  measure public.movement_measure not null default 'reps',
  created_at timestamptz not null default now()
);

create unique index movements_library_name_key on public.movements (lower(name)) where coach_id is null;
create unique index movements_coach_name_key on public.movements (coach_id, lower(name)) where coach_id is not null;

-- Programs and workouts ----------------------------------------------------

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches (id) on delete cascade,
  name text not null,
  description text,
  weeks integer not null default 4 check (weeks between 1 and 52),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, coach_id)
);

create table public.program_assignments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches (id) on delete cascade,
  program_id uuid not null,
  athlete_id uuid not null,
  start_date date not null,
  created_at timestamptz not null default now(),
  unique (program_id, athlete_id),
  foreign key (program_id, coach_id) references public.programs (id, coach_id) on delete cascade,
  foreign key (athlete_id, coach_id) references public.athletes (id, coach_id) on delete cascade
);

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches (id) on delete cascade,
  program_id uuid,
  title text not null,
  workout_type public.workout_type not null,
  time_cap_seconds integer check (time_cap_seconds > 0),
  rounds integer check (rounds > 0),
  description text,
  notes text,
  week_number integer check (week_number > 0),
  day_number integer check (day_number between 1 and 7),
  scheduled_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, coach_id),
  foreign key (program_id, coach_id) references public.programs (id, coach_id) on delete cascade
);

create table public.workout_movements (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches (id) on delete cascade,
  workout_id uuid not null,
  movement_id uuid not null references public.movements (id) on delete restrict,
  position integer not null default 1,
  sets integer check (sets > 0),
  reps integer check (reps > 0),
  load_kg numeric(6, 2) check (load_kg >= 0),
  distance_m numeric(8, 1) check (distance_m > 0),
  calories integer check (calories > 0),
  duration_seconds integer check (duration_seconds > 0),
  notes text,
  foreign key (workout_id, coach_id) references public.workouts (id, coach_id) on delete cascade
);

create table public.athlete_workout_scalings (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches (id) on delete cascade,
  workout_id uuid not null,
  athlete_id uuid not null,
  modifications text not null,
  details jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workout_id, athlete_id),
  foreign key (workout_id, coach_id) references public.workouts (id, coach_id) on delete cascade,
  foreign key (athlete_id, coach_id) references public.athletes (id, coach_id) on delete cascade
);

create table public.workout_results (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches (id) on delete cascade,
  workout_id uuid not null,
  athlete_id uuid not null,
  performed_on date not null default current_date,
  time_seconds integer check (time_seconds > 0),
  rounds integer check (rounds >= 0),
  reps integer check (reps >= 0),
  load_kg numeric(6, 2) check (load_kg >= 0),
  is_rx boolean not null default true,
  notes text,
  logged_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (workout_id, coach_id) references public.workouts (id, coach_id) on delete cascade,
  foreign key (athlete_id, coach_id) references public.athletes (id, coach_id) on delete cascade
);

-- Nutrition ----------------------------------------------------------------

create table public.nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches (id) on delete cascade,
  athlete_id uuid not null,
  calories integer not null check (calories > 0),
  protein_g integer not null check (protein_g >= 0),
  carbs_g integer not null check (carbs_g >= 0),
  fat_g integer not null check (fat_g >= 0),
  start_date date not null default current_date,
  end_date date check (end_date is null or end_date >= start_date),
  notes text,
  created_at timestamptz not null default now(),
  foreign key (athlete_id, coach_id) references public.athletes (id, coach_id) on delete cascade
);

-- Only one current (open-ended) target per athlete.
create unique index nutrition_targets_one_current on public.nutrition_targets (athlete_id) where end_date is null;

create table public.food_logs (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches (id) on delete cascade,
  athlete_id uuid not null,
  logged_on date not null default current_date,
  meal public.meal_type not null,
  food_name text not null,
  calories integer not null default 0 check (calories >= 0),
  protein_g numeric(6, 1) not null default 0 check (protein_g >= 0),
  carbs_g numeric(6, 1) not null default 0 check (carbs_g >= 0),
  fat_g numeric(6, 1) not null default 0 check (fat_g >= 0),
  created_at timestamptz not null default now(),
  foreign key (athlete_id, coach_id) references public.athletes (id, coach_id) on delete cascade
);

-- Goals --------------------------------------------------------------------

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches (id) on delete cascade,
  athlete_id uuid not null,
  title text not null,
  goal_type public.goal_type not null,
  movement_id uuid references public.movements (id) on delete set null,
  metric text,
  unit text,
  start_value numeric,
  target_value numeric,
  target_date date,
  status public.goal_status not null default 'active',
  achieved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (athlete_id, coach_id) references public.athletes (id, coach_id) on delete cascade
);

-- AI suggestions -----------------------------------------------------------
-- Nothing an AI proposes touches real data until the coach approves it.

create table public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches (id) on delete cascade,
  athlete_id uuid,
  suggestion_type public.suggestion_type not null,
  status public.suggestion_status not null default 'pending',
  input jsonb not null default '{}'::jsonb,
  proposal jsonb,
  final jsonb,
  model text,
  error text,
  target_table text,
  target_id uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (athlete_id, coach_id) references public.athletes (id, coach_id) on delete cascade
);

-- Indexes on foreign keys --------------------------------------------------

create index on public.athletes (coach_id);
create index on public.body_metrics (athlete_id, measured_on);
create index on public.body_metrics (coach_id);
create index on public.programs (coach_id);
create index on public.program_assignments (athlete_id);
create index on public.program_assignments (coach_id);
create index on public.workouts (program_id);
create index on public.workouts (coach_id, scheduled_on);
create index on public.workout_movements (workout_id, position);
create index on public.workout_movements (movement_id);
create index on public.workout_movements (coach_id);
create index on public.athlete_workout_scalings (athlete_id);
create index on public.athlete_workout_scalings (coach_id);
create index on public.workout_results (workout_id);
create index on public.workout_results (athlete_id, performed_on);
create index on public.workout_results (coach_id);
create index on public.workout_results (logged_by);
create index on public.nutrition_targets (coach_id);
create index on public.food_logs (athlete_id, logged_on);
create index on public.food_logs (coach_id);
create index on public.goals (athlete_id);
create index on public.goals (movement_id);
create index on public.goals (coach_id);
create index on public.ai_suggestions (coach_id, status, created_at);
create index on public.ai_suggestions (athlete_id);

-- updated_at triggers ------------------------------------------------------

create trigger set_updated_at before update on public.coaches
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.athletes
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.programs
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.workouts
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.athlete_workout_scalings
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.goals
  for each row execute function public.set_updated_at();

-- Row level security -------------------------------------------------------

alter table public.coaches enable row level security;

create policy "Coaches can view their own profile" on public.coaches
  for select to authenticated using (id = (select auth.uid()));
create policy "Coaches can update their own profile" on public.coaches
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

alter table public.movements enable row level security;

create policy "Coaches can view library and own movements" on public.movements
  for select to authenticated using (coach_id is null or coach_id = (select auth.uid()));
create policy "Coaches can add own movements" on public.movements
  for insert to authenticated with check (coach_id = (select auth.uid()));
create policy "Coaches can update own movements" on public.movements
  for update to authenticated using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()));
create policy "Coaches can delete own movements" on public.movements
  for delete to authenticated using (coach_id = (select auth.uid()));

do $$
declare
  t text;
begin
  foreach t in array array[
    'athletes', 'body_metrics', 'programs', 'program_assignments', 'workouts',
    'workout_movements', 'athlete_workout_scalings', 'workout_results',
    'nutrition_targets', 'food_logs', 'goals', 'ai_suggestions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "Coaches manage their own rows" on public.%I for all to authenticated '
      'using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()))',
      t
    );
  end loop;
end;
$$;

-- Foreign keys bypass RLS, so block references to another coach's custom movements.
do $$
declare
  t text;
  movement_visible text := 'movement_id is null or exists (select 1 from public.movements m '
    'where m.id = movement_id and (m.coach_id is null or m.coach_id = (select auth.uid())))';
begin
  foreach t in array array['workout_movements', 'goals'] loop
    execute format(
      'create policy "Only library or own movements (insert)" on public.%I as restrictive '
      'for insert to authenticated with check (%s)', t, movement_visible);
    execute format(
      'create policy "Only library or own movements (update)" on public.%I as restrictive '
      'for update to authenticated using (true) with check (%s)', t, movement_visible);
  end loop;
end;
$$;
