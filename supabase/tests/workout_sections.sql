begin;

insert into auth.users(id, email, raw_user_meta_data) values
  ('46000000-0000-0000-0000-000000000001', 'sections-coach@test.local', '{}'),
  ('46000000-0000-0000-0000-000000000002', 'sections-athlete@test.local', '{}');

insert into public.athletes(id, coach_id, user_id, first_name, last_name) values
  ('46000000-0000-0000-0000-000000000011', '46000000-0000-0000-0000-000000000001', '46000000-0000-0000-0000-000000000002', 'Section', 'Athlete');

insert into public.movements(id, coach_id, name, category) values
  ('46000000-0000-0000-0000-000000000021', '46000000-0000-0000-0000-000000000001', 'Section squat', 'weightlifting');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"46000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

do $$
declare
  v_workout uuid;
  v_legacy_workout uuid;
  v_copy uuid;
  v_program uuid;
  v_program_copy uuid;
  v_draft_program uuid;
  v_sections jsonb := '[{"title":"A. Strength","format":"strength","time_cap_seconds":null,"rounds":null}]'::jsonb;
  v_movement jsonb := jsonb_build_array(jsonb_build_object(
    'movement_id','46000000-0000-0000-0000-000000000021',
    'sets',3,'reps',5,'load_kg',80,'section',0
  ));
  v_draft jsonb;
begin
  v_workout := public.save_ai_workout(
    null,
    jsonb_build_object('title','AI sections','workout_type','other','sections',v_sections),
    v_movement,
    null,
    '46000000-0000-0000-0000-000000000011',
    '2026-11-23'
  );
  assert (select sections = v_sections from public.workouts where id = v_workout),
    'save_ai_workout stores sections';
  assert (select section = 0 from public.workout_movements where workout_id = v_workout),
    'save_ai_workout stores movement section';

  v_legacy_workout := public.save_ai_workout(
    null,
    jsonb_build_object('title','Legacy AI workout','workout_type','strength'),
    jsonb_build_array(jsonb_build_object(
      'movement_id','46000000-0000-0000-0000-000000000021',
      'sets',3,'reps',5
    ))
  );
  assert (select sections = '[]'::jsonb from public.workouts where id = v_legacy_workout),
    'save_ai_workout defaults missing sections to an empty array';
  assert (select section is null from public.workout_movements where workout_id = v_legacy_workout),
    'save_ai_workout defaults missing movement section to null';

  v_copy := public.copy_workout_for_athlete(v_workout, '46000000-0000-0000-0000-000000000011', '2026-11-24');
  assert (select sections = v_sections from public.workouts where id = v_copy),
    'copy_workout_for_athlete carries sections';
  assert (select section = 0 from public.workout_movements where workout_id = v_copy),
    'copy_workout_for_athlete carries movement section';

  insert into public.programs(id, coach_id, name, weeks) values
    ('46000000-0000-0000-0000-000000000031', auth.uid(), 'Section program', 1);
  insert into public.program_assignments(coach_id, program_id, athlete_id, start_date) values
    (auth.uid(), '46000000-0000-0000-0000-000000000031', '46000000-0000-0000-0000-000000000011', '2026-11-23');
  insert into public.workouts(id, coach_id, program_id, title, workout_type, week_number, day_number, sections) values
    ('46000000-0000-0000-0000-000000000032', auth.uid(), '46000000-0000-0000-0000-000000000031', 'Program WOD', 'other', 1, 1, v_sections);
  insert into public.workout_movements(coach_id, workout_id, movement_id, position, sets, reps, section) values
    (auth.uid(), '46000000-0000-0000-0000-000000000032', '46000000-0000-0000-0000-000000000021', 1, 3, 5, 0);
  v_program_copy := public.copy_program_for_athlete('46000000-0000-0000-0000-000000000031', '46000000-0000-0000-0000-000000000011');
  assert (select sections = v_sections from public.workouts where program_id = v_program_copy),
    'copy_program_for_athlete carries sections';
  assert (select section = 0 from public.workout_movements m join public.workouts w on w.id = m.workout_id where w.program_id = v_program_copy),
    'copy_program_for_athlete carries movement section';

  insert into public.athlete_intakes(athlete_id, coach_id, status, current_step, answers, completed_at) values
    ('46000000-0000-0000-0000-000000000011', auth.uid(), 'completed', 7, '{"days_per_week":1}', now());
  select jsonb_build_object(
    'name','Section draft','rationale','Section test','start_date','2026-11-25',
    'weeks', jsonb_agg(jsonb_build_object(
      'week_number', week_number,
      'workouts', jsonb_build_array(jsonb_build_object(
        'day_number',1,'title','Draft WOD','workout_type','other','time_cap_minutes',30,
        'sections',v_sections,
        'movements',v_movement
      ))
    ))
  ) into v_draft
  from generate_series(1,4) as weeks(week_number);
  v_draft_program := public.apply_draft_program('46000000-0000-0000-0000-000000000011', v_draft, '2026-11-21');
  assert (select sections = v_sections from public.workouts where program_id = v_draft_program order by week_number limit 1),
    'apply_draft_program carries sections';
  assert (select section = 0 from public.workout_movements m join public.workouts w on w.id = m.workout_id where w.program_id = v_draft_program order by w.week_number limit 1),
    'apply_draft_program carries movement section';

  begin
    update public.workout_movements set section = 10 where workout_id = v_workout;
    raise exception 'out-of-range movement section accepted';
  exception when check_violation then null; end;
  begin
    update public.workouts set sections = '{}'::jsonb where id = v_workout;
    raise exception 'non-array sections accepted';
  exception when check_violation or data_exception then null; end;
  begin
    update public.workouts set sections = sections || sections || sections || sections || sections || sections || sections || sections || sections || sections || sections where id = v_workout;
    raise exception 'more than ten sections accepted';
  exception when check_violation then null; end;
  begin
    insert into public.workout_results(coach_id, workout_id, athlete_id, performed_on, section_scores)
    values (auth.uid(), v_workout, '46000000-0000-0000-0000-000000000011', '2026-11-23', '{}'::jsonb);
    raise exception 'non-array section scores accepted';
  exception when check_violation or data_exception then null; end;
  begin
    insert into public.workout_results(coach_id, workout_id, athlete_id, performed_on, section_scores)
    values (auth.uid(), v_workout, '46000000-0000-0000-0000-000000000011', '2026-11-23', jsonb_build_array('{}','{}','{}','{}','{}','{}','{}','{}','{}','{}','{}'));
    raise exception 'more than ten section scores accepted';
  exception when check_violation then null; end;
end $$;

reset role;
rollback;
