begin;
insert into auth.users(id, email, raw_user_meta_data) values
 ('33000000-0000-0000-0000-000000000001','attendance-a@test.local','{}'),
 ('33000000-0000-0000-0000-000000000002','attendance-b@test.local','{}'),
 ('33000000-0000-0000-0000-000000000003','attendance-athlete@test.local','{}');
insert into public.athletes(id, coach_id, user_id, first_name, last_name) values
 ('33000000-0000-0000-0000-000000000011','33000000-0000-0000-0000-000000000001','33000000-0000-0000-0000-000000000003','Own','Athlete'),
 ('33000000-0000-0000-0000-000000000012','33000000-0000-0000-0000-000000000002',null,'Other','Athlete');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"33000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
insert into public.attendance(athlete_id,attended_on,kind) values
 ('33000000-0000-0000-0000-000000000011','2026-11-21','class');
do $$ begin
 assert (select count(*) from public.attendance) = 1;
 update public.coaches set drift_days = 7 where id = auth.uid();
 assert (select drift_days from public.coaches where id = auth.uid()) = 7;
 raise notice 'PASS: coach inserts/selects own attendance and updates drift_days';
end $$;
select set_config('request.jwt.claims','{"sub":"33000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
do $$ declare n integer; begin
 assert (select count(*) from public.attendance) = 0;
 update public.attendance set note = 'hacked';
 get diagnostics n = row_count; assert n = 0;
 delete from public.attendance;
 get diagnostics n = row_count; assert n = 0;
 begin
   insert into public.attendance(coach_id,athlete_id,attended_on,kind) values
    ('33000000-0000-0000-0000-000000000001','33000000-0000-0000-0000-000000000011','2026-11-20','class');
   raise exception 'coach wrote another coach attendance';
 exception when insufficient_privilege then null; end;
 begin
   insert into public.attendance(athlete_id,attended_on,kind) values
    ('33000000-0000-0000-0000-000000000011','2026-11-20','class');
   raise exception 'coach attached attendance to another coach athlete';
 exception when foreign_key_violation then null; end;
 raise notice 'PASS: cross-coach read/write and composite foreign-key isolation';
end $$;
insert into public.attendance(athlete_id,attended_on,kind) values
 ('33000000-0000-0000-0000-000000000012','2026-11-21','open_gym');
select set_config('request.jwt.claims','{"sub":"33000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
do $$ declare n integer; begin
 assert (select count(*) from public.attendance) = 1;
 begin
   insert into public.attendance(coach_id,athlete_id,attended_on,kind) values
    ('33000000-0000-0000-0000-000000000001','33000000-0000-0000-0000-000000000011','2026-11-20','class');
   raise exception 'athlete inserted attendance';
 exception when insufficient_privilege then null; end;
 update public.attendance set note = 'hacked';
 get diagnostics n = row_count; assert n = 0;
 delete from public.attendance;
 get diagnostics n = row_count; assert n = 0;
 raise notice 'PASS: athlete selects own attendance only and cannot insert/update/delete';
end $$;
reset role;
do $$ begin
 assert not exists (
   select 1 from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'attendance'
     and (grantee = 'anon' or (grantee = 'authenticated' and privilege_type in ('TRUNCATE','TRIGGER','REFERENCES')))
 );
 raise notice 'PASS: anon has no grants; authenticated lacks TRUNCATE/TRIGGER/REFERENCES';
end $$;
select grantee, privilege_type from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'attendance' and grantee in ('anon','authenticated')
 order by grantee, privilege_type;
rollback;
