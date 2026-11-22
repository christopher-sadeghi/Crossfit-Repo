-- FIT-34: Athlete food libraries for custom foods, reusable meals and database favorites.
-- Coaches and athletes manage their own library rows through RLS.
-- Food logs retain the serving description used when each entry was logged.

create table public.saved_foods (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches (id) on delete cascade,
  athlete_id uuid not null,
  kind text not null check (kind in ('custom', 'meal', 'food')),
  is_favorite boolean not null default false,
  name text not null check (char_length(name) between 1 and 120),
  brand text check (char_length(brand) <= 120),
  serving_label text not null check (char_length(serving_label) <= 80),
  calories integer not null check (calories between 0 and 10000),
  protein_g numeric(6,1) not null check (protein_g >= 0),
  carbs_g numeric(6,1) not null check (carbs_g >= 0),
  fat_g numeric(6,1) not null check (fat_g >= 0),
  ingredients text check (char_length(ingredients) <= 2000),
  source text not null check (source in ('custom', 'usda', 'off', 'log')),
  source_id text check (char_length(source_id) <= 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'food' or is_favorite),
  foreign key (athlete_id, coach_id) references public.athletes (id, coach_id) on delete cascade
);

create unique index saved_foods_source on public.saved_foods (athlete_id, source, source_id) where source_id is not null;
create index on public.saved_foods (athlete_id);
create index on public.saved_foods (coach_id);
create trigger set_updated_at before update on public.saved_foods
  for each row execute function public.set_updated_at();

alter table public.saved_foods enable row level security;
create policy "Coaches manage their own rows" on public.saved_foods
  for all to authenticated using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()));
create policy "Athletes view own saved foods" on public.saved_foods
  for select to authenticated using (athlete_id = (select public.current_athlete_id()));
create policy "Athletes insert own saved foods" on public.saved_foods
  for insert to authenticated with check (athlete_id = (select public.current_athlete_id()) and coach_id = (select public.current_athlete_coach_id()));
create policy "Athletes update own saved foods" on public.saved_foods
  for update to authenticated using (athlete_id = (select public.current_athlete_id()))
  with check (athlete_id = (select public.current_athlete_id()) and coach_id = (select public.current_athlete_coach_id()));
create policy "Athletes delete own saved foods" on public.saved_foods
  for delete to authenticated using (athlete_id = (select public.current_athlete_id()) and coach_id = (select public.current_athlete_coach_id()));
revoke all on public.saved_foods from anon, authenticated;
grant select, insert, update, delete on public.saved_foods to authenticated, service_role;

alter table public.food_logs add column serving text check (char_length(serving) <= 120);
alter table public.food_logs add column ingredients text check (char_length(ingredients) <= 2000);
