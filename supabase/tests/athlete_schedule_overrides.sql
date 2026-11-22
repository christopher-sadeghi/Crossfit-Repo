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
insert into public.ai_suggestions (id, athlete_id, suggestion_type, status, input)
values ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a1', 'athlete_adjust_workout', 'approved', '{"workout_id":"00000000-0000-0000-0000-0000000000a3"}');
insert into public.athlete_workout_scalings (workout_id, athlete_id, modifications, athlete_suggestion_id, athlete_adjusted_at, coach_modifications)
values ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', 'Go lighter', '00000000-0000-0000-0000-0000000000a4', now(), 'Coach scaling');
do $$
declare
  v_id uuid;
  v_scaling uuid;
  v_mode text;
begin
  select id into v_scaling from public.athlete_workout_scalings where athlete_suggestion_id = '00000000-0000-0000-0000-0000000000a4';
  v_id := public.override_workout_for_athlete('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', 'edit');
  assert (select source_workout_id = '00000000-0000-0000-0000-0000000000a3' and scheduled_on = '2026-12-02' and program_id is null from public.workouts where id = v_id);
  assert (select count(*) from public.workout_movements where workout_id = v_id) = 1;
  assert (select modifications from public.athlete_workout_scalings where workout_id = v_id) = 'Go lighter';
  assert (select count(*) from public.athlete_workout_scalings where athlete_suggestion_id = '00000000-0000-0000-0000-0000000000a4') = 1;
  assert (select id = v_scaling and workout_id = v_id and coach_modifications = 'Coach scaling' from public.athlete_workout_scalings where athlete_suggestion_id = '00000000-0000-0000-0000-0000000000a4');
  assert not exists (select 1 from public.athlete_workout_scalings where workout_id = '00000000-0000-0000-0000-0000000000a3');
  assert public.override_workout_for_athlete('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', 'edit') = v_id;
  perform public.override_workout_for_athlete('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', 'remove');
  assert not exists (select 1 from public.workouts where id = v_id);
  assert exists (select 1 from public.athlete_workout_overrides where replacement_workout_id is null);
  assert not exists (select 1 from public.athlete_workout_scalings where id = v_scaling);
  perform public.restore_workout_for_athlete('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1');
  assert not exists (select 1 from public.athlete_workout_overrides);
  perform public.restore_workout_for_athlete('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1');
  foreach v_mode in array array['remove', 'restore', 'delete'] loop
    v_id := public.override_workout_for_athlete('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', 'edit');
    update public.workout_movements set reps = 20 where workout_id = v_id;
    insert into public.athlete_workout_scalings (workout_id, athlete_id, modifications, athlete_suggestion_id)
    values (v_id, '00000000-0000-0000-0000-0000000000a1', 'Scaling for edited replacement', '00000000-0000-0000-0000-0000000000a4');
    insert into public.athlete_workout_scalings (workout_id, athlete_id, modifications)
    values ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', 'New original scaling');
    if v_mode = 'remove' then
      perform public.override_workout_for_athlete('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', 'remove');
    elsif v_mode = 'restore' then
      perform public.restore_workout_for_athlete('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1');
    else
      perform public.delete_athlete_workout(v_id, '00000000-0000-0000-0000-0000000000a1');
    end if;
    assert not exists (select 1 from public.workouts where id = v_id);
    assert not exists (select 1 from public.athlete_workout_scalings where workout_id = v_id);
    assert not exists (select 1 from public.athlete_workout_scalings where athlete_suggestion_id = '00000000-0000-0000-0000-0000000000a4');
    assert (select modifications from public.athlete_workout_scalings where workout_id = '00000000-0000-0000-0000-0000000000a3') = 'New original scaling';
    delete from public.athlete_workout_scalings where workout_id = '00000000-0000-0000-0000-0000000000a3';
    perform public.restore_workout_for_athlete('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1');
  end loop;
  v_id := public.override_workout_for_athlete('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', 'edit');
  insert into public.athlete_workout_scalings (workout_id, athlete_id, modifications)
  values (v_id, '00000000-0000-0000-0000-0000000000a1', 'Logged replacement scaling') returning id into v_scaling;
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
  assert (select workout_id from public.athlete_workout_scalings where id = v_scaling) = v_id;
  begin
    perform public.delete_athlete_workout(v_id, '00000000-0000-0000-0000-0000000000a1');
    raise exception 'delete should reject logged workouts';
  exception when raise_exception then
    if sqlerrm <> 'This athlete already logged this WOD; delete their result first.' then raise; end if;
  end;
  assert exists (select 1 from public.workout_results where workout_id = v_id);
  v_id := public.copy_workout_for_athlete('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', '2026-12-03');
  perform public.delete_athlete_workout(v_id, '00000000-0000-0000-0000-0000000000a1');
  assert not exists (select 1 from public.workouts where id = v_id);
  begin
    perform public.delete_athlete_workout(v_id, '00000000-0000-0000-0000-0000000000a1');
    raise exception 'delete should reject missing workouts';
  exception when raise_exception then
    if sqlerrm <> 'Choose a one-off WOD for this athlete.' then raise; end if;
  end;
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
select 'PASS: scaling moved on edit, replacement scaling discarded on remove/restore/delete, newer original scaling preserved, logged-result protection, safe delete, coach isolation, athlete visibility' as result;
rollback;
