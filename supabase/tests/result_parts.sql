begin;

insert into auth.users(id, email, raw_user_meta_data) values
  ('42000000-0000-0000-0000-000000000001', 'parts-coach-a@test.local', '{}'),
  ('42000000-0000-0000-0000-000000000002', 'parts-athlete-a@test.local', '{}'),
  ('42000000-0000-0000-0000-000000000003', 'parts-coach-b@test.local', '{}'),
  ('42000000-0000-0000-0000-000000000004', 'parts-athlete-b@test.local', '{}'),
  ('42000000-0000-0000-0000-000000000005', 'parts-team-coach@test.local', '{}');

update public.coaches
set gym_id = '42000000-0000-0000-0000-000000000001'
where id = '42000000-0000-0000-0000-000000000005';

insert into public.athletes(id, coach_id, user_id, first_name, last_name) values
  ('42000000-0000-0000-0000-000000000011', '42000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000002', 'Parts', 'Athlete A'),
  ('42000000-0000-0000-0000-000000000012', '42000000-0000-0000-0000-000000000003', '42000000-0000-0000-0000-000000000004', 'Parts', 'Athlete B');

insert into public.movements(id, coach_id, name, category) values
  ('42000000-0000-0000-0000-000000000021', '42000000-0000-0000-0000-000000000001', 'Parts squat', 'weightlifting'),
  ('42000000-0000-0000-0000-000000000022', '42000000-0000-0000-0000-000000000003', 'Other squat', 'weightlifting');

insert into public.workouts(id, coach_id, title, workout_type) values
  ('42000000-0000-0000-0000-000000000031', '42000000-0000-0000-0000-000000000001', 'Parts test WOD', 'strength'),
  ('42000000-0000-0000-0000-000000000032', '42000000-0000-0000-0000-000000000003', 'Other WOD', 'strength');

insert into public.workout_movements(id, coach_id, workout_id, movement_id, position, sets, reps) values
  ('42000000-0000-0000-0000-000000000041', '42000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000031', '42000000-0000-0000-0000-000000000021', 0, 3, 5);

insert into public.workout_results(id, coach_id, workout_id, athlete_id, logged_by, performed_on, parts) values
  ('42000000-0000-0000-0000-000000000051', '42000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000031', '42000000-0000-0000-0000-000000000011', '42000000-0000-0000-0000-000000000002', '2026-11-23', '[]'),
  ('42000000-0000-0000-0000-000000000052', '42000000-0000-0000-0000-000000000003', '42000000-0000-0000-0000-000000000032', '42000000-0000-0000-0000-000000000012', '42000000-0000-0000-0000-000000000004', '2026-11-23', '[]');

insert into public.benchmarks(id, coach_id, name, kind, workout_type, movement_id) values
  ('42000000-0000-0000-0000-000000000061', '42000000-0000-0000-0000-000000000001', 'Parts squat 1RM', 'lift', 'strength', '42000000-0000-0000-0000-000000000021'),
  ('42000000-0000-0000-0000-000000000062', '42000000-0000-0000-0000-000000000003', 'Other squat 1RM', 'lift', 'strength', '42000000-0000-0000-0000-000000000022');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"42000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

do $$
declare n integer;
begin
  update public.workout_results
  set parts = '[{"position":0,"movement_id":"42000000-0000-0000-0000-000000000021","name":"Parts squat","sets":[{"reps":5,"load_kg":100,"done":true}]}]'::jsonb
  where id = '42000000-0000-0000-0000-000000000051';
  get diagnostics n = row_count;
  assert n = 1, 'athlete can save parts on their own result';

  update public.workout_results
  set parts = '[]'::jsonb
  where id = '42000000-0000-0000-0000-000000000052';
  get diagnostics n = row_count;
  assert n = 0, 'athlete cannot update another scope result';

  assert (select count(*) = 0 from public.workout_results where id = '42000000-0000-0000-0000-000000000052'),
    'another scope result and its parts are not readable';
end $$;

select set_config('request.jwt.claims', '{"sub":"42000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
do $$ declare n integer; begin
  insert into public.benchmark_results(
    coach_id, athlete_id, benchmark_id, performed_on, load_kg, rep_max,
    source_result_id, notes
  ) values (
    '42000000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000011',
    '42000000-0000-0000-0000-000000000061',
    '2026-11-23',
    105,
    5,
    '42000000-0000-0000-0000-000000000051',
    'From WOD: Parts test WOD'
  );
  get diagnostics n = row_count;
  assert n = 1, 'team coach can log a lift PR in their gym scope';
end $$;

reset role;
do $$ begin
  begin
    insert into public.benchmark_results(
      coach_id, athlete_id, benchmark_id, performed_on, load_kg, rep_max,
      source_result_id
    ) values (
      '42000000-0000-0000-0000-000000000003',
      '42000000-0000-0000-0000-000000000012',
      '42000000-0000-0000-0000-000000000062',
      '2026-11-23',
      105,
      5,
      '42000000-0000-0000-0000-000000000051'
    );
    raise exception 'benchmark result accepted another athlete source result';
  exception when foreign_key_violation then
    null;
  end;
end $$;

insert into public.benchmark_results(
  id, coach_id, athlete_id, benchmark_id, performed_on, load_kg, rep_max,
  source_result_id, notes
) values (
  '42000000-0000-0000-0000-000000000071',
  '42000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000011',
  '42000000-0000-0000-0000-000000000061',
  '2026-11-23',
  100,
  5,
  '42000000-0000-0000-0000-000000000051',
  'From WOD: Parts test WOD'
);
delete from public.workout_results where id = '42000000-0000-0000-0000-000000000051';
do $$ begin
  assert (select count(*) = 0 from public.benchmark_results where source_result_id = '42000000-0000-0000-0000-000000000051'),
    'automatic lift PR cascades when its WOD result is deleted';
end $$;

rollback;
