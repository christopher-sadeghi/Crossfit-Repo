alter table public.workout_results
  add column rpe smallint check (rpe between 1 and 10),
  add column energy smallint check (energy between 1 and 5),
  add column sleep_hours numeric(3, 1) check (sleep_hours >= 0 and sleep_hours <= 24),
  add column soreness smallint check (soreness between 1 and 5),
  add column pain_notes text check (char_length(pain_notes) <= 500),
  add column updated_at timestamptz;

create policy "Athletes can log their own results" on public.workout_results
  for insert to authenticated
  with check (
    athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id())
    and logged_by = auth.uid()
    and exists (
      select 1 from public.workouts w
      where w.id = workout_results.workout_id
    )
  );

create policy "Athletes can update their own results" on public.workout_results
  for update to authenticated
  using (
    athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id())
    and logged_by = auth.uid()
  )
  with check (
    athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id())
    and logged_by = auth.uid()
    and exists (
      select 1 from public.workouts w
      where w.id = workout_results.workout_id
    )
  );

create policy "Athletes can delete their own results" on public.workout_results
  for delete to authenticated
  using (
    athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id())
    and logged_by = auth.uid()
  );

alter function public.load_demo_data(boolean) rename to load_demo_data_unscored;

create function public.load_demo_data(reset boolean default false)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  result jsonb;
  attention_athlete_id uuid;
  attention_result_id uuid;
  attention_workout_id uuid;
  attention_workout_type public.workout_type;
begin
  result := public.load_demo_data_unscored(reset);

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
