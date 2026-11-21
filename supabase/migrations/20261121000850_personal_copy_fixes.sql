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
  v_coach_id uuid := auth.uid();
  v_source public.programs%rowtype;
  v_athlete public.athletes%rowtype;
  v_start_date date;
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
    and a.coach_id = v_coach_id;

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

  insert into public.programs (coach_id, name, description, weeks, athlete_id, source_program_id)
  values (
    v_coach_id,
    v_source.name || ' — ' || v_athlete.first_name,
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
      week_number,
      day_number,
      scheduled_on,
      athlete_id
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
      v_source_workout.week_number,
      v_source_workout.day_number,
      v_source_workout.scheduled_on,
      v_source_workout.athlete_id
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
      notes
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
      wm.notes
    from public.workout_movements wm
    where wm.workout_id = v_source_workout.id
      and wm.coach_id = v_coach_id;

    insert into public.athlete_workout_scalings (
      coach_id,
      workout_id,
      athlete_id,
      modifications,
      details
    )
    select
      aws.coach_id,
      v_new_workout_id,
      aws.athlete_id,
      aws.modifications,
      aws.details
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
