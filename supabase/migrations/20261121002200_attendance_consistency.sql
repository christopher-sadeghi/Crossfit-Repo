create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches(id) on delete cascade,
  athlete_id uuid not null,
  attended_on date not null,
  kind text not null check (kind in ('class', 'open_gym')),
  note text check (char_length(note) <= 500),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (athlete_id, coach_id) references public.athletes(id, coach_id) on delete cascade,
  unique (athlete_id, attended_on, kind)
);
create index if not exists attendance_coach_date on public.attendance(coach_id, attended_on);
create index if not exists attendance_athlete_date on public.attendance(athlete_id, attended_on);

alter table public.attendance enable row level security;
drop policy if exists "Coaches manage own attendance" on public.attendance;
create policy "Coaches manage own attendance" on public.attendance for all to authenticated
  using (coach_id = (select auth.uid()))
  with check (coach_id = (select auth.uid()));
drop policy if exists "Athletes read own attendance" on public.attendance;
create policy "Athletes read own attendance" on public.attendance for select to authenticated
  using (athlete_id = (select public.current_athlete_id()));

revoke all on public.attendance from anon, authenticated;
grant select, insert, update, delete on public.attendance to authenticated;
grant all on public.attendance to service_role;

alter table public.coaches add column if not exists drift_days integer not null default 5 check (drift_days between 1 and 60);
