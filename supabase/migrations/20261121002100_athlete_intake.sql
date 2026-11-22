alter type public.suggestion_type add value if not exists 'draft_program';

create table public.athlete_intakes (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null unique,
  coach_id uuid not null references public.coaches(id) on delete cascade,
  status text not null default 'requested' check (status in ('requested','in_progress','completed')),
  current_step smallint not null default 1 check (current_step between 1 and 7),
  answers jsonb not null default '{}' check (jsonb_typeof(answers) = 'object'),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (athlete_id, coach_id) references public.athletes(id, coach_id) on delete cascade
);
create index on public.athlete_intakes(coach_id);
create trigger set_updated_at before update on public.athlete_intakes
  for each row execute function public.set_updated_at();
alter table public.athlete_intakes enable row level security;
revoke all on table public.athlete_intakes from anon, authenticated;
grant select, insert, update on table public.athlete_intakes to authenticated;
grant all on table public.athlete_intakes to service_role;
create policy "Coaches read intake" on public.athlete_intakes for select to authenticated
  using (coach_id = (select auth.uid()));
create policy "Coaches request intake" on public.athlete_intakes for insert to authenticated
  with check (coach_id = (select auth.uid()));
create policy "Coaches resend intake" on public.athlete_intakes for update to authenticated
  using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()));
create policy "Athletes read intake" on public.athlete_intakes for select to authenticated
  using (athlete_id = (select public.current_athlete_id()));
create policy "Athletes update intake" on public.athlete_intakes for update to authenticated
  using (athlete_id = (select public.current_athlete_id()))
  with check (athlete_id = (select public.current_athlete_id()) and coach_id = (select public.current_athlete_coach_id()));
create policy "Athletes read own intake metrics" on public.body_metrics for select to authenticated
  using (athlete_id = (select public.current_athlete_id()));

create function public.request_linked_athlete_intake() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.user_id is null and new.user_id is not null then
    insert into public.athlete_intakes(athlete_id, coach_id) values (new.id, new.coach_id)
      on conflict (athlete_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.request_linked_athlete_intake() from public, anon, authenticated;
create trigger request_intake_after_link after update of user_id on public.athletes
  for each row execute function public.request_linked_athlete_intake();

-- A single transaction keeps each step and its canonical records together.
create function public.save_athlete_intake_step(p_athlete_id uuid, p_step integer, p_data jsonb, p_today date)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.athletes;
  intake public.athlete_intakes;
  item jsonb;
  ids jsonb := '[]';
  record_id uuid;
  extra jsonb := '{}';
begin
  select * into a from public.athletes where id = p_athlete_id and user_id = auth.uid();
  if not found then raise exception 'Not your athlete' using errcode = '42501'; end if;
  select * into intake from public.athlete_intakes where athlete_id = a.id for update;
  if not found then raise exception 'Questionnaire not requested'; end if;
  if p_step not between 1 and 7 or p_step > intake.current_step then raise exception 'Invalid step'; end if;
  if p_today is null or p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Invalid data'; end if;
  if p_step = 1 then
    update public.athletes set birth_date = (p_data->>'birth_date')::date,
      height_cm = (p_data->>'height_cm')::numeric, sex = nullif(p_data->>'sex','') where id = a.id;
    if (p_data->>'weight_kg')::numeric <= 0 then raise exception 'Invalid weight'; end if;
    select id into record_id from public.body_metrics where athlete_id = a.id and measured_on = p_today order by created_at desc limit 1;
    if record_id is null then
      insert into public.body_metrics(athlete_id, coach_id, measured_on, weight_kg)
        values (a.id, a.coach_id, p_today, (p_data->>'weight_kg')::numeric);
    else update public.body_metrics set weight_kg = (p_data->>'weight_kg')::numeric where id = record_id;
    end if;
  elsif p_step = 2 then
    update public.athletes set experience_level = (p_data->>'experience_level')::public.experience_level where id = a.id;
    extra := jsonb_build_object('crossfit_detail', p_data->'crossfit_detail', 'years_training', p_data->'years_training', 'sports_background', p_data->'sports_background');
    delete from public.benchmark_results where athlete_id = a.id and logged_by = auth.uid()
      and id in (select value::text::uuid from jsonb_array_elements_text(coalesce(intake.answers->'benchmark_result_ids','[]')));
    for item in select * from jsonb_array_elements(coalesce(p_data->'benchmarks','[]')) loop
      insert into public.benchmark_results(athlete_id, coach_id, benchmark_id, performed_on, load_kg, rep_max, time_seconds, rounds, reps, logged_by)
        values (a.id, a.coach_id, (item->>'benchmark_id')::uuid, p_today, (item->>'load_kg')::numeric,
          (item->>'rep_max')::smallint, (item->>'time_seconds')::integer, (item->>'rounds')::integer, (item->>'reps')::integer, auth.uid()) returning id into record_id;
      ids := ids || to_jsonb(record_id);
    end loop;
    extra := extra || jsonb_build_object('benchmark_result_ids', ids);
  elsif p_step = 3 then
    if jsonb_array_length(p_data->'goals') not between 1 and 3 then raise exception 'Choose 1–3 goals'; end if;
    delete from public.goals where athlete_id = a.id
      and id in (select value::text::uuid from jsonb_array_elements_text(coalesce(intake.answers->'goal_ids','[]')));
    for item in select * from jsonb_array_elements(p_data->'goals') loop
      insert into public.goals(athlete_id, coach_id, title, goal_type, target_value, target_date)
        values (a.id, a.coach_id, item->>'title', (item->>'goal_type')::public.goal_type,
          (item->>'target_value')::numeric, (item->>'target_date')::date) returning id into record_id;
      ids := ids || to_jsonb(record_id);
    end loop;
    extra := jsonb_build_object('goal_ids', ids);
  elsif p_step = 4 then
    extra := jsonb_build_object('injury_list', p_data->'injury_list');
    update public.athletes set injuries = coalesce((select string_agg((v->>'area') || ' (' || (v->>'severity') || '): ' || (v->>'notes'), E'\n')
      from jsonb_array_elements(p_data->'injury_list') v), 'None') where id = a.id;
  elsif p_step = 5 then
    extra := jsonb_build_object('days_per_week', p_data->'days_per_week', 'session_minutes', p_data->'session_minutes', 'location', p_data->'location', 'equipment', p_data->'equipment');
  elsif p_step = 6 then
    insert into public.athlete_food_preferences(athlete_id, coach_id, diet_type, allergies, dislikes, cooking_minutes)
      values (a.id, a.coach_id, p_data->>'diet_type', array(select jsonb_array_elements_text(p_data->'allergies')),
        array(select jsonb_array_elements_text(p_data->'dislikes')), (p_data->>'cooking_minutes')::integer)
      on conflict (athlete_id) do update set diet_type = excluded.diet_type, allergies = excluded.allergies, dislikes = excluded.dislikes, cooking_minutes = excluded.cooking_minutes;
    extra := jsonb_build_object('eating_habits', p_data->'eating_habits');
  else
    extra := jsonb_build_object('sleep_hours', p_data->'sleep_hours', 'stress_level', p_data->'stress_level', 'job_activity', p_data->'job_activity');
  end if;
  update public.athlete_intakes set answers = answers || extra,
    current_step = greatest(current_step, least(7, p_step + 1)),
    status = case when p_step = 7 then 'completed' else 'in_progress' end,
    completed_at = case when p_step = 7 then now() else null end where id = intake.id;
end $$;
revoke all on function public.save_athlete_intake_step(uuid, integer, jsonb, date) from public, anon, authenticated;
grant execute on function public.save_athlete_intake_step(uuid, integer, jsonb, date) to authenticated;
