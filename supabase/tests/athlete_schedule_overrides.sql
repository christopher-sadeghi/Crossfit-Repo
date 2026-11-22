begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'calendar-a@test.local', '{}'),
  ('00000000-0000-0000-0000-00000000000b', 'calendar-b@test.local', '{}'),
  ('00000000-0000-0000-0000-00000000000c', 'calendar-athlete@test.local', '{}');
insert into public.athletes (id, coach_id, first_name, last_name, user_id)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'Calendar', 'Athlete', '00000000-0000-0000-0000-00000000000c');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
insert into public.programs (id, name, weeks) values ('00000000-0000-0000-0000-0000000000a2', 'Group', 4);
insert into public.program_assignments (program_id, athlete_id, start_date)
values ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', '2026-11-23');
insert into public.workouts (id, program_id, title, workout_type, week_number, day_number)
values ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a2', 'Group WOD', 'amrap', 2, 3);
insert into public.workout_movements (workout_id, movement_id, reps)
select '00000000-0000-0000-0000-0000000000a3', id, 10 from public.movements where coach_id is null limit 1;
insert into public.athlete_workout_scalings (workout_id, athlete_id, modifications)
values ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', 'Go lighter');
do $$
declare v_id uuid;
begin
  v_id := public.override_workout_for_athlete('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', 'edit');
  assert (select source_workout_id = '00000000-0000-0000-0000-0000000000a3' and scheduled_on = '2026-12-02' and program_id is null from public.workouts where id = v_id);
  assert (select count(*) from public.workout_movements where workout_id = v_id) = 1;
  assert (select modifications from public.athlete_workout_scalings where workout_id = v_id) = 'Go lighter';
  assert public.override_workout_for_athlete('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', 'edit') = v_id;
  perform public.override_workout_for_athlete('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', 'remove');
  assert not exists (select 1 from public.workouts where id = v_id);
  assert exists (select 1 from public.athlete_workout_overrides where replacement_workout_id is null);
  perform public.restore_workout_for_athlete('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1');
  assert not exists (select 1 from public.athlete_workout_overrides);
  perform public.restore_workout_for_athlete('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1');
  v_id := public.override_workout_for_athlete('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', 'edit');
  insert into public.workout_results (workout_id, athlete_id) values (v_id, '00000000-0000-0000-0000-0000000000a1');
  begin
    perform public.restore_workout_for_athlete('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1');
    raise exception 'restore should reject logged replacements';
  exception when raise_exception then
    if sqlerrm <> 'This athlete already logged their version; delete their result first.' then raise; end if;
  end;
  perform public.override_workout_for_athlete('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', 'remove');
  assert exists (select 1 from public.workouts where id = v_id);
  assert exists (select 1 from public.workout_results where workout_id = v_id);
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
do $$
declare n integer;
begin
  assert not exists (select 1 from public.athlete_workout_overrides);
  update public.athlete_workout_overrides set replacement_workout_id = null;
  get diagnostics n = row_count;
  assert n = 0;
  begin
    perform public.override_workout_for_athlete('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', 'edit');
    raise exception 'cross-coach edit succeeded';
  exception when raise_exception then
    if sqlerrm <> 'Choose an athlete from your roster.' then raise; end if;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.athlete_workout_overrides) = 1;
  assert not public.athlete_can_view_workout('00000000-0000-0000-0000-0000000000a3');
end $$;
select 'PASS: edit, movements, source, scaling, idempotency, remove, restore, logged-result protection, coach isolation, athlete visibility' as result;
rollback;
