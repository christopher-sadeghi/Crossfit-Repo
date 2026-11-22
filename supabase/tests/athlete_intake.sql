begin;
insert into auth.users(id, email, raw_user_meta_data) values
 ('35000000-0000-0000-0000-000000000001','intake-coach-x@test.local','{}'),
 ('35000000-0000-0000-0000-000000000002','intake-coach-y@test.local','{}'),
 ('35000000-0000-0000-0000-000000000003','intake-athlete-a@test.local','{}'),
 ('35000000-0000-0000-0000-000000000004','intake-athlete-b@test.local','{}');
insert into public.athletes(id, coach_id, first_name, last_name) values
 ('35000000-0000-0000-0000-000000000011','35000000-0000-0000-0000-000000000001','A','Athlete'),
 ('35000000-0000-0000-0000-000000000012','35000000-0000-0000-0000-000000000002','B','Athlete');
do $$ begin
 assert (select count(*) from public.athlete_intakes where athlete_id::text like '35000000%') = 0;
end $$;
update public.athletes set user_id = '35000000-0000-0000-0000-000000000003' where id = '35000000-0000-0000-0000-000000000011';
update public.athletes set user_id = '35000000-0000-0000-0000-000000000004' where id = '35000000-0000-0000-0000-000000000012';
insert into public.goals(id, athlete_id, coach_id, title, goal_type) values
 ('35000000-0000-0000-0000-000000000021','35000000-0000-0000-0000-000000000011','35000000-0000-0000-0000-000000000001','Coach goal','performance');
do $$ begin
 assert (select count(*) from public.athlete_intakes where athlete_id::text like '35000000%' and status = 'requested') = 2;
 assert not has_table_privilege('authenticated','public.athlete_intakes','TRUNCATE');
 assert not has_table_privilege('authenticated','public.athlete_intakes','DELETE');
 assert not has_table_privilege('anon','public.athlete_intakes','SELECT');
 raise notice 'PASS: link trigger requests intake; no anonymous, delete or truncate grants';
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"35000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
do $$ declare n integer; begin
 assert (select count(*) from public.athlete_intakes) = 1;
 update public.athlete_intakes set answers = '{"goal_ids":["35000000-0000-0000-0000-000000000021"]}' where athlete_id = '35000000-0000-0000-0000-000000000011';
 get diagnostics n = row_count; assert n = 0;
 update public.athlete_intakes set answers = '{}' where athlete_id = '35000000-0000-0000-0000-000000000012';
 get diagnostics n = row_count; assert n = 0;
 begin
   perform public.save_athlete_intake_step('35000000-0000-0000-0000-000000000012',1,'{}','2026-11-21');
   raise exception 'RPC allowed another athlete';
 exception when insufficient_privilege then null; end;
 begin
   insert into public.athlete_intakes(athlete_id,coach_id) values ('35000000-0000-0000-0000-000000000011','35000000-0000-0000-0000-000000000001');
   raise exception 'Athlete inserted intake';
 exception when insufficient_privilege then null; end;
 raise notice 'PASS: athlete reads own intake; direct writes, forged bookkeeping and cross-athlete RPC rejected';
end $$;
select public.save_athlete_intake_step('35000000-0000-0000-0000-000000000011',1,'{"birth_date":"1995-01-01","height_cm":180,"sex":"male","weight_kg":80}','2026-11-21');
select public.save_athlete_intake_step('35000000-0000-0000-0000-000000000011',1,'{"birth_date":"1995-01-01","height_cm":180,"sex":"male","weight_kg":81}','2026-11-21');
do $$ declare b uuid; begin
 select id into b from public.benchmarks where kind = 'lift' and coach_id is null limit 1;
 perform public.save_athlete_intake_step('35000000-0000-0000-0000-000000000011',2,
   jsonb_build_object('experience_level','beginner','benchmarks',jsonb_build_array(jsonb_build_object('benchmark_id', b, 'load_kg',100,'rep_max',1))), '2026-11-21');
 assert (select count(*) from public.benchmark_results) = 1;
 begin
   perform public.save_athlete_intake_step('35000000-0000-0000-0000-000000000011',2,
     '{"experience_level":"advanced","benchmarks":[{"benchmark_id":"35000000-0000-0000-0000-000000000099","load_kg":100}]}', '2026-11-21');
   raise exception 'Invalid benchmark accepted';
 exception when check_violation then null; end;
 assert (select count(*) from public.benchmark_results) = 1;
 assert (select experience_level from public.athletes where id = '35000000-0000-0000-0000-000000000011') = 'beginner';
 raise notice 'PASS: benchmark saves to canonical table; invalid benchmark rolls back whole step';
end $$;
select public.save_athlete_intake_step('35000000-0000-0000-0000-000000000011',2,'{"experience_level":"beginner","years_training":1,"crossfit_detail":"New","sports_background":"Running","benchmarks":[]}','2026-11-21');
select public.save_athlete_intake_step('35000000-0000-0000-0000-000000000011',3,'{"goal_ids":["35000000-0000-0000-0000-000000000021"],"goals":[{"title":"Strength: squat","goal_type":"performance","target_value":100,"target_date":"2027-01-01"}]}','2026-11-21');
select public.save_athlete_intake_step('35000000-0000-0000-0000-000000000011',3,'{"goals":[{"title":"Strength: squat","goal_type":"performance","target_value":110,"target_date":null}]}','2026-11-21');
select public.save_athlete_intake_step('35000000-0000-0000-0000-000000000011',4,'{"injury_list":[{"area":"Knee","severity":"mild","notes":"Avoid jumping"}]}','2026-11-21');
select public.save_athlete_intake_step('35000000-0000-0000-0000-000000000011',4,'{"injury_list":[]}','2026-11-21');
do $$ begin
 assert (select injuries from public.athletes where id = '35000000-0000-0000-0000-000000000011') like '%Knee%';
end $$;
select public.save_athlete_intake_step('35000000-0000-0000-0000-000000000011',4,'{"injury_list":[],"no_injuries":true}','2026-11-21');
select public.save_athlete_intake_step('35000000-0000-0000-0000-000000000011',5,'{"days_per_week":3,"session_minutes":60,"location":"gym","equipment":["Barbell"]}','2026-11-21');
select public.save_athlete_intake_step('35000000-0000-0000-0000-000000000011',6,'{"diet_type":"none","allergies":[],"dislikes":[],"cooking_minutes":15,"eating_habits":"Regular meals"}','2026-11-21');
select public.save_athlete_intake_step('35000000-0000-0000-0000-000000000011',7,'{"sleep_hours":8,"stress_level":"low","job_activity":"sedentary"}','2026-11-21');
do $$ begin
 assert (select status = 'completed' and completed_at is not null and current_step = 7 from public.athlete_intakes);
 assert (select injuries = 'None' and height_cm = 180 from public.athletes where id = '35000000-0000-0000-0000-000000000011');
 assert (select count(*) from public.goals) = 2;
 assert (select title from public.goals where id = '35000000-0000-0000-0000-000000000021') = 'Coach goal';
 assert (select target_value from public.goals where title = 'Strength: squat') = 110;
 assert (select diet_type from public.athlete_food_preferences) = 'none';
 assert (select count(*) from public.benchmark_results) = 0;
 assert (select count(*) from public.body_metrics) = 1;
 raise notice 'PASS: all seven steps complete; goals replace without duplicates; empty injury and nutrition lists save';
end $$;
select set_config('request.jwt.claims','{"sub":"35000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$ declare n integer; begin
 assert (select count(*) from public.athlete_intakes) = 1;
 assert (select count(*) from public.body_metrics where athlete_id = '35000000-0000-0000-0000-000000000011') = 1;
 assert (select weight_kg from public.body_metrics where athlete_id = '35000000-0000-0000-0000-000000000011') = 81;
 update public.athlete_intakes set status = 'requested', requested_at = now(), completed_at = null;
 assert (select answers->>'sports_background' from public.athlete_intakes) = 'Running';
 update public.athlete_intakes set status = 'requested' where athlete_id = '35000000-0000-0000-0000-000000000012';
 get diagnostics n = row_count; assert n = 0;
 raise notice 'PASS: coach X cannot see/update coach Y intake; resend retains answers; weight updates today without duplication';
end $$;
select set_config('request.jwt.claims','{"sub":"35000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
do $$ begin
 assert (select count(*) from public.athlete_intakes) = 1;
 assert (select answers from public.athlete_intakes) = '{}'::jsonb;
 raise notice 'PASS: athlete B sees only own untouched intake';
end $$;
reset role;
update public.athletes set status = 'archived' where id = '35000000-0000-0000-0000-000000000011';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"35000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
do $$ begin
 begin
   perform public.save_athlete_intake_step('35000000-0000-0000-0000-000000000011',7,'{"sleep_hours":1,"stress_level":"high","job_activity":"physical"}','2026-11-21');
   raise exception 'Archived athlete saved intake';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 assert (select answers->>'sleep_hours' from public.athlete_intakes where athlete_id = '35000000-0000-0000-0000-000000000011') = '8';
 raise notice 'PASS: archived athlete RPC rejected without changing intake';
end $$;
rollback;
