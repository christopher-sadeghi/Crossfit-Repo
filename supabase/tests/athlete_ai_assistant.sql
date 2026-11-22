begin;
insert into auth.users(id,email,raw_user_meta_data) values
('44000000-0000-0000-0000-000000000001','assistant-1@test.local','{}'),
('44000000-0000-0000-0000-000000000002','assistant-2@test.local','{}'),
('44000000-0000-0000-0000-000000000003','assistant-3@test.local','{}'),
('44000000-0000-0000-0000-000000000004','assistant-4@test.local','{}');
insert into public.athletes(id,coach_id,user_id,first_name,last_name) values
('44000000-0000-0000-0000-000000000011','44000000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000003','A1','Test'),
('44000000-0000-0000-0000-000000000012','44000000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000004','A2','Test');
update public.coaches set assistant_rules = 'Coach A', assistant_nutrition = false, athlete_ai_daily_limit = 17, drift_days = 12 where id = '44000000-0000-0000-0000-000000000001';
update public.coaches set assistant_rules = 'Coach B', drift_days = 9 where id = '44000000-0000-0000-0000-000000000002';
update public.athletes set assistant_rules = 'Override A1' where id = '44000000-0000-0000-0000-000000000011';
insert into public.messages(id,athlete_id,coach_id,sender_id,body) values
('44000000-0000-0000-0000-000000000021','44000000-0000-0000-0000-000000000011','44000000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000003','My request'),
('44000000-0000-0000-0000-000000000022','44000000-0000-0000-0000-000000000012','44000000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000004','Other request'),
('44000000-0000-0000-0000-000000000023','44000000-0000-0000-0000-000000000011','44000000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000001','Coach reply');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"44000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
insert into public.athlete_ai_messages(athlete_id,coach_id,role,content)
values ('44000000-0000-0000-0000-000000000011','44000000-0000-0000-0000-000000000001','user','Help me train');
do $$ declare n integer; s record; v_id uuid; begin
  assert (select count(*) from public.athlete_ai_messages) = 1;
  begin update public.athlete_ai_messages set content = 'hidden'; raise exception 'unauthorized write succeeded'; exception when insufficient_privilege then null; end;
  begin delete from public.athlete_ai_messages; raise exception 'unauthorized write succeeded'; exception when insufficient_privilege then null; end;
  update public.athletes set assistant_rules = 'hacked' where id = '44000000-0000-0000-0000-000000000011';
  get diagnostics n = row_count; assert n = 0;
  select * into strict s from public.athlete_assistant_settings();
  assert s.coach_rules = 'Coach A' and s.athlete_rules = 'Override A1'
    and not s.assistant_nutrition and s.assistant_training and s.assistant_recovery and s.athlete_ai_daily_limit = 17 and s.drift_days = 12;
  begin insert into public.athlete_ai_messages(athlete_id,coach_id,role,content) values ('44000000-0000-0000-0000-000000000012','44000000-0000-0000-0000-000000000001','user','Other'); raise exception 'unauthorized write succeeded'; exception when insufficient_privilege then null; end;
  begin
    insert into public.athlete_ai_messages(athlete_id,coach_id,role,content) values ('44000000-0000-0000-0000-000000000011','44000000-0000-0000-0000-000000000001','user','');
    raise exception 'empty content accepted';
  exception when check_violation then null; end;
  begin insert into public.ai_suggestions(athlete_id,coach_id,suggestion_type,status,error,input) values ('44000000-0000-0000-0000-000000000012','44000000-0000-0000-0000-000000000001','scale_workout','failed','in_progress',jsonb_build_object('source_message_id','44000000-0000-0000-0000-000000000022')); raise exception 'unauthorized write succeeded'; exception when insufficient_privilege then null; end;
  begin insert into public.ai_suggestions(athlete_id,coach_id,suggestion_type,status,error,input) values ('44000000-0000-0000-0000-000000000011','44000000-0000-0000-0000-000000000001','scale_workout','failed','in_progress',jsonb_build_object('source_message_id','44000000-0000-0000-0000-000000000022')); raise exception 'unauthorized write succeeded'; exception when insufficient_privilege then null; end;
  begin insert into public.ai_suggestions(athlete_id,coach_id,suggestion_type,status,error,input) values ('44000000-0000-0000-0000-000000000011','44000000-0000-0000-0000-000000000001','scale_workout','failed','in_progress',jsonb_build_object('source_message_id','44000000-0000-0000-0000-000000000023')); raise exception 'unauthorized write succeeded'; exception when insufficient_privilege then null; end;
  begin insert into public.ai_suggestions(athlete_id,coach_id,suggestion_type,status,error,input) values ('44000000-0000-0000-0000-000000000011','44000000-0000-0000-0000-000000000001','scale_workout','pending','in_progress',jsonb_build_object('source_message_id','44000000-0000-0000-0000-000000000021')); raise exception 'unauthorized write succeeded'; exception when insufficient_privilege then null; end;
  begin insert into public.ai_suggestions(athlete_id,coach_id,suggestion_type,status,error,input) values ('44000000-0000-0000-0000-000000000011','44000000-0000-0000-0000-000000000001','scale_workout','approved','in_progress',jsonb_build_object('source_message_id','44000000-0000-0000-0000-000000000021')); raise exception 'unauthorized write succeeded'; exception when insufficient_privilege then null; end;
  insert into public.ai_suggestions(athlete_id,coach_id,suggestion_type,status,error,input) values ('44000000-0000-0000-0000-000000000011','44000000-0000-0000-0000-000000000001','scale_workout','failed','in_progress',jsonb_build_object('source_message_id','44000000-0000-0000-0000-000000000021')) returning id into v_id;
  begin
    update public.ai_suggestions set suggestion_type = 'suggest_food', status = 'idea' where id = v_id;
    raise exception 'reservation converted to food idea';
  exception when raise_exception then
    if sqlerrm <> 'assistant_suggestion_identity_is_immutable' then raise; end if;
  end;
  begin update public.ai_suggestions set status = 'approved' where id = v_id; raise exception 'unauthorized write succeeded'; exception when insufficient_privilege then null; end;
  update public.ai_suggestions set status = 'pending', error = null, proposal = '{}' where id = v_id;
  get diagnostics n = row_count; assert n = 1;
  update public.ai_suggestions set status = 'failed', error = 'in_progress' where id = v_id;
  get diagnostics n = row_count; assert n = 0;
  update public.ai_suggestions set status = 'approved' where id = v_id;
  get diagnostics n = row_count; assert n = 0;
  insert into public.ai_suggestions(athlete_id,coach_id,suggestion_type,status,error,input) values ('44000000-0000-0000-0000-000000000011','44000000-0000-0000-0000-000000000001','adjust_macros','failed','in_progress',jsonb_build_object('source_message_id','44000000-0000-0000-0000-000000000021')) returning id into v_id;
  update public.ai_suggestions set status = 'failed', error = 'model failed' where id = v_id;
  get diagnostics n = row_count; assert n = 1;
  insert into public.ai_suggestions(athlete_id,coach_id,suggestion_type,status,error,input) values ('44000000-0000-0000-0000-000000000011','44000000-0000-0000-0000-000000000001','write_workout','failed','in_progress',jsonb_build_object('source_message_id','44000000-0000-0000-0000-000000000021')) returning id into v_id;
  update public.ai_suggestions set status = 'pending', error = null where id = v_id;
  get diagnostics n = row_count; assert n = 1;
  perform public.create_notification('44000000-0000-0000-0000-000000000011','assistant_red_flag','Check in',null,null,'assistant-test');
  insert into public.ai_suggestions(athlete_id,coach_id,suggestion_type,status,error,input)
    values ('44000000-0000-0000-0000-000000000011','44000000-0000-0000-0000-000000000001','suggest_food','idea',null,
      '{"source_message_id":"44000000-0000-0000-0000-000000000021"}') returning id into v_id;
  begin
    update public.ai_suggestions set suggestion_type = 'scale_workout', status = 'pending' where id = v_id;
    raise exception 'food idea converted to pending assistant suggestion';
  exception when raise_exception then
    if sqlerrm <> 'assistant_suggestion_identity_is_immutable' then raise; end if;
  end;
  assert not exists(select 1 from public.notifications where kind = 'assistant_red_flag');
  raise notice 'PASS: own immutable chat, settings, reservation-to-pending/failed, invalid inserts and approval blocked';
end $$;
select set_config('request.jwt.claims','{"sub":"44000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
do $$ begin
  assert not exists(select 1 from public.athlete_ai_messages);
  assert not exists(select 1 from public.ai_suggestions);
  assert (select athlete_rules is null and coach_rules = 'Coach A' and drift_days = 12 from public.athlete_assistant_settings());
  raise notice 'PASS: athlete A2 cannot see A1 chat or suggestions; own settings only';
end $$;
select set_config('request.jwt.claims','{"sub":"44000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
do $$ begin
  assert not exists(select 1 from public.athlete_ai_messages);
  assert not exists(select 1 from public.athlete_assistant_settings());
  raise notice 'PASS: coach B cannot see coach A chat or athlete settings';
end $$;
select set_config('request.jwt.claims','{"sub":"44000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$ begin
  assert (select count(*) from public.athlete_ai_messages) = 1;
  assert (select count(*) from public.ai_suggestions where status = 'pending') = 2;
  assert (select count(*) from public.notifications where kind = 'assistant_red_flag') = 1;
  update public.coaches set assistant_rules = 'Updated', assistant_training = false, assistant_recovery = false where id = auth.uid();
  assert (select assistant_rules = 'Updated' and not assistant_training and not assistant_recovery from public.coaches where id = auth.uid());
  update public.athletes set assistant_rules = 'Coach override' where id = '44000000-0000-0000-0000-000000000011';
  assert (select assistant_rules = 'Coach override' from public.athletes where id = '44000000-0000-0000-0000-000000000011');
  assert not has_table_privilege('anon','public.athlete_ai_messages','select,insert,update,delete');
  assert not has_table_privilege('authenticated','public.athlete_ai_messages','update,delete,truncate');
  assert not has_function_privilege('anon','public.athlete_assistant_settings()','execute');
  raise notice 'PASS: coach can read chat/change cards/red flags and update rules; safe grants';
end $$;
reset role;
update public.athletes set status = 'archived' where id = '44000000-0000-0000-0000-000000000011';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"44000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
do $$ begin
  assert not exists(select 1 from public.athlete_assistant_settings());
  assert not exists(select 1 from public.athlete_ai_messages);
  begin insert into public.athlete_ai_messages(athlete_id,coach_id,role,content) values ('44000000-0000-0000-0000-000000000011','44000000-0000-0000-0000-000000000001','user','Archived'); raise exception 'unauthorized write succeeded'; exception when insufficient_privilege then null; end;
  begin insert into public.ai_suggestions(athlete_id,coach_id,suggestion_type,status,error,input) values ('44000000-0000-0000-0000-000000000011','44000000-0000-0000-0000-000000000001','scale_workout','failed','in_progress',jsonb_build_object('source_message_id','44000000-0000-0000-0000-000000000021')); raise exception 'unauthorized write succeeded'; exception when insufficient_privilege then null; end;
  raise notice 'PASS: archived athlete has no settings/chat access or suggestion writes';
end $$;
reset role;
delete from public.athletes where id = '44000000-0000-0000-0000-000000000011';
do $$ begin
  assert not exists(select 1 from public.athlete_ai_messages);
  raise notice 'PASS: athlete deletion cascades assistant chats';
end $$;
rollback;
