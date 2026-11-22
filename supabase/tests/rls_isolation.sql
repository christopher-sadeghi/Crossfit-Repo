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
-- Without invite metadata handle_new_user makes a coach profile; real athlete signups don't have one.
delete from public.coaches where id = '00000000-0000-0000-0000-00000000000c';
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

  update public.athlete_journal_entries set stress = 4, soreness = 4, energy = 3, mood = 3, soreness_areas = array['quads'] where athlete_id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  assert n = 1, 'athlete should be able to update their own journal';
  assert (select stress = 4 and soreness = 4 and energy = 3 and mood = 3 and soreness_areas = array['quads'] and readiness is not null from public.athlete_journal_entries where athlete_id = '00000000-0000-0000-0000-0000000000a1'),
    'new check-in columns should be writable and readiness computed under athlete RLS';

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

-- Movement guides are private to the coach and readable by linked athletes.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
insert into public.movement_guides (movement_id, cues)
select id, array['Brace your trunk.'] from public.movements where coach_id is null limit 1;
insert into public.movement_guides (movement_id, cues)
values ('00000000-0000-0000-0000-0000000000a3', array['Move with control.']);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', true);
do $$
declare n integer;
begin
  assert (select count(*) from public.movement_guides) = 0, 'coach B cannot see A guides';
  update public.movement_guides set cues = array['hacked'];
  get diagnostics n = row_count;
  assert n = 0, 'coach B cannot update A guides';
  delete from public.movement_guides;
  get diagnostics n = row_count;
  assert n = 0, 'coach B cannot delete A guides';
  begin
    insert into public.movement_guides (movement_id)
    values ('00000000-0000-0000-0000-0000000000a3');
    raise exception 'coach B inserted guide for A custom movement';
  exception when insufficient_privilege then null;
  end;
  insert into public.movement_guides (movement_id)
  select id from public.movements where coach_id is null limit 1;
  begin
    update public.movement_guides set movement_id = '00000000-0000-0000-0000-0000000000a3';
    raise exception 'coach B updated guide to A custom movement';
  exception when insufficient_privilege then null;
  end;
  delete from public.movement_guides;
end $$;

reset role;
select set_config('request.jwt.claims', '{}', true);
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a4', 'athlete-a@test.local', '{}'),
  ('00000000-0000-0000-0000-0000000000b4', 'athlete-b@test.local', '{}');
delete from public.coaches where id in ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000b4');
update public.athletes set user_id = '00000000-0000-0000-0000-0000000000a4'
where id = '00000000-0000-0000-0000-0000000000a1';
insert into public.athletes (coach_id, user_id, first_name, last_name)
values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b4', 'Blake', 'Athlete');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4"}', true);
do $$
declare n integer;
begin
  assert (select count(*) from public.movement_guides) = 2, 'athlete A can read coach A guides';
  update public.movement_guides set cues = array['hacked'];
  get diagnostics n = row_count;
  assert n = 0, 'athlete cannot update guides';
  delete from public.movement_guides;
  get diagnostics n = row_count;
  assert n = 0, 'athlete cannot delete guides';
  begin
    insert into public.movement_guides (coach_id, movement_id)
    select '00000000-0000-0000-0000-00000000000a', id from public.movements where coach_id is null limit 1;
    raise exception 'athlete inserted guide';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b4"}', true);
do $$ begin
  assert (select count(*) from public.movement_guides) = 0, 'athlete B cannot read A guides';
end $$;

-- Food preferences, food log and food ideas (FIT-24).
reset role;
select set_config('request.jwt.claims', '{}', true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
insert into public.athlete_food_preferences (athlete_id, coach_id, diet_type, allergies)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'vegetarian', '{peanuts}');
insert into public.nutrition_targets (athlete_id, calories, protein_g, carbs_g, fat_g, start_date)
values ('00000000-0000-0000-0000-0000000000a1', 2200, 150, 220, 70, '2026-01-01');
insert into public.ai_suggestions (id, athlete_id, suggestion_type, status, input) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', 'suggest_food', 'idea', '{}'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000a1', 'adjust_macros', 'pending', '{}');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4"}', true);
do $$
declare n integer;
begin
  assert (select count(*) from public.athlete_food_preferences) = 1, 'athlete A can read their food preferences';
  update public.athlete_food_preferences set dislikes = '{olives}' where athlete_id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  assert n = 1, 'athlete A can update their food preferences';
  assert (select count(*) from public.nutrition_targets) = 1, 'athlete A can read their targets';
  assert (select count(*) from public.ai_suggestions) = 1, 'athlete A sees only food ideas, not other AI suggestions';
  update public.nutrition_targets set calories = 9000;
  get diagnostics n = row_count;
  assert n = 0, 'athlete A cannot change targets';

  insert into public.ai_suggestions (athlete_id, coach_id, suggestion_type, status, input)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'suggest_food', 'failed', '{}');
  begin
    insert into public.ai_suggestions (athlete_id, coach_id, suggestion_type, status, input)
    values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'adjust_macros', 'pending', '{}');
    raise exception 'athlete created a non-food AI suggestion';
  exception when insufficient_privilege then null;
  end;
  update public.ai_suggestions set status = 'approved' where id = '00000000-0000-0000-0000-0000000000f1';
  get diagnostics n = row_count;
  assert n = 0, 'athlete cannot approve a coach-requested idea';

  insert into public.food_logs (athlete_id, coach_id, meal, food_name, ai_suggestion_id)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'snack', 'Idea', '00000000-0000-0000-0000-0000000000f1');
  update public.food_logs set calories = 1;
  get diagnostics n = row_count;
  assert n = 0, 'athletes cannot edit food log entries';
  delete from public.food_logs where food_name = 'Idea';
  get diagnostics n = row_count;
  assert n = 1, 'athlete A can remove their own food log entry';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b4"}', true);
do $$
declare n integer;
begin
  assert (select count(*) from public.athlete_food_preferences) = 0, 'athlete B cannot read A food preferences';
  assert (select count(*) from public.ai_suggestions) = 0, 'athlete B cannot read A food ideas';
  assert (select count(*) from public.nutrition_targets) = 0, 'athlete B cannot read A targets';
  update public.athlete_food_preferences set allergies = '{}';
  get diagnostics n = row_count;
  assert n = 0, 'athlete B cannot change A food preferences';
  begin
    insert into public.food_logs (athlete_id, coach_id, meal, food_name)
    values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'snack', 'x');
    raise exception 'athlete B logged food for athlete A';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.food_logs (athlete_id, coach_id, meal, food_name, ai_suggestion_id)
    select id, coach_id, 'snack', 'x', '00000000-0000-0000-0000-0000000000f1' from public.athletes;
    raise exception 'athlete B linked a food log to A''s idea';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', true);
do $$ begin
  assert (select count(*) from public.athlete_food_preferences) = 0, 'coach B cannot read A food preferences';
  begin
    insert into public.athlete_food_preferences (athlete_id, coach_id)
    values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a');
    raise exception 'coach B wrote A food preferences';
  exception when insufficient_privilege then null;
  end;
end $$;

select 'rls_isolation: all checks passed' as result;

-- Saved food library (FIT-34).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
insert into public.saved_foods (id, athlete_id, kind, name, serving_label, calories, protein_g, carbs_g, fat_g, source)
values ('00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-0000000000a1', 'custom', 'Banana', '1 banana', 100, 1, 25, 0, 'custom');
do $$ begin
  assert (select count(*) from public.saved_foods) = 1, 'coach reads own food';
  update public.saved_foods set calories = 101;
  assert found, 'coach updates own food';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', true);
do $$ begin
  assert (select count(*) from public.saved_foods) = 0, 'other coach cannot read';
  update public.saved_foods set calories = 999;
  assert not found, 'other coach cannot update';
  delete from public.saved_foods;
  assert not found, 'other coach cannot delete';
  begin
    insert into public.saved_foods (coach_id, athlete_id, kind, name, serving_label, calories, protein_g, carbs_g, fat_g, source)
    values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'custom', 'Bad', '1', 1, 0, 0, 0, 'custom');
    raise exception 'other coach inserted';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b4"}', true);
do $$ begin
  assert (select count(*) from public.saved_foods) = 0, 'other athlete cannot read';
  update public.saved_foods set calories = 999;
  assert not found, 'other athlete cannot update';
  delete from public.saved_foods;
  assert not found, 'other athlete cannot delete';
  begin
    insert into public.saved_foods (coach_id, athlete_id, kind, name, serving_label, calories, protein_g, carbs_g, fat_g, source)
    values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'custom', 'Bad', '1', 1, 0, 0, 0, 'custom');
    raise exception 'other athlete inserted';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4"}', true);
do $$ begin
  assert (select count(*) from public.saved_foods) = 1, 'athlete reads own food';
  update public.saved_foods set calories = 102;
  assert found, 'athlete updates own food';
  begin
    update public.saved_foods set coach_id = '00000000-0000-0000-0000-00000000000b';
    raise exception 'athlete moved food to other coach';
  exception when insufficient_privilege then null;
  end;
  delete from public.saved_foods;
  assert found, 'athlete deletes own food';
end $$;
insert into public.saved_foods (athlete_id, coach_id, kind, name, serving_label, calories, protein_g, carbs_g, fat_g, source)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'custom', 'Yogurt', '100 g', 60, 10, 4, 0, 'custom');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
do $$ begin
  delete from public.saved_foods;
  assert found, 'coach deletes own food';
  assert not has_table_privilege('authenticated', 'public.saved_foods', 'TRUNCATE'), 'no truncate privilege';
  assert not has_table_privilege('anon', 'public.saved_foods', 'SELECT'), 'no anonymous reads';
end $$;
select 'saved_foods coach/athlete CRUD and isolation passed' as result;
rollback;
