do $$ begin
  create type public.benchmark_kind as enum ('girl', 'hero', 'lift', 'custom');
exception when duplicate_object then null;
end $$;

create table if not exists public.benchmarks (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid default auth.uid() references public.coaches(id) on delete cascade,
  name text not null,
  kind public.benchmark_kind not null,
  workout_type public.workout_type not null,
  description text,
  movement_id uuid references public.movements(id),
  created_at timestamptz not null default now(),
  check (kind <> 'lift' or (movement_id is not null and workout_type = 'strength'))
);
create unique index if not exists benchmarks_library_name on public.benchmarks(lower(name)) where coach_id is null;
create unique index if not exists benchmarks_coach_name on public.benchmarks(coach_id, lower(name)) where coach_id is not null;

create table if not exists public.benchmark_settings (
  coach_id uuid not null default auth.uid() references public.coaches(id) on delete cascade,
  benchmark_id uuid not null references public.benchmarks(id) on delete cascade,
  retest_weeks integer check (retest_weeks between 1 and 104),
  primary key (coach_id, benchmark_id)
);
create table if not exists public.benchmark_results (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches(id) on delete cascade,
  athlete_id uuid not null,
  benchmark_id uuid not null references public.benchmarks(id) on delete cascade,
  performed_on date not null,
  time_seconds integer check (time_seconds > 0),
  rounds integer check (rounds >= 0),
  reps integer check (reps >= 0),
  load_kg numeric(6,2) check (load_kg >= 0),
  rep_max smallint check (rep_max between 1 and 20),
  is_rx boolean not null default true,
  notes text,
  logged_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (athlete_id, coach_id) references public.athletes(id, coach_id) on delete cascade
);
create index if not exists benchmark_results_history on public.benchmark_results(athlete_id, benchmark_id, performed_on);

-- Enforce ownership independently of the caller's role and RLS visibility.
create or replace function public.check_benchmark_reference() returns trigger
language plpgsql security definer set search_path = '' as $$
declare b public.benchmarks;
begin
  select * into b from public.benchmarks where id = new.benchmark_id;
  if not found or (b.coach_id is not null and b.coach_id <> new.coach_id) then
    raise exception 'Benchmark does not belong to this coach' using errcode = '23514';
  end if;
  if tg_table_name = 'benchmark_results' then
    if b.kind <> 'lift' and new.rep_max is not null then
      raise exception 'rep_max is only valid for lifts' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.check_benchmark_reference() from public, anon, authenticated;
drop trigger if exists benchmark_results_reference on public.benchmark_results;
create trigger benchmark_results_reference before insert or update on public.benchmark_results
  for each row execute function public.check_benchmark_reference();
drop trigger if exists benchmark_settings_reference on public.benchmark_settings;
create trigger benchmark_settings_reference before insert or update on public.benchmark_settings
  for each row execute function public.check_benchmark_reference();

do $$
declare t text;
begin
  foreach t in array array['benchmarks','benchmark_settings','benchmark_results'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists "Coaches manage own rows" on public.%I', t);
    execute format('create policy "Coaches manage own rows" on public.%I for all to authenticated using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()))', t);
  end loop;
end $$;
drop policy if exists "Read benchmark library and coach" on public.benchmarks;
create policy "Read benchmark library and coach" on public.benchmarks for select to authenticated
  using (coach_id is null or coach_id = (select public.current_athlete_coach_id()));
drop policy if exists "Athletes read settings" on public.benchmark_settings;
create policy "Athletes read settings" on public.benchmark_settings for select to authenticated
  using (coach_id = (select public.current_athlete_coach_id()));
drop policy if exists "Athletes read own results" on public.benchmark_results;
create policy "Athletes read own results" on public.benchmark_results for select to authenticated
  using (athlete_id = (select public.current_athlete_id()));
drop policy if exists "Athletes log own results" on public.benchmark_results;
create policy "Athletes log own results" on public.benchmark_results for insert to authenticated
  with check (athlete_id = (select public.current_athlete_id()) and coach_id = (select public.current_athlete_coach_id()) and logged_by = (select auth.uid()));
drop policy if exists "Athletes update own logged results" on public.benchmark_results;
create policy "Athletes update own logged results" on public.benchmark_results for update to authenticated
  using (athlete_id = (select public.current_athlete_id()) and coach_id = (select public.current_athlete_coach_id()) and logged_by = (select auth.uid()))
  with check (athlete_id = (select public.current_athlete_id()) and coach_id = (select public.current_athlete_coach_id()) and logged_by = (select auth.uid()));
drop policy if exists "Athletes delete own logged results" on public.benchmark_results;
create policy "Athletes delete own logged results" on public.benchmark_results for delete to authenticated
  using (athlete_id = (select public.current_athlete_id()) and coach_id = (select public.current_athlete_coach_id()) and logged_by = (select auth.uid()));

insert into public.benchmarks(coach_id, name, kind, workout_type, description) values
  (null,'Fran','girl','for_time','21-15-9: thrusters 95/65 lb, pull-ups.'),
  (null,'Grace','girl','for_time','30 clean and jerks 135/95 lb.'),
  (null,'Helen','girl','for_time','3 rounds: 400 m run, 21 kettlebell swings 1.5/1 pood, 12 pull-ups.'),
  (null,'Diane','girl','for_time','21-15-9: deadlifts 225/155 lb, handstand push-ups.'),
  (null,'Elizabeth','girl','for_time','21-15-9: squat cleans 135/95 lb, ring dips.'),
  (null,'Isabel','girl','for_time','30 snatches 135/95 lb.'),
  (null,'Jackie','girl','for_time','1000 m row, 50 thrusters 45/35 lb, 30 pull-ups.'),
  (null,'Karen','girl','for_time','150 wall-ball shots 20/14 lb to 10/9 ft.'),
  (null,'Annie','girl','for_time','50-40-30-20-10: double-unders, sit-ups.'),
  (null,'Cindy','girl','amrap','20 minutes: 5 pull-ups, 10 push-ups, 15 air squats.'),
  (null,'Mary','girl','amrap','20 minutes: 5 handstand push-ups, 10 alternating pistols, 15 pull-ups.'),
  (null,'Nancy','girl','for_time','5 rounds: 400 m run, 15 overhead squats 95/65 lb.'),
  (null,'Amanda','girl','for_time','9-7-5: ring muscle-ups, squat snatches 135/95 lb.'),
  (null,'Linda','girl','for_time','10-9-8-7-6-5-4-3-2-1: deadlift 1.5x body weight, bench press body weight, squat clean 0.75x body weight.'),
  (null,'Kelly','girl','for_time','5 rounds: 400 m run, 30 box jumps 24/20 in, 30 wall-ball shots 20/14 lb to 10/9 ft.'),
  (null,'Eva','girl','for_time','5 rounds: 800 m run, 30 kettlebell swings 2/1.5 pood, 30 pull-ups.'),
  (null,'Chelsea','girl','emom','Every minute for 30 minutes: 5 pull-ups, 10 push-ups, 15 air squats.'),
  (null,'Murph','hero','for_time','1 mile run, 100 pull-ups, 200 push-ups, 300 air squats, 1 mile run. Partition middle reps as needed; wear 20/14 lb vest.'),
  (null,'DT','hero','for_time','5 rounds: 12 deadlifts, 9 hang power cleans, 6 push jerks, all 155/105 lb.'),
  (null,'JT','hero','for_time','21-15-9: handstand push-ups, ring dips, push-ups.'),
  (null,'Michael','hero','for_time','3 rounds: 800 m run, 50 back extensions, 50 sit-ups.'),
  (null,'Nate','hero','amrap','20 minutes: 2 ring muscle-ups, 4 handstand push-ups, 8 kettlebell swings 2/1.5 pood.'),
  (null,'Randy','hero','for_time','75 power snatches 75/55 lb.'),
  (null,'Badger','hero','for_time','3 rounds: 30 squat cleans 95/65 lb, 30 pull-ups, 800 m run.'),
  (null,'Josh','hero','for_time','21 overhead squats 95/65 lb, 42 pull-ups, 15 overhead squats, 30 pull-ups, 9 overhead squats, 18 pull-ups.')
on conflict do nothing;

insert into public.movements(coach_id, name, category, measure)
select null, seed.name, 'weightlifting', 'load' from unnest(array['Back Squat','Front Squat','Overhead Squat','Deadlift','Squat Clean','Power Clean','Clean and Jerk','Squat Snatch','Power Snatch','Strict Press','Push Press','Push Jerk','Bench Press']) as seed(name)
where not exists (select 1 from public.movements m where m.coach_id is null and lower(m.name) = lower(seed.name))
on conflict do nothing;
insert into public.benchmarks(coach_id, name, kind, workout_type, movement_id, description)
select null, case m.name when 'Squat Clean' then 'Clean' when 'Squat Snatch' then 'Snatch' else m.name end,
  'lift', 'strength', m.id, 'Heaviest set of 1–20 reps: ' || m.name
from public.movements m
where m.coach_id is null and lower(m.name) = any(array['back squat','front squat','overhead squat','deadlift','squat clean','power clean','clean and jerk','squat snatch','power snatch','strict press','push press','push jerk','bench press'])
on conflict do nothing;
