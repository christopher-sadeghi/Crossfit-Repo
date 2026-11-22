-- Run against a migrated local database only.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('29000000-0000-0000-0000-000000000001', 'fit29-coach-a@test.local', '{}'),
  ('29000000-0000-0000-0000-000000000002', 'fit29-coach-b@test.local', '{}'),
  ('29000000-0000-0000-0000-000000000003', 'fit29-athlete-a@test.local', '{}'),
  ('29000000-0000-0000-0000-000000000004', 'fit29-athlete-b@test.local', '{}');
insert into public.athletes (id, coach_id, user_id, first_name, last_name) values
  ('29000000-0000-0000-0000-000000000011', '29000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000003', 'Athlete', 'A'),
  ('29000000-0000-0000-0000-000000000012', '29000000-0000-0000-0000-000000000002', '29000000-0000-0000-0000-000000000004', 'Athlete', 'B'),
  ('29000000-0000-0000-0000-000000000013', '29000000-0000-0000-0000-000000000001', null, 'No', 'Account');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"29000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
insert into public.messages (athlete_id, coach_id, body) values
  ('29000000-0000-0000-0000-000000000012', '29000000-0000-0000-0000-000000000002', 'Coach B message');
select set_config('request.jwt.claims', '{"sub":"29000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.messages) = 0, 'coach A cannot read coach B thread';
  raise notice 'PASS: coach thread isolation';
end $$;
insert into public.messages (athlete_id, coach_id, body) values
  ('29000000-0000-0000-0000-000000000011', '29000000-0000-0000-0000-000000000001', 'Coach A message');
select public.create_notification('29000000-0000-0000-0000-000000000011', 'coach_message', 'Hello', null, '/athlete/messages', 'test-message');
select public.create_notification('29000000-0000-0000-0000-000000000011', 'coach_message', 'Hello again', null, '/athlete/messages', 'test-message');
select public.create_notification('29000000-0000-0000-0000-000000000013', 'schedule_changed', 'No account');
select public.create_notification('29000000-0000-0000-0000-000000000011', 'missed_workouts', 'Missed WODs');
do $$ begin
  assert (select count(*) from public.notifications) = 1, 'coach only sees self-addressed missed workouts';
  begin
    update public.messages set body = 'forged';
    raise exception 'body update allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.notifications (recipient_id, kind, title) values (auth.uid(), 'message', 'forged');
    raise exception 'direct notification insert allowed';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS: column-only receipts and no direct notification inserts';
end $$;
select set_config('request.jwt.claims', '{"sub":"29000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
do $$ declare n integer; begin
  assert (select count(*) from public.messages) = 1, 'athlete sees own thread only';
  assert (select body from public.messages) = 'Coach A message';
  assert (select count(*) from public.notifications) = 1, 'athlete sees own notification, deduped';
  assert (select recipient_id from public.notifications) = auth.uid(), 'recipient derived from athlete account';
  update public.messages set read_at = now();
  get diagnostics n = row_count;
  assert n = 1, 'recipient can mark read';
  update public.notifications set read_at = now();
  begin
    insert into public.messages (athlete_id, coach_id, body) values
      ('29000000-0000-0000-0000-000000000012', '29000000-0000-0000-0000-000000000002', 'forged');
    raise exception 'cross-thread insert allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_notification('29000000-0000-0000-0000-000000000012', 'message', 'stranger');
    raise exception 'stranger allowed';
  exception when raise_exception then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
  begin
    perform public.create_notification('29000000-0000-0000-0000-000000000011', 'coach_message', 'wrong direction');
    raise exception 'wrong kind allowed';
  exception when raise_exception then
    if sqlerrm <> 'invalid_notification_kind' then raise; end if;
  end;
  raise notice 'PASS: athlete isolation, receipt, dedupe, derived recipient, strangers and wrong kinds rejected';
end $$;
insert into public.messages (athlete_id, coach_id, body) values
  ('29000000-0000-0000-0000-000000000011', '29000000-0000-0000-0000-000000000001', 'Athlete reply');
select public.create_notification('29000000-0000-0000-0000-000000000011', 'result_logged', repeat('x', 180), repeat('y', 2100), '/athletes/29000000-0000-0000-0000-000000000011', 'result-test');
insert into public.notification_settings (email_enabled) values (false);
do $$ declare n integer; begin
  update public.messages set read_at = now() where sender_id = auth.uid();
  get diagnostics n = row_count;
  assert n = 0, 'sender cannot mark own messages read';
  begin
    insert into public.messages (athlete_id, coach_id, body) values
      ('29000000-0000-0000-0000-000000000011', '29000000-0000-0000-0000-000000000001', '');
    raise exception 'empty body allowed';
  exception when check_violation then null;
  end;
  begin
    perform public.create_notification('29000000-0000-0000-0000-000000000011', 'message', 'unsafe', null, '//example.com');
    raise exception 'external link allowed';
  exception when check_violation then null;
  end;
  raise notice 'PASS: sender receipts, empty body and external links rejected';
end $$;
select set_config('request.jwt.claims', '{"sub":"29000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.notifications) = 2, 'athlete result routed to coach';
  assert (select char_length(title) = 160 and char_length(body) = 2000 from public.notifications where dedupe_key = 'result-test'), 'lengths clamped';
  assert (select count(*) from public.notification_settings) = 0, 'settings isolated';
  raise notice 'PASS: coach recipient, clamped lengths, settings isolation and account-less no-op';
end $$;
rollback;
