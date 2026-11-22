-- Run against a migrated local database only.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('46000000-0000-0000-0000-000000000001', 'reminder-coach@test.local', '{}'),
 ('46000000-0000-0000-0000-000000000002', 'reminder-a@test.local', '{}'),
 ('46000000-0000-0000-0000-000000000003', 'reminder-b@test.local', '{}');
insert into public.athletes (id, coach_id, user_id, first_name, last_name) values
 ('46000000-0000-0000-0000-000000000011', '46000000-0000-0000-0000-000000000001', '46000000-0000-0000-0000-000000000002', 'Reminder', 'A'),
 ('46000000-0000-0000-0000-000000000012', '46000000-0000-0000-0000-000000000001', '46000000-0000-0000-0000-000000000003', 'Reminder', 'B');
set local role service_role;
insert into public.check_in_reminder_sends (athlete_id, local_date) values
 ('46000000-0000-0000-0000-000000000011', '2026-11-21'),
 ('46000000-0000-0000-0000-000000000012', '2026-11-21');
insert into public.notifications (recipient_id, athlete_id, kind, title)
values ('46000000-0000-0000-0000-000000000002', '46000000-0000-0000-0000-000000000011', 'check_in_reminder', 'Daily check-in');
do $$ begin
  assert exists (select 1 from public.notifications where kind = 'check_in_reminder'), 'reminder kind accepted';
  begin
    insert into public.check_in_reminder_sends (athlete_id, local_date)
    values ('46000000-0000-0000-0000-000000000011', '2026-11-21');
    raise exception 'duplicate send allowed';
  exception when unique_violation then null; end;
  raise notice 'PASS: service_role notification kind and send idempotency';
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"46000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.check_in_reminders) = 0, 'initially no preference';
end $$;
insert into public.check_in_reminders (athlete_id, remind_at, time_zone)
values ('46000000-0000-0000-0000-000000000011', '09:15', 'America/New_York');
insert into public.check_in_skips (athlete_id, skipped_on)
values ('46000000-0000-0000-0000-000000000011', '2026-11-21');
do $$ declare v_time time; begin
  assert (select count(*) from public.check_in_reminders) = 1, 'can read own reminder';
  assert (select remind_at = time '09:15' and time_zone = 'America/New_York' from public.check_in_reminders), 'saved preference';
  update public.check_in_reminders set remind_at = '10:30', time_zone = 'Europe/London', updated_at = '2000-01-01';
  assert (select remind_at = time '10:30' and time_zone = 'Europe/London' and updated_at = now() from public.check_in_reminders), 'update and timestamp trigger';
  update public.check_in_reminders set remind_at = null;
  assert (select remind_at is null from public.check_in_reminders), 'null disables reminder';
  update public.check_in_reminders set remind_at = '23:45';
  foreach v_time in array array[time '09:16', time '09:15:01', time '09:15:00.001', time '24:00'] loop
    begin
      update public.check_in_reminders set remind_at = v_time;
      raise exception 'invalid reminder time allowed: %', v_time;
    exception when check_violation then null; end;
  end loop;
  begin
    update public.check_in_reminders set time_zone = 'Not/A_Zone';
    raise exception 'invalid zone allowed';
  exception when check_violation then null; end;
  begin
    update public.check_in_reminders set time_zone = repeat('a', 101);
    raise exception 'oversized zone allowed';
  exception when check_violation then null; end;
  begin
    update public.check_in_reminders set time_zone = null;
    raise exception 'null zone allowed';
  exception when not_null_violation then null; end;
  assert (select count(*) from public.check_in_skips) = 1, 'can read own skip';
  assert (select count(*) from public.check_in_reminder_sends) = 1, 'can read only own sends';
  begin
    insert into public.check_in_reminder_sends (athlete_id, local_date)
    values ('46000000-0000-0000-0000-000000000011', '2026-11-22');
    raise exception 'athlete send insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.check_in_reminder_sends set sent_at = now();
    raise exception 'athlete send update allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.check_in_reminder_sends;
    raise exception 'athlete send delete allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.check_in_skips set skipped_on = '2026-11-22';
    raise exception 'skip update allowed';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: own reminder CRUD, disabled state, time/zone validation and read-only sends';
end $$;
-- Exercise the same attacks as both another athlete and the owning coach.
do $$ declare v_user uuid; n integer; begin
  foreach v_user in array array['46000000-0000-0000-0000-000000000003'::uuid, '46000000-0000-0000-0000-000000000001'::uuid] loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    assert (select count(*) from public.check_in_reminders) = 0, 'cannot read another reminder';
    assert (select count(*) from public.check_in_skips) = 0, 'cannot read another skip';
    assert not exists (select 1 from public.check_in_reminder_sends where athlete_id = '46000000-0000-0000-0000-000000000011'), 'cannot read another send';
    update public.check_in_reminders set remind_at = '12:00';
    get diagnostics n = row_count; assert n = 0, 'cannot update another reminder';
    delete from public.check_in_reminders;
    get diagnostics n = row_count; assert n = 0, 'cannot delete another reminder';
    delete from public.check_in_skips;
    get diagnostics n = row_count; assert n = 0, 'cannot delete another skip';
    begin
      insert into public.check_in_reminders (athlete_id, remind_at, time_zone)
      values ('46000000-0000-0000-0000-000000000011', '12:00', 'UTC');
      raise exception 'forged reminder allowed';
    exception when insufficient_privilege then null; end;
    begin
      insert into public.check_in_skips (athlete_id, skipped_on)
      values ('46000000-0000-0000-0000-000000000011', '2026-11-22');
      raise exception 'forged skip allowed';
    exception when insufficient_privilege then null; end;
  end loop;
  raise notice 'PASS: other athlete and coach isolation';
end $$;
select set_config('request.jwt.claims', '{"sub":"46000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
do $$ declare n integer; begin
  begin
    update public.check_in_reminders set athlete_id = '46000000-0000-0000-0000-000000000012';
    raise exception 'reminder reassignment allowed';
  exception when insufficient_privilege then null; end;
  delete from public.check_in_skips;
  get diagnostics n = row_count; assert n = 1, 'can delete own skip';
  delete from public.check_in_reminders;
  get diagnostics n = row_count; assert n = 1, 'can delete own reminder';
end $$;
reset role;
update public.athletes set status = 'archived' where id = '46000000-0000-0000-0000-000000000011';
set local role authenticated;
do $$ begin
  assert (select count(*) from public.check_in_reminder_sends) = 0, 'archived athlete cannot read sends';
  begin
    insert into public.check_in_reminders (athlete_id, time_zone)
    values ('46000000-0000-0000-0000-000000000011', 'UTC');
    raise exception 'archived athlete reminder allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.check_in_skips (athlete_id, skipped_on)
    values ('46000000-0000-0000-0000-000000000011', '2026-11-22');
    raise exception 'archived athlete skip allowed';
  exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ declare v_table text; begin
  foreach v_table in array array['check_in_reminders', 'check_in_skips', 'check_in_reminder_sends'] loop
    assert not has_table_privilege('anon', 'public.' || v_table, 'SELECT,INSERT,UPDATE,DELETE'), 'anon has no access';
  end loop;
end $$;
reset role;
do $$ declare v_command text; begin
  assert (select count(*) from cron.job where jobname = 'check-in-reminders' and schedule = '*/15 * * * *' and active) = 1, 'single active quarter-hour cron job';
  select command into strict v_command from cron.job where jobname = 'check-in-reminders';
  -- With unprovisioned local Vault secrets, executing the command must be a no-op.
  assert not exists (select 1 from vault.decrypted_secrets where name in ('check_in_reminder_url', 'cron_secret')), 'test requires unprovisioned local secrets';
  execute v_command;
  raise notice 'PASS: active cron job and missing-secret no-op; archived and anonymous isolation';
end $$;
rollback;
