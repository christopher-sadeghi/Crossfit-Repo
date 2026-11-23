alter table public.athlete_intakes
  drop constraint athlete_intakes_current_step_check;
alter table public.athlete_intakes
  add constraint athlete_intakes_current_step_check check (current_step between 1 and 8);
revoke insert, update on public.athlete_intakes from authenticated;
grant insert (athlete_id, coach_id, status, requested_at, completed_at) on public.athlete_intakes to authenticated;
grant update (status, requested_at, completed_at) on public.athlete_intakes to authenticated;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (
  kind in (
    'result_logged', 'workout_adjusted', 'low_readiness', 'message', 'missed_workouts',
    'coach_message', 'schedule_changed', 'suggestion_approved', 'progress_report',
    'progress_check_in', 'high_training_load', 'form_check', 'assistant_red_flag',
    'form_reviewed', 'check_in_reminder', 'payment_failed', 'health_flag'
  )
);

create or replace function public.save_athlete_intake_step(p_athlete_id uuid, p_step integer, p_data jsonb, p_today date)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.athletes;
  intake public.athlete_intakes;
  item jsonb;
  ids jsonb := '[]';
  record_id uuid;
  extra jsonb := '{}';
  categories jsonb;
  screening jsonb;
  is_health_flag boolean;
begin
  select * into a from public.athletes where id = p_athlete_id and user_id = auth.uid() and status = 'active';
  if not found then raise exception 'Not your athlete' using errcode = '42501'; end if;
  select * into intake from public.athlete_intakes where athlete_id = a.id for update;
  if not found then raise exception 'Questionnaire not requested'; end if;
  if intake.status = 'completed' then return; end if;
  if p_step is null or p_step not between 1 and 8 or p_step > intake.current_step then raise exception 'Invalid step'; end if;
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
    categories := coalesce(intake.answers->'goal_categories','{}');
    if jsonb_array_length(p_data->'goals') not between 1 and 6 then raise exception 'Choose 1–6 goals'; end if;
    for item in select * from jsonb_array_elements(p_data->'goals') loop
      record_id := null;
      if item->>'id' is not null then
        select id into record_id from public.goals where id = (item->>'id')::uuid and athlete_id = a.id and coach_id = a.coach_id
          and id in (select value::uuid from jsonb_array_elements_text(coalesce(intake.answers->'goal_ids','[]'))) for update;
        if record_id is null then raise exception 'Not an intake goal' using errcode = '42501'; end if;
        update public.goals set title = case when item ? 'title' then item->>'title' else title end,
          goal_type = case when item ? 'goal_type' then (item->>'goal_type')::public.goal_type else goal_type end,
          target_value = case when item ? 'target_value' then (item->>'target_value')::numeric else target_value end,
          target_date = case when item ? 'target_date' then (item->>'target_date')::date else target_date end
          where id = record_id and status <> 'achieved' and (
            (item ? 'title' and title is distinct from item->>'title') or
            (item ? 'goal_type' and goal_type is distinct from (item->>'goal_type')::public.goal_type) or
            (item ? 'target_value' and target_value is distinct from (item->>'target_value')::numeric) or
            (item ? 'target_date' and target_date is distinct from (item->>'target_date')::date));
      else
        insert into public.goals(athlete_id, coach_id, title, goal_type, target_value, target_date)
          values (a.id, a.coach_id, item->>'title', (item->>'goal_type')::public.goal_type,
            (item->>'target_value')::numeric, (item->>'target_date')::date) returning id into record_id;
      end if;
      if item ? 'category' then
        if item->>'category' not in ('Strength','Conditioning','Body composition','Specific skill','Competition') or item->>'category' is null then
          raise exception 'Invalid goal category';
        end if;
        categories := jsonb_set(categories, array[record_id::text], item->'category');
      end if;
      ids := ids || to_jsonb(record_id);
    end loop;
    delete from public.goals where athlete_id = a.id and coach_id = a.coach_id and status <> 'achieved'
      and id in (select value::uuid from jsonb_array_elements_text(coalesce(intake.answers->'goal_ids','[]')))
      and id not in (select value::uuid from jsonb_array_elements_text(ids));
    extra := jsonb_build_object('goal_ids', ids, 'goal_categories', coalesce((select jsonb_object_agg(key, value)
      from jsonb_each(categories) where key in (select value from jsonb_array_elements_text(ids))), '{}'::jsonb));
  elsif p_step = 4 then
    extra := jsonb_build_object('injury_list', p_data->'injury_list', 'no_injuries', coalesce(p_data->'no_injuries', 'false'::jsonb));
    if jsonb_array_length(p_data->'injury_list') > 0 then
      update public.athletes set injuries = (select string_agg((v->>'area') || ' (' || (v->>'severity') || '): ' || (v->>'notes'), E'\n')
        from jsonb_array_elements(p_data->'injury_list') v) where id = a.id;
    elsif (p_data->>'no_injuries')::boolean is true then
      update public.athletes set injuries = 'None' where id = a.id;
    end if;
  elsif p_step = 5 then
    extra := jsonb_build_object('days_per_week', p_data->'days_per_week', 'session_minutes', p_data->'session_minutes', 'location', p_data->'location', 'equipment', p_data->'equipment');
  elsif p_step = 6 then
    insert into public.athlete_food_preferences(athlete_id, coach_id, diet_type, allergies, dislikes, cooking_minutes)
      values (a.id, a.coach_id, p_data->>'diet_type', array(select jsonb_array_elements_text(p_data->'allergies')),
        array(select jsonb_array_elements_text(p_data->'dislikes')), (p_data->>'cooking_minutes')::integer)
      on conflict (athlete_id) do update set diet_type = excluded.diet_type, allergies = excluded.allergies, dislikes = excluded.dislikes, cooking_minutes = excluded.cooking_minutes;
    extra := jsonb_build_object('eating_habits', p_data->'eating_habits');
  elsif p_step = 7 then
    extra := jsonb_build_object('sleep_hours', p_data->'sleep_hours', 'stress_level', p_data->'stress_level', 'job_activity', p_data->'job_activity');
  else
    screening := p_data->'health_screening';
    if jsonb_typeof(screening) is distinct from 'object' then raise exception 'Invalid health screening'; end if;
    if jsonb_typeof(screening->'heart_condition') is distinct from 'boolean'
      or jsonb_typeof(screening->'chest_pain_activity') is distinct from 'boolean'
      or jsonb_typeof(screening->'chest_pain_rest') is distinct from 'boolean'
      or jsonb_typeof(screening->'dizziness_or_fainting') is distinct from 'boolean'
      or jsonb_typeof(screening->'bone_joint_problem') is distinct from 'boolean'
      or jsonb_typeof(screening->'blood_pressure_or_heart_meds') is distinct from 'boolean'
      or jsonb_typeof(screening->'doctor_advised_no_exercise') is distinct from 'boolean'
      or jsonb_typeof(screening->'recent_surgery') is distinct from 'boolean'
      or screening->>'pregnant' is null
      or screening->>'pregnant' not in ('no', 'yes', 'prefer_not')
      or jsonb_typeof(screening->'surgery_details') is distinct from 'string'
      or char_length(screening->>'surgery_details') > 500
      or (screening->>'recent_surgery' = 'true' and char_length(btrim(screening->>'surgery_details')) = 0)
      or (screening ? 'medications' and jsonb_typeof(screening->'medications') is distinct from 'string')
      or char_length(coalesce(screening->>'medications', '')) > 1000
      or (screening ? 'conditions' and jsonb_typeof(screening->'conditions') is distinct from 'string')
      or char_length(coalesce(screening->>'conditions', '')) > 1000
      or jsonb_typeof(screening->'emergency_contact') is distinct from 'object'
      or jsonb_typeof(screening->'emergency_contact'->'name') is distinct from 'string'
      or char_length(btrim(screening->'emergency_contact'->>'name')) not between 2 and 100
      or jsonb_typeof(screening->'emergency_contact'->'phone') is distinct from 'string'
      or screening->'emergency_contact'->>'phone' !~ '^[0-9+() -]{7,30}$'
      or jsonb_typeof(screening->'emergency_contact'->'relationship') is distinct from 'string'
      or char_length(btrim(screening->'emergency_contact'->>'relationship')) not between 1 and 50 then
      raise exception 'Invalid health screening';
    end if;

    is_health_flag :=
      (screening->>'heart_condition')::boolean
      or (screening->>'chest_pain_activity')::boolean
      or (screening->>'chest_pain_rest')::boolean
      or (screening->>'dizziness_or_fainting')::boolean
      or (screening->>'bone_joint_problem')::boolean
      or (screening->>'blood_pressure_or_heart_meds')::boolean
      or (screening->>'doctor_advised_no_exercise')::boolean
      or screening->>'pregnant' = 'yes'
      or (screening->>'recent_surgery')::boolean;
    extra := jsonb_build_object('health_screening', screening, 'health_flag', is_health_flag);

    if is_health_flag and intake.answers->'health_flag' is distinct from 'true'::jsonb then
      insert into public.notifications(recipient_id, athlete_id, kind, title, body, link)
        values (
          coalesce(a.assigned_coach_id, a.coach_id),
          a.id,
          'health_flag',
          'Health screening response',
          a.first_name || ' ' || a.last_name || ' answered yes to a health screening question',
          '/athletes/' || a.id::text || '?tab=intake'
        );
    end if;
  end if;

  update public.athlete_intakes set answers = answers || extra,
    current_step = greatest(current_step, least(8, p_step + 1)),
    status = case when p_step = 8 then 'completed' else 'in_progress' end,
    completed_at = case when p_step = 8 then now() else null end where id = intake.id;
end $$;
revoke all on function public.save_athlete_intake_step(uuid, integer, jsonb, date) from public, anon, authenticated;
grant execute on function public.save_athlete_intake_step(uuid, integer, jsonb, date) to authenticated;

alter table public.athletes add column waiver_requested_at timestamptz;

create function public.set_athlete_waiver_requested_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.user_id is null and new.user_id is not null then
    new.waiver_requested_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.set_athlete_waiver_requested_at() from public, anon, authenticated;
create trigger set_waiver_requested_at_before_link
  before update of user_id on public.athletes
  for each row execute function public.set_athlete_waiver_requested_at();

create function public.protect_athlete_waiver_requested_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and new.waiver_requested_at is not null then
      raise exception 'Waiver request timestamps are server-controlled' using errcode = '42501';
    elsif tg_op = 'UPDATE' and new.waiver_requested_at is distinct from old.waiver_requested_at then
      raise exception 'Waiver request timestamps are server-controlled' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.protect_athlete_waiver_requested_at() from public, anon, authenticated;
create trigger protect_waiver_requested_at_insert
  before insert on public.athletes
  for each row execute function public.protect_athlete_waiver_requested_at();
create trigger protect_waiver_requested_at_update
  before update of waiver_requested_at on public.athletes
  for each row execute function public.protect_athlete_waiver_requested_at();

create table public.coach_waivers (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete cascade,
  version integer not null,
  body text not null check (char_length(body) between 50 and 20000),
  requires_resign boolean not null default false,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (coach_id, version)
);
alter table public.coach_waivers enable row level security;
revoke all on public.coach_waivers from public, anon, authenticated;
grant select on public.coach_waivers to authenticated;
grant all on public.coach_waivers to service_role;
create policy "Coaches and athletes can read waivers" on public.coach_waivers
  for select to authenticated using (
    coach_id = (select public.current_gym_id())
    or coach_id = (select public.current_athlete_coach_id())
  );

create table public.athlete_waiver_signatures (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null,
  coach_id uuid not null,
  waiver_id uuid not null references public.coach_waivers(id) on delete cascade,
  signed_name text not null check (char_length(btrim(signed_name)) between 2 and 200),
  signed_at timestamptz not null default now(),
  user_id uuid not null default auth.uid(),
  user_agent text check (user_agent is null or char_length(user_agent) <= 500),
  foreign key (athlete_id, coach_id) references public.athletes(id, coach_id) on delete cascade
);
create index athlete_waiver_signatures_athlete_signed_idx
  on public.athlete_waiver_signatures (athlete_id, signed_at desc);
alter table public.athlete_waiver_signatures enable row level security;
revoke all on public.athlete_waiver_signatures from public, anon, authenticated;
grant select on public.athlete_waiver_signatures to authenticated;
grant all on public.athlete_waiver_signatures to service_role;
create policy "Coaches and athletes can read waiver signatures" on public.athlete_waiver_signatures
  for select to authenticated using (
    coach_id = (select public.current_gym_id())
    or (athlete_id = (select public.current_athlete_id()) and user_id = (select auth.uid()))
  );

create function public.publish_coach_waiver(p_body text, p_require_resign boolean)
returns public.coach_waivers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid;
  v_previous_version integer;
  v_waiver public.coach_waivers;
begin
  if not public.is_gym_owner() then
    raise exception 'Only the owner can publish a waiver' using errcode = '42501';
  end if;
  v_coach_id := public.current_gym_id();
  perform 1 from public.coaches where id = v_coach_id for update;
  select max(version) into v_previous_version from public.coach_waivers where coach_id = v_coach_id;

  insert into public.coach_waivers(coach_id, version, body, requires_resign)
    values (v_coach_id, coalesce(v_previous_version, 0) + 1, p_body, coalesce(p_require_resign, false))
    returning * into v_waiver;

  if coalesce(p_require_resign, false) and v_previous_version is not null then
    update public.athletes set waiver_requested_at = clock_timestamp()
      where coach_id = v_coach_id and status = 'active' and user_id is not null;
  end if;
  return v_waiver;
end;
$$;
revoke all on function public.publish_coach_waiver(text, boolean) from public, anon, authenticated;
grant execute on function public.publish_coach_waiver(text, boolean) to authenticated;

create function public.sign_coach_waiver(p_waiver_id uuid, p_signed_name text, p_user_agent text)
returns public.athlete_waiver_signatures
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_athlete_id uuid;
  v_athlete public.athletes;
  v_latest_waiver public.coach_waivers;
  v_signature public.athlete_waiver_signatures;
  v_name text := btrim(p_signed_name);
begin
  v_athlete_id := public.current_athlete_id();
  if v_athlete_id is null then
    raise exception 'An active athlete account is required' using errcode = '42501';
  end if;
  select * into v_athlete from public.athletes
    where id = v_athlete_id and user_id = auth.uid() and status = 'active';
  if not found then
    raise exception 'An active athlete account is required' using errcode = '42501';
  end if;

  perform 1 from public.coaches where id = v_athlete.coach_id for share;
  select * into v_latest_waiver from public.coach_waivers
    where coach_id = v_athlete.coach_id order by version desc limit 1;
  if not found or v_latest_waiver.id <> p_waiver_id then
    raise exception 'Only the latest waiver can be signed' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) not between 2 and 200 then
    raise exception 'Enter your full name' using errcode = '22023';
  end if;
  if p_user_agent is not null and char_length(p_user_agent) > 500 then
    raise exception 'Invalid user agent' using errcode = '22023';
  end if;

  insert into public.athlete_waiver_signatures(athlete_id, coach_id, waiver_id, signed_name, signed_at, user_agent)
    values (v_athlete.id, v_athlete.coach_id, v_latest_waiver.id, v_name, clock_timestamp(), p_user_agent)
    returning * into v_signature;
  return v_signature;
end;
$$;
revoke all on function public.sign_coach_waiver(uuid, text, text) from public, anon, authenticated;
grant execute on function public.sign_coach_waiver(uuid, text, text) to authenticated;
