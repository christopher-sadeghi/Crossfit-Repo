alter table public.workouts
  add column sections jsonb not null default '[]'::jsonb
  check (jsonb_typeof(sections) = 'array' and jsonb_array_length(sections) <= 10);

alter table public.workout_movements
  add column section smallint check (section between 0 and 9);

alter table public.workout_results
  add column section_scores jsonb not null default '[]'::jsonb
  check (jsonb_typeof(section_scores) = 'array' and jsonb_array_length(section_scores) <= 10);

create or replace function public.save_ai_workout(
  p_workout_id uuid,
  p_workout jsonb,
  p_movements jsonb,
  p_expected_updated_at timestamptz default null,
  p_athlete_id uuid default null,
  p_scheduled_on date default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workout_id uuid;
  v_movement jsonb;
  v_position integer := 0;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;

  if p_workout_id is null then
    insert into public.workouts (
      coach_id,
      program_id,
      title,
      workout_type,
      time_cap_seconds,
      rounds,
      description,
      notes,
      athlete_id,
      scheduled_on,
      sections
    )
    values (
      public.current_gym_id(),
      null,
      p_workout->>'title',
      (p_workout->>'workout_type')::public.workout_type,
      nullif(p_workout->>'time_cap_seconds', '')::integer,
      nullif(p_workout->>'rounds', '')::integer,
      p_workout->>'description',
      p_workout->>'notes',
      p_athlete_id,
      case when p_athlete_id is null then null else p_scheduled_on end,
      coalesce(p_workout->'sections', '[]'::jsonb)
    )
    returning id into v_workout_id;
  else
    update public.workouts
    set
      title = p_workout->>'title',
      workout_type = (p_workout->>'workout_type')::public.workout_type,
      time_cap_seconds = nullif(p_workout->>'time_cap_seconds', '')::integer,
      rounds = nullif(p_workout->>'rounds', '')::integer,
      description = p_workout->>'description',
      notes = p_workout->>'notes',
      sections = coalesce(p_workout->'sections', '[]'::jsonb),
      updated_at = now()
    where id = p_workout_id
      and (p_expected_updated_at is null or updated_at <= p_expected_updated_at)
    returning id into v_workout_id;

    if v_workout_id is null then
      if exists (select 1 from public.workouts where id = p_workout_id) then
        raise exception using errcode = 'P0001', message = 'workout_changed';
      else
        raise exception using errcode = 'P0001', message = 'workout_not_found';
      end if;
    end if;

    delete from public.workout_movements
    where workout_id = v_workout_id;
  end if;

  for v_movement in
    select value from jsonb_array_elements(p_movements)
  loop
    v_position := v_position + 1;
    insert into public.workout_movements (
      workout_id,
      coach_id,
      movement_id,
      position,
      sets,
      reps,
      load_kg,
      distance_m,
      calories,
      duration_seconds,
      notes,
      section
    )
    values (
      v_workout_id,
      public.current_gym_id(),
      (v_movement->>'movement_id')::uuid,
      v_position,
      nullif(v_movement->>'sets', '')::integer,
      nullif(v_movement->>'reps', '')::integer,
      nullif(v_movement->>'load_kg', '')::numeric,
      nullif(v_movement->>'distance_m', '')::numeric,
      nullif(v_movement->>'calories', '')::integer,
      nullif(v_movement->>'duration_seconds', '')::integer,
      v_movement->>'notes',
      nullif(v_movement->>'section', '')::smallint
    );
  end loop;

  return v_workout_id;
end;
$$;

revoke all on function public.save_ai_workout(uuid, jsonb, jsonb, timestamptz, uuid, date) from public, anon;
grant execute on function public.save_ai_workout(uuid, jsonb, jsonb, timestamptz, uuid, date) to authenticated;

create or replace function public.copy_workout_for_athlete(p_workout_id uuid, p_athlete_id uuid, p_scheduled_on date)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_source public.workouts;
  v_id uuid;
begin
  select * into v_source from public.workouts where id = p_workout_id and coach_id = public.current_gym_id();
  if not found or not exists (select 1 from public.athletes where id = p_athlete_id and coach_id = public.current_gym_id()) then
    raise exception 'Choose a workout and athlete owned by your account.';
  end if;
  if p_scheduled_on is null then raise exception 'Choose a date.'; end if;
  insert into public.workouts (coach_id, athlete_id, scheduled_on, title, workout_type, time_cap_seconds, rounds, description, notes, source_workout_id, sections)
  values (public.current_gym_id(), p_athlete_id, p_scheduled_on, v_source.title, v_source.workout_type, v_source.time_cap_seconds, v_source.rounds, v_source.description, v_source.notes, coalesce(v_source.source_workout_id, v_source.id), v_source.sections)
  returning id into v_id;
  insert into public.workout_movements (coach_id, workout_id, movement_id, position, sets, reps, load_kg, distance_m, calories, duration_seconds, notes, section)
  select coach_id, v_id, movement_id, position, sets, reps, load_kg, distance_m, calories, duration_seconds, notes, section
  from public.workout_movements where workout_id = p_workout_id;
  return v_id;
end;
$$;

create or replace function public.override_workout_for_athlete(p_workout_id uuid, p_athlete_id uuid, p_mode text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_date date;
  v_old uuid;
  v_id uuid;
begin
  if p_mode is null or p_mode not in ('edit', 'remove') then raise exception 'Choose edit or remove.'; end if;
  perform 1 from public.athletes where id = p_athlete_id and coach_id = public.current_gym_id() for update;
  if not found then raise exception 'Choose an athlete from your roster.'; end if;
  select pa.start_date + (w.week_number - 1) * 7 + (w.day_number - 1) into v_date
  from public.workouts w join public.program_assignments pa on pa.program_id = w.program_id
  where w.id = p_workout_id and pa.athlete_id = p_athlete_id and w.coach_id = public.current_gym_id();
  if v_date is null then raise exception 'This workout is not in an assigned program.'; end if;
  select replacement_workout_id into v_old from public.athlete_workout_overrides
  where athlete_id = p_athlete_id and workout_id = p_workout_id;
  if p_mode = 'edit' then
    if v_old is not null then return v_old; end if;
    v_id := public.copy_workout_for_athlete(p_workout_id, p_athlete_id, v_date);
    update public.athlete_workout_scalings set workout_id = v_id
    where workout_id = p_workout_id and athlete_id = p_athlete_id;
  end if;
  insert into public.athlete_workout_overrides (athlete_id, workout_id, replacement_workout_id)
  values (p_athlete_id, p_workout_id, v_id)
  on conflict (athlete_id, workout_id) do update set replacement_workout_id = excluded.replacement_workout_id, updated_at = now();
  if v_old is not null then
    perform 1 from public.workouts where id = v_old and coach_id = public.current_gym_id() for update;
    if not exists (select 1 from public.workout_results where workout_id = v_old) then
      delete from public.workouts where id = v_old;
    end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.copy_workout_for_athlete(uuid, uuid, date) from public, anon;
revoke all on function public.override_workout_for_athlete(uuid, uuid, text) from public, anon;
grant execute on function public.copy_workout_for_athlete(uuid, uuid, date) to authenticated;
grant execute on function public.override_workout_for_athlete(uuid, uuid, text) to authenticated;

create or replace function public.copy_program_for_athlete(
  p_program_id uuid,
  p_athlete_id uuid,
  p_start_date date default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_coach_id uuid := public.current_gym_id();
  v_source public.programs%rowtype;
  v_athlete public.athletes%rowtype;
  v_start_date date;
  v_suffix text;
  v_program_name text;
  v_new_program_id uuid;
  v_source_workout record;
  v_new_workout_id uuid;
begin
  if v_coach_id is null then
    raise exception 'You must be signed in.';
  end if;

  select *
  into v_source
  from public.programs p
  where p.id = p_program_id
    and p.coach_id = v_coach_id
    and p.athlete_id is null;

  if not found then
    raise exception 'Choose a group program owned by your account.';
  end if;

  select *
  into v_athlete
  from public.athletes a
  where a.id = p_athlete_id
    and a.coach_id = v_coach_id
  for update;

  if not found then
    raise exception 'Choose an athlete from your roster.';
  end if;

  select pa.start_date
  into v_start_date
  from public.program_assignments pa
  where pa.program_id = p_program_id
    and pa.athlete_id = p_athlete_id
    and pa.coach_id = v_coach_id;

  if not found then
    v_start_date := p_start_date;
  end if;

  if v_start_date is null then
    raise exception 'Choose a start date for this personal program.';
  end if;

  v_suffix := ' — ' || v_athlete.first_name;
  v_program_name := left(v_source.name, greatest(1, 80 - char_length(v_suffix))) || v_suffix;

  insert into public.programs (coach_id, name, description, weeks, athlete_id, source_program_id)
  values (
    v_coach_id,
    left(v_program_name, 80),
    v_source.description,
    v_source.weeks,
    p_athlete_id,
    p_program_id
  )
  returning id into v_new_program_id;

  for v_source_workout in
    select
      w.id,
      w.coach_id,
      w.title,
      w.workout_type,
      w.time_cap_seconds,
      w.rounds,
      w.description,
      w.notes,
      w.sections,
      w.week_number,
      w.day_number,
      w.scheduled_on,
      w.athlete_id
    from public.workouts w
    where w.program_id = p_program_id
      and w.coach_id = v_coach_id
    order by w.week_number, w.day_number, w.title
  loop
    v_new_workout_id := gen_random_uuid();

    insert into public.workouts (
      id,
      coach_id,
      program_id,
      title,
      workout_type,
      time_cap_seconds,
      rounds,
      description,
      notes,
      sections,
      week_number,
      day_number,
      scheduled_on,
      athlete_id,
      source_workout_id
    )
    values (
      v_new_workout_id,
      v_source_workout.coach_id,
      v_new_program_id,
      v_source_workout.title,
      v_source_workout.workout_type,
      v_source_workout.time_cap_seconds,
      v_source_workout.rounds,
      v_source_workout.description,
      v_source_workout.notes,
      v_source_workout.sections,
      v_source_workout.week_number,
      v_source_workout.day_number,
      v_source_workout.scheduled_on,
      v_source_workout.athlete_id,
      v_source_workout.id
    );

    insert into public.workout_movements (
      coach_id,
      workout_id,
      movement_id,
      position,
      sets,
      reps,
      load_kg,
      distance_m,
      calories,
      duration_seconds,
      notes,
      section
    )
    select
      wm.coach_id,
      v_new_workout_id,
      wm.movement_id,
      wm.position,
      wm.sets,
      wm.reps,
      wm.load_kg,
      wm.distance_m,
      wm.calories,
      wm.duration_seconds,
      wm.notes,
      wm.section
    from public.workout_movements wm
    where wm.workout_id = v_source_workout.id
      and wm.coach_id = v_coach_id;

    update public.athlete_workout_overrides
    set workout_id = v_new_workout_id
    where workout_id = v_source_workout.id
      and athlete_id = p_athlete_id
      and coach_id = v_coach_id;

    insert into public.athlete_workout_scalings (
      coach_id,
      workout_id,
      athlete_id,
      modifications,
      details,
      athlete_suggestion_id,
      athlete_adjusted_at,
      coach_modifications,
      coach_details
    )
    select
      aws.coach_id,
      v_new_workout_id,
      aws.athlete_id,
      aws.modifications,
      aws.details,
      aws.athlete_suggestion_id,
      aws.athlete_adjusted_at,
      aws.coach_modifications,
      aws.coach_details
    from public.athlete_workout_scalings aws
    where aws.workout_id = v_source_workout.id
      and aws.coach_id = v_coach_id
      and aws.athlete_id = p_athlete_id;
  end loop;

  delete from public.program_assignments
  where program_id = p_program_id
    and athlete_id = p_athlete_id
    and coach_id = v_coach_id;

  insert into public.program_assignments (coach_id, program_id, athlete_id, start_date)
  values (v_coach_id, v_new_program_id, p_athlete_id, v_start_date);

  return v_new_program_id;
end;
$$;

revoke all on function public.copy_program_for_athlete(uuid, uuid, date) from public, anon;
grant execute on function public.copy_program_for_athlete(uuid, uuid, date) to authenticated;

create or replace function public.apply_draft_program(p_athlete_id uuid, p_program jsonb, p_today date)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_coach uuid := public.current_gym_id();
  v_days integer;
  v_program uuid;
  v_workout uuid;
  v_week jsonb;
  v_day jsonb;
  v_movement jsonb;
  v_position integer;
  v_start date := (p_program->>'start_date')::date;
begin
  if v_coach is null or not exists (select 1 from public.athletes where id = p_athlete_id and coach_id = v_coach and status = 'active') then
    raise exception 'athlete_unavailable' using errcode = '42501';
  end if;
  select (answers->>'days_per_week')::integer into v_days from public.athlete_intakes
    where athlete_id = p_athlete_id and coach_id = v_coach and status = 'completed' for share;
  if v_days is null or v_days not between 1 and 7 then raise exception 'intake_changed'; end if;
  if p_today is null or v_start is null or v_start < p_today then raise exception 'invalid_start_date'; end if;
  if jsonb_typeof(p_program->'weeks') is distinct from 'array' or jsonb_array_length(p_program->'weeks') <> 4 then raise exception 'invalid_schedule'; end if;
  if (select count(distinct (w->>'week_number')::integer) from jsonb_array_elements(p_program->'weeks') w) <> 4 then raise exception 'invalid_schedule'; end if;
  insert into public.programs(coach_id, athlete_id, source_program_id, name, description, weeks)
    values (v_coach, p_athlete_id, null, p_program->>'name', p_program->>'rationale', 4) returning id into v_program;
  for v_week in select * from jsonb_array_elements(p_program->'weeks') loop
    if (v_week->>'week_number')::integer not between 1 and 4
      or jsonb_array_length(v_week->'workouts') <> v_days
      or (select count(distinct (d->>'day_number')::integer) from jsonb_array_elements(v_week->'workouts') d) <> v_days then
      raise exception 'invalid_schedule';
    end if;
    for v_day in select * from jsonb_array_elements(v_week->'workouts') loop
      if (v_day->>'day_number')::integer not between 1 and 7 then raise exception 'invalid_schedule'; end if;
      insert into public.workouts(coach_id, program_id, title, workout_type, week_number, day_number, time_cap_seconds, rounds, description, notes, sections)
        values (v_coach, v_program, v_day->>'title', (v_day->>'workout_type')::public.workout_type,
          (v_week->>'week_number')::integer, (v_day->>'day_number')::integer,
          (v_day->>'time_cap_minutes')::integer * 60, (v_day->>'rounds')::integer, v_day->>'description', v_day->>'notes',
          coalesce(v_day->'sections', '[]'::jsonb)) returning id into v_workout;
      if jsonb_typeof(v_day->'movements') is distinct from 'array' or jsonb_array_length(v_day->'movements') not between 1 and 15 then raise exception 'invalid_movements'; end if;
      v_position := 0;
      for v_movement in select * from jsonb_array_elements(v_day->'movements') loop
        if not exists (select 1 from public.movements where id = (v_movement->>'movement_id')::uuid and (coach_id is null or coach_id = v_coach)) then raise exception 'unknown_movement'; end if;
        v_position := v_position + 1;
        insert into public.workout_movements(coach_id, workout_id, movement_id, position, sets, reps, load_kg, distance_m, calories, duration_seconds, notes, section)
          values (v_coach, v_workout, (v_movement->>'movement_id')::uuid, v_position,
            (v_movement->>'sets')::integer, (v_movement->>'reps')::integer, (v_movement->>'load_kg')::numeric,
            (v_movement->>'distance_m')::numeric, (v_movement->>'calories')::integer, (v_movement->>'duration_seconds')::integer,
            v_movement->>'notes', nullif(v_movement->>'section', '')::smallint);
      end loop;
    end loop;
  end loop;
  insert into public.program_assignments(coach_id, program_id, athlete_id, start_date) values (v_coach, v_program, p_athlete_id, v_start);
  return v_program;
end $$;
revoke all on function public.apply_draft_program(uuid, jsonb, date) from public, anon, authenticated;
grant execute on function public.apply_draft_program(uuid, jsonb, date) to authenticated;
