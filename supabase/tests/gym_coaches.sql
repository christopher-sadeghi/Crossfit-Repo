begin;

insert into auth.users(id, email, raw_user_meta_data) values
  ('55000000-0000-0000-0000-000000000001', 'gym-owner-a@test.local', '{"full_name":"Owner A"}'),
  ('55000000-0000-0000-0000-000000000002', 'gym-staff-a@test.local', '{"full_name":"Staff A"}'),
  ('55000000-0000-0000-0000-000000000003', 'gym-owner-b@test.local', '{"full_name":"Owner B"}'),
  ('55000000-0000-0000-0000-000000000004', 'gym-athlete-a@test.local', '{}'),
  ('55000000-0000-0000-0000-000000000005', 'gym-athlete-b@test.local', '{}');

update public.coaches
set gym_id = '55000000-0000-0000-0000-000000000001'
where id = '55000000-0000-0000-0000-000000000002';

insert into public.athletes(id, coach_id, assigned_coach_id, user_id, first_name, last_name)
values
  ('55000000-0000-0000-0000-000000000011', '55000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000002', '55000000-0000-0000-0000-000000000004', 'Athlete', 'A'),
  ('55000000-0000-0000-0000-000000000012', '55000000-0000-0000-0000-000000000003', null, '55000000-0000-0000-0000-000000000005', 'Athlete', 'B');

insert into public.messages(id, athlete_id, coach_id, sender_id, body)
values ('55000000-0000-0000-0000-000000000016', '55000000-0000-0000-0000-000000000011',
  '55000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000004', 'Can I change this suggestion?');
insert into public.ai_suggestions(id, athlete_id, coach_id, suggestion_type, status, error, input, requested_by)
values ('55000000-0000-0000-0000-000000000015', '55000000-0000-0000-0000-000000000011',
  '55000000-0000-0000-0000-000000000001', 'write_workout', 'failed', 'in_progress',
  jsonb_build_object('source_message_id', '55000000-0000-0000-0000-000000000016'),
  '55000000-0000-0000-0000-000000000004');

insert into storage.buckets(id, name, public)
values ('movement-demos', 'movement-demos', false)
on conflict (id) do nothing;
insert into storage.objects(bucket_id, name) values
  ('movement-demos', '55000000-0000-0000-0000-000000000001/movement-a/demo.webm'),
  ('movement-demos', '55000000-0000-0000-0000-000000000003/movement-b/demo.webm');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"55000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$ declare program_id uuid; begin
  assert public.current_gym_id() = '55000000-0000-0000-0000-000000000001';
  assert public.is_gym_owner();
  assert (select count(*) = 2 from public.coaches where gym_id = public.current_gym_id());
  insert into public.programs(name) values ('Gym A program') returning id into program_id;
  assert (select coach_id = public.current_gym_id() from public.programs where id = program_id);
  assert (select count(*) = 1 from public.athletes);
  assert not exists (select 1 from public.athletes where id = '55000000-0000-0000-0000-000000000012');
  begin
    update public.coaches set gym_id = '55000000-0000-0000-0000-000000000003' where id = auth.uid();
    raise exception 'owner changed protected gym_id';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.athletes(coach_id, first_name, last_name, experience_level, assigned_coach_id)
    values (public.current_gym_id(), 'Bad', 'Assignment', 'beginner', '55000000-0000-0000-0000-000000000003');
    raise exception 'cross-gym assigned coach accepted';
  exception when raise_exception then
    if sqlerrm <> 'invalid_assigned_coach' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"55000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
do $$ declare token uuid := '55000000-0000-0000-0000-000000000099'; begin
  assert public.current_gym_id() = '55000000-0000-0000-0000-000000000001';
  assert not public.is_gym_owner();
  assert (select count(*) = 2 from public.coaches where gym_id = public.current_gym_id());
  assert (select count(*) = 1 from public.athletes);
  assert (select count(*) = 1 from public.programs);
  assert not exists (select 1 from public.athletes where coach_id = '55000000-0000-0000-0000-000000000003');
  assert (select count(*) = 1 from storage.objects where name like '55000000-0000-0000-0000-000000000001/%');
  assert not has_column_privilege('authenticated', 'public.coaches', 'gym_id', 'update');
  assert not has_table_privilege('authenticated', 'public.coach_invites', 'delete');
  begin
    insert into public.coach_invites(gym_id, email, invited_by, token)
    values (public.current_gym_id(), 'staff-invite@test.local', auth.uid(), token);
    raise exception 'staff created coach invite';
  exception when insufficient_privilege then null;
  end;
  assert not exists (select 1 from public.coach_invites);
  begin
    perform public.remove_gym_coach(auth.uid());
    raise exception 'staff removed a coach';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"55000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
do $$ begin
  begin
    update public.ai_suggestions
    set input = input || jsonb_build_object('changed', true)
    where id = '55000000-0000-0000-0000-000000000015';
    raise exception 'athlete changed assistant suggestion input';
  exception when raise_exception then
    if sqlerrm <> 'assistant_suggestion_identity_is_immutable' then raise; end if;
  end;
  begin
    update public.ai_suggestions
    set suggestion_type = 'adjust_macros'
    where id = '55000000-0000-0000-0000-000000000015';
    raise exception 'athlete changed assistant suggestion type';
  exception when raise_exception then
    if sqlerrm <> 'assistant_suggestion_identity_is_immutable' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"55000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
do $$ declare n integer; begin
  update public.ai_suggestions
  set input = input || jsonb_build_object('staff_updated', true), suggestion_type = 'adjust_macros'
  where id = '55000000-0000-0000-0000-000000000015';
  get diagnostics n = row_count;
  assert n = 1;
end $$;

select set_config('request.jwt.claims', '{"sub":"55000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select public.create_notification('55000000-0000-0000-0000-000000000011', 'message', 'Athlete A alert', null, null, 'gym-coach-alert-a');
reset role;
do $$ begin
  assert exists (select 1 from public.notifications
    where dedupe_key = 'gym-coach-alert-a' and recipient_id = '55000000-0000-0000-0000-000000000002');
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"55000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select public.create_notification('55000000-0000-0000-0000-000000000012', 'message', 'Athlete B alert', null, null, 'gym-coach-alert-b');
reset role;
do $$ begin
  assert exists (select 1 from public.notifications
    where dedupe_key = 'gym-coach-alert-b' and recipient_id = '55000000-0000-0000-0000-000000000003');
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"55000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select public.create_notification('55000000-0000-0000-0000-000000000011', 'coach_message', 'Coach A alert', null, null, 'gym-coach-alert-coach');
reset role;
do $$ begin
  assert exists (select 1 from public.notifications
    where dedupe_key = 'gym-coach-alert-coach' and recipient_id = '55000000-0000-0000-0000-000000000004');
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"55000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
do $$ begin
  assert public.is_gym_owner();
  assert (select count(*) = 1 from public.coaches where gym_id = public.current_gym_id());
  assert not exists (select 1 from public.programs);
  assert not exists (select 1 from storage.objects where name like '55000000-0000-0000-0000-000000000001/%');
end $$;

select set_config('request.jwt.claims', '{"sub":"55000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into public.coach_invites(gym_id, email, invited_by, token)
values ('55000000-0000-0000-0000-000000000001', 'New-Staff@Test.Local', auth.uid(), '55000000-0000-0000-0000-000000000099');
do $$ declare invite record; begin
  select * into strict invite from public.get_coach_invite('55000000-0000-0000-0000-000000000099');
  assert invite.email = 'New-Staff@Test.Local' and invite.usable;
  assert invite.gym_name is null;
end $$;
reset role;

do $$ begin
  begin
    insert into auth.users(id, email, raw_user_meta_data) values
      ('55000000-0000-0000-0000-000000000006', 'wrong-email@test.local',
       '{"role":"coach_invite","invite_token":"55000000-0000-0000-0000-000000000099","full_name":"Wrong Email"}');
    raise exception 'mismatched invite email was accepted';
  exception when raise_exception then
      if sqlerrm <> 'invalid_invite' then raise; end if;
  end;
  begin
    insert into auth.users(id, email, raw_user_meta_data) values
      ('55000000-0000-0000-0000-000000000009', 'invalid-token@test.local',
       '{"role":"coach_invite","invite_token":"55000000-0000-0000-0000-000000000098","full_name":"Invalid Token"}');
    raise exception 'unknown invite token was accepted';
  exception when raise_exception then
    if sqlerrm <> 'invalid_invite' then raise; end if;
  end;
  insert into auth.users(id, email, raw_user_meta_data) values
    ('55000000-0000-0000-0000-000000000007', 'new-staff@test.local',
     '{"role":"coach_invite","invite_token":"55000000-0000-0000-0000-000000000099","full_name":"New Staff"}');
  assert (select gym_id = '55000000-0000-0000-0000-000000000001' from public.coaches where id = '55000000-0000-0000-0000-000000000007');
  assert (select accepted_at is not null from public.coach_invites where token = '55000000-0000-0000-0000-000000000099');
  delete from auth.users where id = '55000000-0000-0000-0000-000000000007';
  begin
  insert into auth.users(id, email, raw_user_meta_data) values
      ('55000000-0000-0000-0000-000000000008', 'new-staff@test.local',
       '{"role":"coach_invite","invite_token":"55000000-0000-0000-0000-000000000099","full_name":"Reuse"}');
    raise exception 'reused invite token was accepted';
  exception when raise_exception then
    if sqlerrm <> 'invalid_invite' then raise; end if;
  end;
  assert not (select usable from public.get_coach_invite('55000000-0000-0000-0000-000000000099'));
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"55000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.remove_gym_coach('55000000-0000-0000-0000-000000000002');
reset role;
do $$ begin
  assert (select gym_id = id from public.coaches where id = '55000000-0000-0000-0000-000000000002');
  assert (select assigned_coach_id is null from public.athletes where id = '55000000-0000-0000-0000-000000000011');
end $$;

rollback;
