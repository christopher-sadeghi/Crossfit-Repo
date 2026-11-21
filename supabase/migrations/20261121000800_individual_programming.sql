alter table public.programs
  add column athlete_id uuid,
  add column source_program_id uuid references public.programs (id) on delete set null,
  add constraint programs_athlete_id_coach_id_fkey
    foreign key (athlete_id, coach_id) references public.athletes (id, coach_id) on delete cascade;

alter table public.workouts
  add column athlete_id uuid,
  add constraint workouts_athlete_id_coach_id_fkey
    foreign key (athlete_id, coach_id) references public.athletes (id, coach_id) on delete cascade,
  add constraint workouts_one_off_shape
    check (athlete_id is null or (program_id is null and scheduled_on is not null));

create index programs_athlete_id_idx on public.programs (athlete_id);
create index workouts_athlete_id_scheduled_on_idx on public.workouts (athlete_id, scheduled_on);

create function public.enforce_personal_program_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_program_athlete_id uuid;
begin
  select p.athlete_id
  into v_program_athlete_id
  from public.programs p
  where p.id = new.program_id;

  if v_program_athlete_id is not null and v_program_athlete_id <> new.athlete_id then
    raise exception 'A personal program can only be assigned to its athlete.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_personal_program_assignment() from public, anon, authenticated;

create trigger enforce_personal_program_assignment
  before insert or update on public.program_assignments
  for each row execute function public.enforce_personal_program_assignment();

create function public.copy_program_for_athlete(
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

drop policy "Athletes can view assigned or completed workouts" on public.workouts;
create policy "Athletes can view assigned or completed workouts" on public.workouts
  for select to authenticated
  using (
    athlete_id = (select public.current_athlete_id())
    or exists (
      select 1
      from public.program_assignments pa
      where pa.program_id = workouts.program_id
        and pa.athlete_id = (select public.current_athlete_id())
    )
    or exists (
      select 1
      from public.workout_results wr
      where wr.workout_id = workouts.id
        and wr.athlete_id = (select public.current_athlete_id())
    )
  );

create or replace function public.athlete_can_view_workout(p_workout_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workouts w
    where w.id = p_workout_id
      and (
        w.athlete_id = public.current_athlete_id()
        or exists (
          select 1
          from public.program_assignments pa
          where pa.program_id = w.program_id
            and pa.athlete_id = public.current_athlete_id()
        )
        or exists (
          select 1
          from public.workout_results r
          where r.workout_id = w.id
            and r.athlete_id = public.current_athlete_id()
        )
      )
  );
$$;

revoke all on function public.athlete_can_view_workout(uuid) from public, anon;
grant execute on function public.athlete_can_view_workout(uuid) to authenticated;

create or replace function public.load_demo_data(reset boolean default false)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  result jsonb;
  demo_program_id uuid;
  one_off_athlete_id uuid;
  one_off_workout_id uuid;
  personal_athlete_id uuid;
  attention_athlete_id uuid;
  attention_result_id uuid;
  attention_workout_id uuid;
  attention_workout_type public.workout_type;
begin
  result := public.load_demo_data_unscored(reset);

  select p.id
  into demo_program_id
  from public.programs p
  where p.coach_id = uid
    and p.name = '8-Week Engine & Strength Builder'
    and p.athlete_id is null;

  select a.id
  into one_off_athlete_id
  from public.athletes a
  where a.coach_id = uid
    and a.first_name = 'Jake'
    and a.last_name = 'Morrison';

  if demo_program_id is null or one_off_athlete_id is null then
    raise exception 'The demo program or Jake athlete was not created.';
  end if;

  insert into public.workouts (
    coach_id,
    title,
    workout_type,
    notes,
    athlete_id,
    scheduled_on
  )
  values (
    uid,
    'Knee-friendly accessory',
    'strength',
    'Instead of box jumps',
    one_off_athlete_id,
    current_date + 1
  )
  returning id into one_off_workout_id;

  insert into public.workout_movements (
    coach_id,
    workout_id,
    movement_id,
    position,
    sets,
    reps
  )
  select
    uid,
    one_off_workout_id,
    mv.id,
    selected.position,
    3,
    selected.reps
  from (
    values
      ('Box Step-Up', 1, 10),
      ('Goblet Squat', 2, 10),
      ('Ring Row', 3, 12)
  ) as selected(name, position, reps)
  join public.movements mv
    on mv.name = selected.name
    and mv.coach_id is null
  order by selected.position;

  select a.id
  into personal_athlete_id
  from public.athletes a
  join public.program_assignments pa
    on pa.athlete_id = a.id
    and pa.coach_id = a.coach_id
  where a.coach_id = uid
    and a.first_name = 'Priya'
    and a.last_name = 'Patel'
    and pa.program_id = demo_program_id;

  if personal_athlete_id is null then
    raise exception 'The demo athlete for the personal copy was not assigned.';
  end if;

  perform public.copy_program_for_athlete(demo_program_id, personal_athlete_id, null);

  with feedback as (
    select
      r.id,
      5 + mod(extract(doy from r.performed_on)::integer + length(a.first_name), 4) as rpe,
      2 + mod(extract(doy from r.performed_on)::integer + length(a.first_name) + 1, 4) as energy,
      6 + mod(extract(doy from r.performed_on)::integer + length(a.first_name) + 2, 6) * 0.5 as sleep_hours,
      1 + mod(extract(doy from r.performed_on)::integer + length(a.first_name) + 3, 4) as soreness
    from public.workout_results r
    join public.athletes a on a.id = r.athlete_id
    where r.coach_id = uid
      and r.performed_on between current_date - 21 and current_date
  )
  update public.workout_results r
  set
    rpe = feedback.rpe,
    energy = feedback.energy,
    sleep_hours = feedback.sleep_hours,
    soreness = feedback.soreness,
    updated_at = now()
  from feedback
  where r.id = feedback.id;

  select a.id
  into attention_athlete_id
  from public.athletes a
  where a.coach_id = uid
    and (
      a.injuries is not null
      or (a.first_name = 'Maya' and coalesce(a.injuries, '') ilike '%knee%')
    )
  order by
    case when a.first_name = 'Maya' and coalesce(a.injuries, '') ilike '%knee%' then 0 else 1 end,
    coalesce(
      array_position(
        array['Maya', 'Jake', 'Priya', 'Marcus', 'Sofia', 'Ethan', 'Hannah', 'David', 'Olivia', 'Ryan', 'Grace', 'Carlos'],
        a.first_name
      ),
      999
    )
  limit 1;

  if attention_athlete_id is not null then
    select r.id
    into attention_result_id
    from public.workout_results r
    where r.athlete_id = attention_athlete_id
      and r.performed_on between current_date - 2 and current_date - 1
    order by r.performed_on desc, r.created_at desc
    limit 1;

    if attention_result_id is not null then
      update public.workout_results
      set rpe = 9, pain_notes = 'Left knee ached on the box jumps.', updated_at = now()
      where id = attention_result_id;
    else
      select w.id, w.workout_type
      into attention_workout_id, attention_workout_type
      from public.workouts w
      join public.program_assignments pa on pa.program_id = w.program_id
      where pa.athlete_id = attention_athlete_id
        and w.coach_id = uid
        and w.scheduled_on < current_date
      order by w.scheduled_on desc
      limit 1;

      if attention_workout_id is not null then
        insert into public.workout_results (
          workout_id, athlete_id, coach_id, performed_on, time_seconds, rounds, reps, load_kg,
          is_rx, rpe, energy, sleep_hours, soreness, pain_notes, updated_at
        )
        values (
          attention_workout_id,
          attention_athlete_id,
          uid,
          current_date - 1,
          case when attention_workout_type = 'for_time' then 600 end,
          case when attention_workout_type in ('amrap', 'emom') then 5 end,
          case when attention_workout_type in ('amrap', 'emom') then 10
            when attention_workout_type = 'other' then 20 end,
          case when attention_workout_type = 'strength' then 50 end,
          true,
          9,
          3,
          7.5,
          3,
          'Left knee ached on the box jumps.',
          now()
        );
      end if;
    end if;
  end if;

  result := jsonb_set(
    result,
    '{results}',
    to_jsonb((select count(*) from public.workout_results where coach_id = uid)),
    true
  );

  return result;
end;
$$;

revoke execute on function public.load_demo_data(boolean) from public, anon;
grant execute on function public.load_demo_data(boolean) to authenticated;
