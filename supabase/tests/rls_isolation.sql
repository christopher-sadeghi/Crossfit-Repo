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

select 'rls_isolation: all checks passed' as result;

rollback;
