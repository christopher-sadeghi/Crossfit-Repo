begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('35000000-0000-0000-0000-000000000101','draft-x@test.local','{}'),
 ('35000000-0000-0000-0000-000000000102','draft-y@test.local','{}');
insert into public.athletes(id,coach_id,first_name,last_name) values
 ('35000000-0000-0000-0000-000000000111','35000000-0000-0000-0000-000000000101','Draft','Athlete');
insert into public.athlete_intakes(athlete_id,coach_id,status,current_step,answers,completed_at) values
 ('35000000-0000-0000-0000-000000000111','35000000-0000-0000-0000-000000000101','completed',7,'{"days_per_week":2}',now());
create temporary table draft_fixture(payload jsonb);
insert into draft_fixture select jsonb_build_object('name','First 4 weeks','rationale','Gradual progression','start_date','2026-11-23','weeks',
 (select jsonb_agg(jsonb_build_object('week_number',w,'workouts',
   (select jsonb_agg(jsonb_build_object('day_number',d,'title','Training','workout_type','strength','time_cap_minutes',30,'movements',
     jsonb_build_array(jsonb_build_object('movement_id',(select id from public.movements where coach_id is null limit 1),'sets',3,'reps',5,'load_kg',45.36)))) from unnest(array[1,4]) d))) from generate_series(1,4) w));
grant select on draft_fixture to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"35000000-0000-0000-0000-000000000102","role":"authenticated"}',true);
do $$ begin
 begin
   perform public.apply_draft_program('35000000-0000-0000-0000-000000000111',(select payload from draft_fixture),'2026-11-21');
   raise exception 'Coach Y applied to coach X athlete';
 exception when insufficient_privilege then null; end;
 raise notice 'PASS: coach Y cannot apply a draft to coach X athlete';
end $$;
select set_config('request.jwt.claims','{"sub":"35000000-0000-0000-0000-000000000101","role":"authenticated"}',true);
do $$ declare p uuid; before_count integer; bad jsonb; begin
 select count(*) into before_count from public.programs;
 bad := jsonb_set((select payload from draft_fixture),'{weeks,3,workouts,1,movements,0,movement_id}','"35000000-0000-0000-0000-000000000199"');
 begin
   perform public.apply_draft_program('35000000-0000-0000-0000-000000000111',bad,'2026-11-21');
   raise exception 'Invalid movement accepted';
 exception when raise_exception then if sqlerrm <> 'unknown_movement' then raise; end if; end;
 assert (select count(*) from public.programs) = before_count;
 assert (select count(*) from public.workouts) = 0;
 raise notice 'PASS: invalid late-week movement rolls back program and all workouts';
 p := public.apply_draft_program('35000000-0000-0000-0000-000000000111',(select payload from draft_fixture),'2026-11-21');
 assert (select weeks = 4 and athlete_id = '35000000-0000-0000-0000-000000000111' and source_program_id is null from public.programs where id = p);
 assert (select count(*) from public.workouts where program_id = p) = 8;
 assert (select count(*) from public.workout_movements m join public.workouts w on w.id = m.workout_id where w.program_id = p and load_kg = 45.36) = 8;
 assert (select start_date from public.program_assignments where program_id = p) = '2026-11-23'::date;
 assert (select max(a.start_date + (w.week_number-1)*7 + w.day_number-1) from public.program_assignments a join public.workouts w on w.program_id = a.program_id where a.program_id = p) = '2026-12-17'::date;
 raise notice 'PASS: atomic personal program, 8 workouts/movements, kg loads and dated assignment created';
 begin
   perform public.apply_draft_program('35000000-0000-0000-0000-000000000111',(select payload from draft_fixture),'2026-11-24');
   raise exception 'Past start accepted';
 exception when raise_exception then if sqlerrm <> 'invalid_start_date' then raise; end if; end;
 update public.athletes set status = 'archived' where id = '35000000-0000-0000-0000-000000000111';
 begin
   perform public.apply_draft_program('35000000-0000-0000-0000-000000000111',(select payload from draft_fixture),'2026-11-21');
   raise exception 'Archived athlete accepted';
 exception when insufficient_privilege then null; end;
 raise notice 'PASS: past start and archived athlete rejected';
end $$;
rollback;
