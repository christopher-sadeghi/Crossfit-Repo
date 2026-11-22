-- Run against a migrated local database only.
begin;
set local storage.allow_delete_query = 'true';
insert into auth.users (id, email, raw_user_meta_data) values
  ('41000000-0000-0000-0000-000000000001', 'fit41-1@test.local', '{}'),
  ('41000000-0000-0000-0000-000000000002', 'fit41-2@test.local', '{}'),
  ('41000000-0000-0000-0000-000000000003', 'fit41-3@test.local', '{}'),
  ('41000000-0000-0000-0000-000000000004', 'fit41-4@test.local', '{}'),
  ('41000000-0000-0000-0000-000000000005', 'fit41-5@test.local', '{}');
insert into public.athletes (id, coach_id, user_id, first_name, last_name) values
  ('41000000-0000-0000-0000-000000000011', '41000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000003', 'Athlete', 'A'),
  ('41000000-0000-0000-0000-000000000012', '41000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000004', 'Athlete', 'B'),
  ('41000000-0000-0000-0000-000000000013', '41000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000005', 'Athlete', 'C'),
  ('41000000-0000-0000-0000-000000000014', '41000000-0000-0000-0000-000000000001', null, 'No', 'Account');
do $$ begin
  assert (select not public and file_size_limit = 10485760
    and allowed_mime_types = array['image/jpeg','image/png','image/webp']
    from storage.buckets where id = 'progress-photos'), 'private image bucket';
  begin
    insert into public.body_measurements (athlete_id, coach_id, measured_on, site, value_cm) values ('41000000-0000-0000-0000-000000000011', '41000000-0000-0000-0000-000000000002', current_date, 'waist', 80);
    raise exception 'operation unexpectedly allowed';
  exception when foreign_key_violation then null;
  end;

  raise notice 'PASS: private bucket and coach/athlete foreign key';
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

insert into public.body_measurements (coach_id, athlete_id, measured_on, site, value_cm) values
  ('41000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000011', current_date, 'waist', 80),
  ('41000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000012', current_date, 'waist', 90);
insert into public.progress_reminders (coach_id, athlete_id, cadence_weeks, starts_on)
values ('41000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000011', 2, current_date);
insert into public.progress_photos (coach_id, athlete_id, taken_on, pose, storage_path)
values ('41000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000011', current_date, 'front', '41000000-0000-0000-0000-000000000001/41000000-0000-0000-0000-000000000011/a.jpg');
insert into storage.objects (bucket_id, name) values
  ('progress-photos', '41000000-0000-0000-0000-000000000001/41000000-0000-0000-0000-000000000011/a.jpg'),
  ('progress-photos', '41000000-0000-0000-0000-000000000001/41000000-0000-0000-0000-000000000012/b.png');
select public.create_notification('41000000-0000-0000-0000-000000000011', 'progress_check_in', 'Coach reminder', null, '/athlete/progress', 'coach-reminder');
select public.create_notification('41000000-0000-0000-0000-000000000014', 'progress_check_in', 'No account');
do $$ begin
  assert (select count(*) from public.body_measurements) = 2, 'coach reads own athletes';
  begin
    insert into public.body_measurements (coach_id, athlete_id, measured_on, site, value_cm) values ('41000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000011', current_date, 'neck', 0);
    raise exception 'operation unexpectedly allowed';
  exception when check_violation then null;
  end;

  begin
    insert into public.body_measurements (coach_id, athlete_id, measured_on, site, value_cm) values ('41000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000011', current_date, 'bad-site', 80);
    raise exception 'operation unexpectedly allowed';
  exception when check_violation then null;
  end;

  begin
    insert into public.body_measurements (coach_id, athlete_id, measured_on, site, value_cm) values ('41000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000011', current_date, 'waist', 80);
    raise exception 'operation unexpectedly allowed';
  exception when unique_violation then null;
  end;

  begin
    update public.progress_reminders set cadence_weeks = 3;
    raise exception 'operation unexpectedly allowed';
  exception when check_violation then null;
  end;

  begin
    update public.progress_photos set storage_path = '41000000-0000-0000-0000-000000000002/41000000-0000-0000-0000-000000000011/a.jpg';
    raise exception 'operation unexpectedly allowed';
  exception when check_violation then null;
  end;

  begin
    update public.progress_photos set pose = 'other';
    raise exception 'operation unexpectedly allowed';
  exception when check_violation then null;
  end;

  begin
    insert into storage.objects (bucket_id, name) values ('progress-photos', '41000000-0000-0000-0000-000000000001/41000000-0000-0000-0000-000000000013/a.jpg');
    raise exception 'operation unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into storage.objects (bucket_id, name) values ('progress-photos', '41000000-0000-0000-0000-000000000001/41000000-0000-0000-0000-000000000011/a.exe');
    raise exception 'operation unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;

  raise notice 'PASS: coach writes, uniqueness, value/site/pose/path/cadence checks and Storage path rejection';
end $$;
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

do $$ begin
  assert (select count(*) from public.body_measurements) = 0, 'coach isolation measurements';
  assert (select count(*) from public.progress_photos) = 0, 'coach isolation photos';
  assert (select count(*) from public.progress_reminders) = 0, 'coach isolation reminders';
  assert (select count(*) from storage.objects where bucket_id = 'progress-photos') = 0, 'coach isolation files';
  begin
    insert into public.body_measurements (coach_id, athlete_id, measured_on, site, value_cm) values ('41000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000011', current_date, 'neck', 35);
    raise exception 'operation unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.create_notification('41000000-0000-0000-0000-000000000011', 'progress_check_in', 'Stranger');
    raise exception 'stranger notification allowed';
  exception when raise_exception then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
  raise notice 'PASS: coach isolation and stranger notification rejection';
end $$;
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000003","role":"authenticated"}', true);

insert into public.body_measurements (coach_id, athlete_id, measured_on, site, value_cm)
values ('41000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000011', current_date, 'neck', 35);
update public.body_measurements set value_cm = 36 where site = 'neck';
insert into public.progress_photos (coach_id, athlete_id, taken_on, pose, storage_path)
values ('41000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000011', current_date, 'side', '41000000-0000-0000-0000-000000000001/41000000-0000-0000-0000-000000000011/b.webp');
update public.progress_photos set storage_path = '41000000-0000-0000-0000-000000000001/41000000-0000-0000-0000-000000000011/c.webp' where pose = 'side';
insert into storage.objects (bucket_id, name) values ('progress-photos', '41000000-0000-0000-0000-000000000001/41000000-0000-0000-0000-000000000011/c.webp');
select public.create_notification('41000000-0000-0000-0000-000000000011', 'progress_check_in', 'Self reminder', null, '/athlete/progress', 'self-reminder');
select public.create_notification('41000000-0000-0000-0000-000000000011', 'progress_check_in', 'Self reminder again', null, '/athlete/progress', 'self-reminder');
do $$ declare n integer; begin
  assert (select count(*) from public.body_measurements) = 2, 'own measurements';
  assert (select value_cm from public.body_measurements where site = 'neck') = 36, 'own update';
  assert (select count(*) from public.progress_photos) = 2, 'own photos';
  assert (select count(*) from public.progress_reminders) = 1, 'own reminder visible';
  assert (select count(*) from public.notifications where kind = 'progress_check_in') = 2, 'coach and self reminders routed to athlete, deduped';
  assert (select count(*) from storage.objects where bucket_id = 'progress-photos') = 2, 'only own files';
  update public.progress_reminders set cadence_weeks = 4;
  get diagnostics n = row_count;
  assert n = 0, 'athlete cannot update reminders';
  delete from public.progress_reminders;
  get diagnostics n = row_count;
  assert n = 0, 'athlete cannot delete reminders';
  begin
    insert into public.progress_reminders (coach_id, athlete_id, cadence_weeks, starts_on) values ('41000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000012', 2, current_date);
    raise exception 'operation unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.body_measurements (coach_id, athlete_id, measured_on, site, value_cm) values ('41000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000012', current_date, 'neck', 35);
    raise exception 'operation unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into storage.objects (bucket_id, name) values ('progress-photos', '41000000-0000-0000-0000-000000000001/41000000-0000-0000-0000-000000000012/c.jpg');
    raise exception 'operation unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;

  raise notice 'PASS: athlete CRUD, own-only Storage, reminder read-only and notification routing/dedupe';
end $$;
delete from public.body_measurements where site = 'neck';
delete from public.progress_photos where pose = 'side';
delete from storage.objects where bucket_id = 'progress-photos' and name like '%/c.webp';
do $$ begin
  assert (select count(*) from public.body_measurements) = 1, 'athlete measurement delete';
  assert (select count(*) from public.progress_photos) = 1, 'athlete photo delete';
  assert (select count(*) from storage.objects where bucket_id = 'progress-photos') = 1, 'athlete file delete';
end $$;
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

do $$ begin
  assert (select count(*) from public.body_measurements) = 1, 'same coach other athlete only sees self';
  assert (select count(*) from public.progress_photos) = 0, 'other athlete cannot see photos';
  assert (select count(*) from public.progress_reminders) = 0, 'other athlete cannot see reminder';
  assert (select count(*) from storage.objects where bucket_id = 'progress-photos') = 1, 'other athlete only sees own file';
  raise notice 'PASS: same-gym athlete isolation and deletes';
end $$;
reset role;
update public.athletes set status = 'archived' where id = '41000000-0000-0000-0000-000000000011';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000003","role":"authenticated"}', true);

do $$ begin
  assert (select count(*) from public.body_measurements) = 0, 'archived athlete has no access';
  assert (select count(*) from storage.objects where bucket_id = 'progress-photos') = 0, 'archived athlete cannot read photos';
  begin
    perform public.create_notification('41000000-0000-0000-0000-000000000011', 'progress_check_in', 'Archived');
    raise exception 'archived notification allowed';
  exception when raise_exception then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
  raise notice 'PASS: inactive athlete blocked';
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    select * from public.body_measurements;
    raise exception 'operation unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;

  begin
    select * from public.progress_photos;
    raise exception 'operation unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;

  begin
    select * from public.progress_reminders;
    raise exception 'operation unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;

  raise notice 'PASS: anonymous table privileges revoked';
end $$;
rollback;
