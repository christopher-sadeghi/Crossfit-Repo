begin;

insert into auth.users(id, email, raw_user_meta_data) values
  ('37000000-0000-4000-8000-000000000001', 'waiver-owner-a@test.local', '{}'),
  ('37000000-0000-4000-8000-000000000002', 'waiver-staff-a@test.local', '{}'),
  ('37000000-0000-4000-8000-000000000003', 'waiver-owner-b@test.local', '{}'),
  ('37000000-0000-4000-8000-000000000004', 'waiver-athlete-a@test.local', '{}'),
  ('37000000-0000-4000-8000-000000000005', 'waiver-athlete-b@test.local', '{}'),
  ('37000000-0000-4000-8000-000000000006', 'waiver-athlete-new@test.local', '{}'),
  ('37000000-0000-4000-8000-000000000007', 'waiver-athlete-fallback@test.local', '{}'),
  ('37000000-0000-4000-8000-000000000008', 'waiver-athlete-archived@test.local', '{}');

update public.coaches set gym_id = '37000000-0000-4000-8000-000000000001'
where id = '37000000-0000-4000-8000-000000000002';

insert into public.athletes(id, coach_id, user_id, first_name, last_name, assigned_coach_id)
values
  ('37000000-0000-4000-8000-000000000011', '37000000-0000-4000-8000-000000000001', '37000000-0000-4000-8000-000000000004', 'Alex', 'Existing', null),
  ('37000000-0000-4000-8000-000000000012', '37000000-0000-4000-8000-000000000003', '37000000-0000-4000-8000-000000000005', 'Blair', 'Other', null),
  ('37000000-0000-4000-8000-000000000014', '37000000-0000-4000-8000-000000000001', '37000000-0000-4000-8000-000000000007', 'Casey', 'Fallback', null),
  ('37000000-0000-4000-8000-000000000015', '37000000-0000-4000-8000-000000000001', '37000000-0000-4000-8000-000000000008', 'Drew', 'Archived', null);
update public.athletes set status = 'archived' where id = '37000000-0000-4000-8000-000000000015';

insert into public.athletes(id, coach_id, first_name, last_name, assigned_coach_id)
values
  ('37000000-0000-4000-8000-000000000013', '37000000-0000-4000-8000-000000000001', 'Emery', 'Assigned', '37000000-0000-4000-8000-000000000002'),
  ('37000000-0000-4000-8000-000000000016', '37000000-0000-4000-8000-000000000001', 'Frankie', 'Unlinked', null);

update public.athletes set user_id = '37000000-0000-4000-8000-000000000006'
where id = '37000000-0000-4000-8000-000000000013';

insert into public.athlete_intakes(athlete_id, coach_id, status, current_step, answers)
values
  ('37000000-0000-4000-8000-000000000011', '37000000-0000-4000-8000-000000000001', 'completed', 7, '{"sleep_hours":8}'),
  ('37000000-0000-4000-8000-000000000014', '37000000-0000-4000-8000-000000000001', 'in_progress', 7, '{}');
update public.athlete_intakes set status = 'in_progress', current_step = 7
where athlete_id = '37000000-0000-4000-8000-000000000013';

do $$ begin
  assert (select waiver_requested_at is null from public.athletes where id = '37000000-0000-4000-8000-000000000011');
  assert (select waiver_requested_at is not null from public.athletes where id = '37000000-0000-4000-8000-000000000013');
  assert (select waiver_requested_at is null from public.athletes where id = '37000000-0000-4000-8000-000000000016');
  assert (select count(*) = 1 from public.athlete_intakes where athlete_id = '37000000-0000-4000-8000-000000000013');
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"37000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$ begin
  begin
    perform public.publish_coach_waiver(repeat('A', 60), false);
    raise exception 'staff published a waiver';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"37000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare
  v_waiver public.coach_waivers;
begin
  v_waiver := public.publish_coach_waiver(repeat('A', 60), false);
  assert v_waiver.version = 1 and not v_waiver.requires_resign;
  perform set_config('test.waiver_a_v1', v_waiver.id::text, true);
  assert (select waiver_requested_at is null from public.athletes where id = '37000000-0000-4000-8000-000000000011');
  assert (select waiver_requested_at is not null from public.athletes where id = '37000000-0000-4000-8000-000000000013');

  v_waiver := public.publish_coach_waiver(repeat('B', 60), false);
  assert v_waiver.version = 2 and not v_waiver.requires_resign;
  assert (select waiver_requested_at is null from public.athletes where id = '37000000-0000-4000-8000-000000000011');

  v_waiver := public.publish_coach_waiver(repeat('C', 60), true);
  assert v_waiver.version = 3 and v_waiver.requires_resign;
  perform set_config('test.waiver_a_latest', v_waiver.id::text, true);
  assert (select waiver_requested_at is not null from public.athletes where id = '37000000-0000-4000-8000-000000000011');
  assert (select waiver_requested_at is not null from public.athletes where id = '37000000-0000-4000-8000-000000000014');
  assert (select waiver_requested_at is null from public.athletes where id = '37000000-0000-4000-8000-000000000015');
  assert (select waiver_requested_at is null from public.athletes where id = '37000000-0000-4000-8000-000000000016');
end $$;

do $$ begin
  begin
    insert into public.coach_waivers(coach_id, version, body)
      values ('37000000-0000-4000-8000-000000000001', 99, repeat('D', 60));
    raise exception 'direct waiver insert was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.athletes set waiver_requested_at = null
      where id = '37000000-0000-4000-8000-000000000011';
    raise exception 'coach changed the waiver request timestamp';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS: owner publishing and request timestamps are server-controlled';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"37000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select (public.publish_coach_waiver(repeat('Other coach waiver. ', 4), false)).version;
select set_config('test.waiver_b_id', (select id::text from public.coach_waivers
  where coach_id = '37000000-0000-4000-8000-000000000003' order by version desc limit 1), true);
do $$ begin
  assert not exists (select 1 from public.coach_waivers where coach_id = '37000000-0000-4000-8000-000000000001');
  assert not exists (select 1 from public.athlete_waiver_signatures where coach_id = '37000000-0000-4000-8000-000000000001');
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"37000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
do $$ begin
  begin
    perform public.sign_coach_waiver(current_setting('test.waiver_b_id')::uuid, 'Alex Existing', 'test agent');
    raise exception 'athlete signed another coach waiver';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.sign_coach_waiver(current_setting('test.waiver_a_v1')::uuid, 'Alex Existing', 'test agent');
    raise exception 'athlete signed an old waiver version';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.athlete_waiver_signatures(athlete_id, coach_id, waiver_id, signed_name)
      values ('37000000-0000-4000-8000-000000000011', '37000000-0000-4000-8000-000000000001',
        current_setting('test.waiver_a_latest')::uuid, 'Alex Existing');
    raise exception 'direct signature insert was allowed';
  exception when insufficient_privilege then null;
  end;
  perform public.sign_coach_waiver(current_setting('test.waiver_a_latest')::uuid, 'Alex Existing', 'test agent');
  assert (select count(*) = 1 from public.athlete_waiver_signatures where athlete_id = '37000000-0000-4000-8000-000000000011');
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"37000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$ begin
  assert not exists (select 1 from public.athlete_waiver_signatures where coach_id = '37000000-0000-4000-8000-000000000001');
  assert not exists (select 1 from public.coach_waivers where id = current_setting('test.waiver_a_latest')::uuid);
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"37000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
do $$
declare
  screening jsonb := '{
    "heart_condition":false,
    "chest_pain_activity":true,
    "chest_pain_rest":false,
    "dizziness_or_fainting":false,
    "bone_joint_problem":false,
    "blood_pressure_or_heart_meds":false,
    "doctor_advised_no_exercise":false,
    "pregnant":"no",
    "recent_surgery":false,
    "surgery_details":"",
    "medications":"",
    "conditions":"",
    "emergency_contact":{"name":"Jordan Emery","phone":"+1 (415) 555-0101","relationship":"Partner"}
  }'::jsonb;
begin
  perform public.save_athlete_intake_step('37000000-0000-4000-8000-000000000013', 7,
    '{"sleep_hours":8,"stress_level":"low","job_activity":"sedentary"}', current_date);
  assert (select current_step = 8 and status = 'in_progress' and completed_at is null
    from public.athlete_intakes where athlete_id = '37000000-0000-4000-8000-000000000013');
  perform public.save_athlete_intake_step('37000000-0000-4000-8000-000000000013', 8,
    jsonb_build_object('health_screening', screening), current_date);
  perform public.save_athlete_intake_step('37000000-0000-4000-8000-000000000013', 8,
    jsonb_build_object('health_screening', screening), current_date);
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"37000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
do $$
declare
  screening jsonb := '{
    "heart_condition":false,
    "chest_pain_activity":false,
    "chest_pain_rest":false,
    "dizziness_or_fainting":false,
    "bone_joint_problem":false,
    "blood_pressure_or_heart_meds":false,
    "doctor_advised_no_exercise":false,
    "pregnant":"yes",
    "recent_surgery":false,
    "surgery_details":"",
    "medications":"",
    "conditions":"",
    "emergency_contact":{"name":"Jordan Casey","phone":"4155550102","relationship":"Partner"}
  }'::jsonb;
begin
  perform public.save_athlete_intake_step('37000000-0000-4000-8000-000000000014', 7,
    '{"sleep_hours":8,"stress_level":"low","job_activity":"sedentary"}', current_date);
  perform public.save_athlete_intake_step('37000000-0000-4000-8000-000000000014', 8,
    jsonb_build_object('health_screening', screening), current_date);
end $$;
reset role;

do $$ begin
  assert (select status = 'completed' and current_step = 8 and answers->'health_flag' = 'true'::jsonb
      and answers->'health_screening'->>'chest_pain_activity' = 'true'
    from public.athlete_intakes where athlete_id = '37000000-0000-4000-8000-000000000013');
  assert (select count(*) = 1 and bool_and(recipient_id = '37000000-0000-4000-8000-000000000002')
      and bool_and(link = '/athletes/37000000-0000-4000-8000-000000000013?tab=intake')
      and bool_and(body like 'Emery Assigned answered yes%')
    from public.notifications where athlete_id = '37000000-0000-4000-8000-000000000013' and kind = 'health_flag');
  assert (select count(*) = 1 and bool_and(recipient_id = '37000000-0000-4000-8000-000000000001')
    from public.notifications where athlete_id = '37000000-0000-4000-8000-000000000014' and kind = 'health_flag');
  assert (select answers = '{"sleep_hours":8}'::jsonb and current_step = 7 and status = 'completed'
    from public.athlete_intakes where athlete_id = '37000000-0000-4000-8000-000000000011');
  raise notice 'PASS: health screening completes step eight and alerts the assigned coach or owner once';
end $$;

rollback;
