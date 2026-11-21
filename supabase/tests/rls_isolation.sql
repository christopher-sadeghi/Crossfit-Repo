-- Verifies that one coach cannot read or change another coach's data.
-- Runs inside a transaction and rolls back, so it leaves no data behind.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'coach-a@test.local', '{"full_name": "Coach A"}'),
  ('00000000-0000-0000-0000-00000000000b', 'coach-b@test.local', '{"full_name": "Coach B"}');

set local role authenticated;

-- Coach A creates data.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);

insert into public.athletes (id, first_name, last_name)
values ('00000000-0000-0000-0000-0000000000a1', 'Alex', 'Athlete');
insert into public.workouts (id, title, workout_type)
values ('00000000-0000-0000-0000-0000000000a2', 'Fran', 'for_time');
insert into public.movements (id, name, category)
values ('00000000-0000-0000-0000-0000000000a3', 'Coach A Custom Move', 'other');

do $$
begin
  assert (select count(*) from public.coaches) = 1, 'coach A should see only their own profile';
  assert (select full_name from public.coaches) = 'Coach A', 'profile should be created on sign-up';
  assert (select count(*) from public.athletes) = 1, 'coach A should see their athlete';
end $$;

-- Coach B tries to access coach A's data.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);

do $$
declare
  n integer;
begin
  assert (select count(*) from public.athletes) = 0, 'coach B must not see coach A athletes';
  assert (select count(*) from public.workouts) = 0, 'coach B must not see coach A workouts';
  assert (select count(*) from public.coaches) = 1, 'coach B should see only their own profile';
  assert (select count(*) from public.movements where coach_id is not null) = 0, 'coach B must not see coach A custom movements';
  assert (select count(*) from public.movements where coach_id is null) > 0, 'coach B should see the shared movement library';

  update public.athletes set notes = 'hacked' where id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  assert n = 0, 'coach B must not update coach A athletes';

  delete from public.athletes where id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  assert n = 0, 'coach B must not delete coach A athletes';

  begin
    insert into public.athletes (coach_id, first_name, last_name)
    values ('00000000-0000-0000-0000-00000000000a', 'Sneaky', 'Insert');
    raise exception 'coach B inserted a row owned by coach A';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.workout_results (workout_id, athlete_id)
    values ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1');
    raise exception 'coach B logged a result against coach A data';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.goals (athlete_id, title, goal_type, movement_id)
    values (gen_random_uuid(), 'x', 'performance', '00000000-0000-0000-0000-0000000000a3');
    raise exception 'coach B referenced coach A custom movement in a goal';
  exception when insufficient_privilege or foreign_key_violation then null;
  end;
end $$;

-- Coach B cannot use coach A's custom movement in their own workout.
insert into public.workouts (id, title, workout_type)
values ('00000000-0000-0000-0000-0000000000b2', 'Coach B WOD', 'for_time');

do $$
begin
  begin
    insert into public.workout_movements (workout_id, movement_id)
    values ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a3');
    raise exception 'coach B referenced coach A custom movement in a workout';
  exception when insufficient_privilege then null;
  end;

  insert into public.workout_movements (workout_id, movement_id)
  select '00000000-0000-0000-0000-0000000000b2', id from public.movements where coach_id is null limit 1;
end $$;

-- Athlete self-logging: an athlete can log their own results, not another athlete's.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);

insert into public.programs (id, name)
values ('00000000-0000-0000-0000-0000000000a4', 'Coach A Program');
insert into public.workouts (id, title, workout_type, program_id, week_number, day_number)
values ('00000000-0000-0000-0000-0000000000a5', 'Assigned WOD', 'for_time', '00000000-0000-0000-0000-0000000000a4', 1, 1);
insert into public.athletes (id, first_name, last_name)
values ('00000000-0000-0000-0000-0000000000a6', 'Other', 'Athlete');
insert into public.program_assignments (program_id, athlete_id, start_date)
values ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a1', current_date);
insert into public.workout_results (id, workout_id, athlete_id, time_seconds)
values ('00000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000a6', 300);

-- Link athlete A1 to a login, as the invite flow does.
reset role;
select set_config('request.jwt.claims', '', true);
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000c', 'athlete-a1@test.local', '{"full_name": "Alex Athlete"}');
update public.athletes set user_id = '00000000-0000-0000-0000-00000000000c'
where id = '00000000-0000-0000-0000-0000000000a1';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);

do $$
declare
  n integer;
  own_id uuid;
begin
  insert into public.workout_results (workout_id, athlete_id, coach_id, time_seconds, rpe)
  values ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 240, 8)
  returning id into own_id;
  assert (select logged_by from public.workout_results where id = own_id) = '00000000-0000-0000-0000-00000000000c',
    'athlete result should record the athlete as logged_by';

  update public.workout_results set rpe = 9 where id = own_id;
  get diagnostics n = row_count;
  assert n = 1, 'athlete should be able to update their own result';

  begin
    insert into public.workout_results (workout_id, athlete_id, coach_id, time_seconds)
    values ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-00000000000a', 240);
    raise exception 'athlete logged a result for another athlete';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.workout_results (workout_id, athlete_id, coach_id, time_seconds)
    values ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 240);
    raise exception 'athlete logged a result for a WOD outside their programs';
  exception when insufficient_privilege then null;
  end;

  assert (select count(*) from public.workout_results where athlete_id = '00000000-0000-0000-0000-0000000000a6') = 0,
    'athlete must not see another athlete''s results';

  update public.workout_results set notes = 'hacked' where id = '00000000-0000-0000-0000-0000000000a7';
  get diagnostics n = row_count;
  assert n = 0, 'athlete must not update another athlete''s result';

  delete from public.workout_results where id = '00000000-0000-0000-0000-0000000000a7';
  get diagnostics n = row_count;
  assert n = 0, 'athlete must not delete another athlete''s result';

  delete from public.workout_results where id = own_id;
  get diagnostics n = row_count;
  assert n = 1, 'athlete should be able to delete their own result';
end $$;

-- Daily journal: athletes manage only their own entries; only their coach can read them.
do $$
declare
  n integer;
begin
  insert into public.athlete_journal_entries (athlete_id, coach_id, sleep_hours, sleep_quality, alcohol)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 7.5, 4, true);

  update public.athlete_journal_entries set high_stress = true where athlete_id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  assert n = 1, 'athlete should be able to update their own journal';

  begin
    insert into public.athlete_journal_entries (athlete_id, coach_id, sleep_hours)
    values ('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-00000000000a', 8);
    raise exception 'athlete wrote a journal entry for another athlete';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
insert into public.athlete_journal_entries (athlete_id, coach_id, sleep_hours)
values ('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-00000000000a', 6);
set local role authenticated;

do $$
declare
  n integer;
begin
  assert (select count(*) from public.athlete_journal_entries) = 1, 'athlete must see only their own journal';
  update public.athlete_journal_entries set notes = 'hacked' where athlete_id = '00000000-0000-0000-0000-0000000000a6';
  get diagnostics n = row_count;
  assert n = 0, 'athlete must not update another athlete''s journal';
  delete from public.athlete_journal_entries where athlete_id = '00000000-0000-0000-0000-0000000000a6';
  get diagnostics n = row_count;
  assert n = 0, 'athlete must not delete another athlete''s journal';
end $$;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
do $$
begin
  assert (select count(*) from public.athlete_journal_entries) = 2, 'coach A should see their athletes'' journals';
end $$;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
do $$
begin
  assert (select count(*) from public.athlete_journal_entries) = 0, 'coach B must not see coach A athletes'' journals';
end $$;

select 'rls_isolation: all checks passed' as result;

rollback;
