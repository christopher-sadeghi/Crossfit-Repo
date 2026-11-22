-- FIT-24: AI food ideas from remaining macros, goals and food preferences.
-- Food ideas are informational: they save with status 'idea' and change nothing on their own.
-- New enum values can't be used in the same transaction, so policies compare them as text.

alter type public.suggestion_type add value if not exists 'suggest_food';
alter type public.suggestion_status add value if not exists 'idea';

-- Who asked for a suggestion (the coach or one of their athletes).
alter table public.ai_suggestions
  add column requested_by uuid default auth.uid() references auth.users (id) on delete set null;

-- Food preferences ------------------------------------------------------------

create table public.athlete_food_preferences (
  athlete_id uuid primary key,
  coach_id uuid not null references public.coaches (id) on delete cascade,
  diet_type text not null default 'none'
    check (diet_type in ('none', 'vegetarian', 'vegan', 'pescatarian', 'gluten_free', 'dairy_free', 'low_carb', 'paleo', 'halal', 'kosher')),
  allergies text[] not null default '{}' check (cardinality(allergies) <= 20),
  dislikes text[] not null default '{}' check (cardinality(dislikes) <= 30),
  cooking_minutes smallint check (cooking_minutes in (0, 15, 30, 60)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (athlete_id, coach_id) references public.athletes (id, coach_id) on delete cascade
);

create index on public.athlete_food_preferences (coach_id);

create trigger set_updated_at before update on public.athlete_food_preferences
  for each row execute function public.set_updated_at();

alter table public.athlete_food_preferences enable row level security;

create policy "Coaches manage their own rows" on public.athlete_food_preferences
  for all to authenticated
  using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()));

create policy "Athletes can view their own food preferences" on public.athlete_food_preferences
  for select to authenticated
  using (athlete_id = (select public.current_athlete_id()));

create policy "Athletes can add their own food preferences" on public.athlete_food_preferences
  for insert to authenticated
  with check (
    athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id())
  );

create policy "Athletes can update their own food preferences" on public.athlete_food_preferences
  for update to authenticated
  using (athlete_id = (select public.current_athlete_id()))
  with check (
    athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id())
  );

revoke all on public.athlete_food_preferences from anon, authenticated;
grant select, insert, update, delete on public.athlete_food_preferences to authenticated;
grant select, insert, update, delete on public.athlete_food_preferences to service_role;

-- AI food ideas: athletes can ask for and see their own --------------------------

create policy "Athletes can view their own food ideas" on public.ai_suggestions
  for select to authenticated
  using (
    athlete_id = (select public.current_athlete_id())
    and suggestion_type::text = 'suggest_food'
  );

create policy "Athletes can ask for food ideas" on public.ai_suggestions
  for insert to authenticated
  with check (
    athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id())
    and requested_by = (select auth.uid())
    and suggestion_type::text = 'suggest_food'
    and status::text in ('failed', 'idea')
  );

create policy "Athletes can finish their own food ideas" on public.ai_suggestions
  for update to authenticated
  using (
    athlete_id = (select public.current_athlete_id())
    and requested_by = (select auth.uid())
    and suggestion_type::text = 'suggest_food'
  )
  with check (
    athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id())
    and requested_by = (select auth.uid())
    and suggestion_type::text = 'suggest_food'
    and status::text in ('failed', 'idea')
  );

-- The daily AI limit counts rows by created_at, so signed-in users can't backdate or move it.
create function public.lock_ai_suggestion_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    new.created_at = case when tg_op = 'INSERT' then now() else old.created_at end;
  end if;
  return new;
end;
$$;

create trigger lock_created_at before insert or update on public.ai_suggestions
  for each row execute function public.lock_ai_suggestion_created_at();

-- Food log: athletes see their own day and add AI ideas to it ------------------

alter table public.food_logs
  add column ai_suggestion_id uuid references public.ai_suggestions (id) on delete set null;

create index on public.food_logs (ai_suggestion_id);

-- Foreign keys bypass RLS, so a food log may only point at a suggestion for the same athlete.
create policy "Only the athlete's own AI suggestions (insert)" on public.food_logs as restrictive
  for insert to authenticated
  with check (
    ai_suggestion_id is null or exists (
      select 1 from public.ai_suggestions s
      where s.id = ai_suggestion_id and s.athlete_id = food_logs.athlete_id
    )
  );

create policy "Only the athlete's own AI suggestions (update)" on public.food_logs as restrictive
  for update to authenticated
  using (true)
  with check (
    ai_suggestion_id is null or exists (
      select 1 from public.ai_suggestions s
      where s.id = ai_suggestion_id and s.athlete_id = food_logs.athlete_id
    )
  );

create policy "Athletes can view their own food log" on public.food_logs
  for select to authenticated
  using (athlete_id = (select public.current_athlete_id()));

create policy "Athletes can add to their own food log" on public.food_logs
  for insert to authenticated
  with check (
    athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id())
  );

create policy "Athletes can delete from their own food log" on public.food_logs
  for delete to authenticated
  using (athlete_id = (select public.current_athlete_id()));

-- Targets and goals feed the athlete's food ideas (read-only).
create policy "Athletes can view their own nutrition targets" on public.nutrition_targets
  for select to authenticated
  using (athlete_id = (select public.current_athlete_id()));

create policy "Athletes can view their own goals" on public.goals
  for select to authenticated
  using (athlete_id = (select public.current_athlete_id()));
