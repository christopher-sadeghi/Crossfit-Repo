begin;
insert into auth.users(id, email, raw_user_meta_data) values
 ('32000000-0000-0000-0000-000000000001','benchmark-a@test.local','{}'),
 ('32000000-0000-0000-0000-000000000002','benchmark-b@test.local','{}'),
 ('32000000-0000-0000-0000-000000000003','benchmark-athlete@test.local','{}'),
 ('32000000-0000-0000-0000-000000000004','benchmark-staff@test.local','{}');
update public.coaches set gym_id='32000000-0000-0000-0000-000000000001' where id='32000000-0000-0000-0000-000000000004';
insert into public.athletes(id, coach_id, user_id, first_name, last_name) values
 ('32000000-0000-0000-0000-000000000011','32000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000003','Own','Athlete'),
 ('32000000-0000-0000-0000-000000000012','32000000-0000-0000-0000-000000000001',null,'Other','Athlete'),
 ('32000000-0000-0000-0000-000000000013','32000000-0000-0000-0000-000000000002',null,'B','Athlete');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"32000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
insert into public.benchmarks(id,name,kind,workout_type) values ('32000000-0000-0000-0000-000000000021','A benchmark','custom','for_time');
insert into public.benchmark_settings(benchmark_id,retest_weeks) values ('32000000-0000-0000-0000-000000000021',6);
insert into public.benchmark_results(athlete_id,benchmark_id,performed_on,time_seconds) values
 ('32000000-0000-0000-0000-000000000011','32000000-0000-0000-0000-000000000021','2026-11-21',300),
 ('32000000-0000-0000-0000-000000000012','32000000-0000-0000-0000-000000000021','2026-11-21',400);
do $$ declare n integer; begin
 assert (select count(*) = 1 from public.benchmarks where id = '32000000-0000-0000-0000-000000000021');
 assert (select count(*) = 1 from public.benchmark_settings where benchmark_id = '32000000-0000-0000-0000-000000000021');
 insert into public.benchmarks(id,name,kind,workout_type) values ('32000000-0000-0000-0000-000000000022','Owner temp','custom','other');
 insert into public.benchmark_settings(benchmark_id,retest_weeks) values ('32000000-0000-0000-0000-000000000022',8);
 update public.benchmarks set description = 'owner update' where id = '32000000-0000-0000-0000-000000000022';
 get diagnostics n = row_count; assert n = 1;
 update public.benchmark_settings set retest_weeks = 12 where benchmark_id = '32000000-0000-0000-0000-000000000022';
 get diagnostics n = row_count; assert n = 1;
 delete from public.benchmark_settings where benchmark_id = '32000000-0000-0000-0000-000000000022';
 get diagnostics n = row_count; assert n = 1;
 delete from public.benchmarks where id = '32000000-0000-0000-0000-000000000022';
 get diagnostics n = row_count; assert n = 1;
 raise notice 'PASS: gym owner can read and manage benchmarks and retest settings';
end $$;
select set_config('request.jwt.claims','{"sub":"32000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
do $$ declare n integer; begin
 assert (select count(*) from public.benchmark_results) = 0;
 begin
   insert into public.benchmark_results(coach_id,athlete_id,benchmark_id,performed_on) values ('32000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000011','32000000-0000-0000-0000-000000000021','2026-11-21');
   raise exception 'B inserted A result';
 exception when insufficient_privilege then null; end;
 begin
   insert into public.benchmark_results(athlete_id,benchmark_id,performed_on) values ('32000000-0000-0000-0000-000000000013','32000000-0000-0000-0000-000000000021','2026-11-21');
   raise exception 'B attached own result to A benchmark';
 exception when check_violation then null; end;
 assert (select count(*) from public.benchmarks where coach_id is null) = 38;
 update public.benchmarks set description = 'hacked' where coach_id is null;
 get diagnostics n = row_count; assert n = 0;
 delete from public.benchmarks where coach_id is null;
 get diagnostics n = row_count; assert n = 0;
 begin
   insert into public.benchmarks(coach_id,name,kind,workout_type) values (null,'Hacked','custom','other');
   raise exception 'coach inserted library row';
 exception when insufficient_privilege then null; end;
 raise notice 'PASS: coach isolation, cross-coach reference rejected, library read-only (38 seeds)';
end $$;
select set_config('request.jwt.claims','{"sub":"32000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
do $$ declare n integer; begin
 assert public.current_gym_id() = '32000000-0000-0000-0000-000000000001';
 assert not public.is_gym_owner();
 assert (select count(*) = 1 from public.benchmarks where coach_id = public.current_gym_id());
 assert (select count(*) = 1 from public.benchmark_settings where coach_id = public.current_gym_id());
 assert (select count(*) = 2 from public.benchmark_results);
 begin
   insert into public.benchmarks(name,kind,workout_type) values ('Staff benchmark','custom','other');
   raise exception 'staff inserted a custom benchmark';
 exception when insufficient_privilege then null; end;
 update public.benchmarks set description = 'hacked' where id = '32000000-0000-0000-0000-000000000021';
 get diagnostics n = row_count; assert n = 0;
 delete from public.benchmarks where id = '32000000-0000-0000-0000-000000000021';
 get diagnostics n = row_count; assert n = 0;
 begin
   insert into public.benchmark_settings(benchmark_id,retest_weeks)
   values ('32000000-0000-0000-0000-000000000021',12);
   raise exception 'staff inserted a retest setting';
 exception when insufficient_privilege then null; end;
 update public.benchmark_settings set retest_weeks = 12 where benchmark_id = '32000000-0000-0000-0000-000000000021';
 get diagnostics n = row_count; assert n = 0;
 delete from public.benchmark_settings where benchmark_id = '32000000-0000-0000-0000-000000000021';
 get diagnostics n = row_count; assert n = 0;
 raise notice 'PASS: staff can read but cannot manage benchmark configuration';
end $$;
select set_config('request.jwt.claims','{"sub":"32000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
do $$ declare n integer; begin
 assert (select count(*) from public.benchmark_results) = 1;
 assert (select count(*) from public.benchmark_settings) = 1;
 assert (select count(*) from public.benchmarks) = 39;
 update public.benchmark_results set notes = 'hacked';
 get diagnostics n = row_count; assert n = 0, 'athlete must not update coach-logged result';
 update public.benchmarks set description = 'hacked';
 get diagnostics n = row_count; assert n = 0;
 update public.benchmark_settings set retest_weeks = 1;
 get diagnostics n = row_count; assert n = 0;
 raise notice 'PASS: athlete sees own only, coach benchmarks/settings readable but read-only';
end $$;
insert into public.benchmark_results(id,coach_id,athlete_id,benchmark_id,performed_on) values ('32000000-0000-0000-0000-000000000031','32000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000011','32000000-0000-0000-0000-000000000021','2026-11-22');
do $$ declare n integer; begin
 update public.benchmark_results set time_seconds = 250 where id = '32000000-0000-0000-0000-000000000031';
 get diagnostics n = row_count; assert n = 1;
 begin
   update public.benchmark_results set athlete_id = '32000000-0000-0000-0000-000000000012' where id = '32000000-0000-0000-0000-000000000031';
   raise exception 'athlete reassigned own result';
 exception when insufficient_privilege then null; end;
 delete from public.benchmark_results where id = '32000000-0000-0000-0000-000000000031';
 get diagnostics n = row_count; assert n = 1;
 raise notice 'PASS: athlete insert/update/delete own logged results; reassignment rejected';
end $$;
rollback;
