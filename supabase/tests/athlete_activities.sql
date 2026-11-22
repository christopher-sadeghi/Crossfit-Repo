begin;
insert into auth.users(id, email, raw_user_meta_data) values
 ('43000000-0000-0000-0000-000000000001','load-coach-a@test.local','{}'),
 ('43000000-0000-0000-0000-000000000002','load-coach-b@test.local','{}'),
 ('43000000-0000-0000-0000-000000000003','load-athlete-a@test.local','{}');
insert into public.athletes(id, coach_id, user_id, first_name, last_name) values
 ('43000000-0000-0000-0000-000000000011','43000000-0000-0000-0000-000000000001','43000000-0000-0000-0000-000000000003','Own','Athlete'),
 ('43000000-0000-0000-0000-000000000012','43000000-0000-0000-0000-000000000001',null,'Same','Coach'),
 ('43000000-0000-0000-0000-000000000013','43000000-0000-0000-0000-000000000002',null,'Other','Coach');
insert into public.athlete_activities(athlete_id, coach_id, performed_on, activity_type, duration_minutes, rpe, source)
select id, coach_id, '2026-11-21', 'walk', 60, 4, 'manual' from public.athletes where id in (
 '43000000-0000-0000-0000-000000000011','43000000-0000-0000-0000-000000000012','43000000-0000-0000-0000-000000000013'
);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"43000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$ declare n integer; begin
  assert (select count(*) from public.athlete_activities) = 2;
  update public.athlete_activities set rpe = 5 where athlete_id = '43000000-0000-0000-0000-000000000013';
  get diagnostics n = row_count; assert n = 0;
  delete from public.athlete_activities where athlete_id = '43000000-0000-0000-0000-000000000013';
  get diagnostics n = row_count; assert n = 0;
  begin
    insert into public.athlete_activities(athlete_id,coach_id,performed_on,activity_type,duration_minutes,rpe,source)
    values ('43000000-0000-0000-0000-000000000013','43000000-0000-0000-0000-000000000001','2026-11-21','run',30,8,'manual');
    raise exception 'cross-coach insert succeeded';
  exception when foreign_key_violation then null; end;
  insert into public.athlete_activities(athlete_id,coach_id,performed_on,activity_type,duration_minutes,rpe,source)
  values ('43000000-0000-0000-0000-000000000011',auth.uid(),'2026-11-20','run',30,8,'manual');
  update public.athlete_activities set rpe = 6 where performed_on = '2026-11-20';
  get diagnostics n = row_count; assert n = 1;
  delete from public.athlete_activities where performed_on = '2026-11-20';
  get diagnostics n = row_count; assert n = 1;
  update public.coaches set load_warning_ratio = 1.8 where id = auth.uid();
  assert (select load_warning_ratio from public.coaches where id = auth.uid()) = 1.8;
  raise notice 'PASS: coach CRUD, cross-coach isolation, and load threshold';
end $$;

select set_config('request.jwt.claims','{"sub":"43000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
do $$ declare n integer; begin
  assert (select count(*) from public.athlete_activities) = 1;
  begin
    insert into public.athlete_activities(athlete_id,coach_id,performed_on,activity_type,duration_minutes,rpe,source)
    values ('43000000-0000-0000-0000-000000000012','43000000-0000-0000-0000-000000000001','2026-11-21','run',30,8,'manual');
    raise exception 'athlete inserted another athlete activity';
  exception when insufficient_privilege then null; end;
  insert into public.athlete_activities(athlete_id,coach_id,performed_on,activity_type,duration_minutes,rpe,source)
  values ('43000000-0000-0000-0000-000000000011','43000000-0000-0000-0000-000000000001','2026-11-20','run',30,8,'ai');
  update public.athlete_activities set rpe = 7;
  get diagnostics n = row_count; assert n = 2;
  delete from public.athlete_activities;
  get diagnostics n = row_count; assert n = 2;
  perform public.create_notification('43000000-0000-0000-0000-000000000011','high_training_load','Load',null,null,'load-test');
  perform public.create_notification('43000000-0000-0000-0000-000000000011','high_training_load','Load',null,null,'load-test');
  raise notice 'PASS: athlete CRUD on own activities only';
end $$;

reset role;
update public.athletes set status = 'archived' where id = '43000000-0000-0000-0000-000000000011';
insert into public.athlete_activities(athlete_id, coach_id, performed_on, activity_type, duration_minutes, rpe, source)
values ('43000000-0000-0000-0000-000000000011','43000000-0000-0000-0000-000000000001','2026-11-21','walk',60,4,'manual');
set local role authenticated;
do $$ begin
  assert not exists (select 1 from public.athlete_activities);
  assert not exists (select 1 from public.notifications);
  raise notice 'PASS: inactive link cannot read activities; warning is not sent to the athlete';
end $$;
select set_config('request.jwt.claims','{"sub":"43000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$ begin
  assert (select count(*) from public.notifications where kind = 'high_training_load') = 1;
  perform public.create_notification('43000000-0000-0000-0000-000000000011','high_training_load','Load',null,null,'load-test');
  assert (select count(*) from public.notifications where kind = 'high_training_load') = 1;
  assert not has_table_privilege('anon', 'public.athlete_activities', 'select, insert, update, delete, truncate');
  assert not has_table_privilege('authenticated', 'public.athlete_activities', 'truncate, trigger, references');
  raise notice 'PASS: warning is coach-only and deduped; no anon or unsafe table grants';
end $$;
rollback;
