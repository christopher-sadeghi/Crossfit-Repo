create table public.athlete_journal_entries (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  athlete_id uuid not null,
  entry_on date not null default current_date,
  sleep_hours numeric(3, 1) check (sleep_hours >= 0 and sleep_hours <= 24),
  sleep_quality smallint check (sleep_quality between 1 and 5),
  alcohol boolean not null default false,
  late_caffeine boolean not null default false,
  hit_water_goal boolean not null default false,
  late_meal boolean not null default false,
  screens_in_bed boolean not null default false,
  mobility boolean not null default false,
  high_stress boolean not null default false,
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_id, entry_on),
  foreign key (athlete_id, coach_id) references public.athletes (id, coach_id) on delete cascade
);

create index on public.athlete_journal_entries (coach_id);

create trigger set_updated_at before update on public.athlete_journal_entries
  for each row execute function public.set_updated_at();

alter table public.athlete_journal_entries enable row level security;

create policy "Coaches can view their athletes' journals" on public.athlete_journal_entries
  for select to authenticated
  using (coach_id = (select auth.uid()));

create policy "Athletes can view their own journal" on public.athlete_journal_entries
  for select to authenticated
  using (athlete_id = (select public.current_athlete_id()));

create policy "Athletes can add to their own journal" on public.athlete_journal_entries
  for insert to authenticated
  with check (
    athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id())
  );

create policy "Athletes can update their own journal" on public.athlete_journal_entries
  for update to authenticated
  using (
    athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id())
  )
  with check (
    athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id())
  );

create policy "Athletes can delete from their own journal" on public.athlete_journal_entries
  for delete to authenticated
  using (
    athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id())
  );

grant select, insert, update, delete on public.athlete_journal_entries to authenticated;
grant select, insert, update, delete on public.athlete_journal_entries to service_role;
