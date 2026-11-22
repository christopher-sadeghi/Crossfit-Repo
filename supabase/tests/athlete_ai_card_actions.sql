begin;
insert into auth.users(id,email,raw_user_meta_data) values
('47000000-0000-4000-8000-000000000001','card-coach-a@test.local','{}'),
('47000000-0000-4000-8000-000000000002','card-coach-b@test.local','{}'),
('47000000-0000-4000-8000-000000000003','card-athlete-a@test.local','{}'),
('47000000-0000-4000-8000-000000000004','card-athlete-b@test.local','{}');
insert into public.athletes(id,coach_id,user_id,first_name,last_name) values
('47000000-0000-4000-8000-000000000011','47000000-0000-4000-8000-000000000001','47000000-0000-4000-8000-000000000003','Card A','Test'),
('47000000-0000-4000-8000-000000000012','47000000-0000-4000-8000-000000000002','47000000-0000-4000-8000-000000000004','Card B','Test');
insert into public.athlete_ai_messages(id,athlete_id,coach_id,role,content,metadata) values
('47000000-0000-4000-8000-000000000021','47000000-0000-4000-8000-000000000011','47000000-0000-4000-8000-000000000001','assistant','Drafts',
'{"cards":[{"kind":"coach_message","body":"Help?"},{"kind":"activity","draft":{}},{"kind":"activity","draft":{}}]}'),
('47000000-0000-4000-8000-000000000022','47000000-0000-4000-8000-000000000012','47000000-0000-4000-8000-000000000002','assistant','Other drafts',
'{"cards":[{"kind":"coach_message","body":"Other"}]}'),
('47000000-0000-4000-8000-000000000023','47000000-0000-4000-8000-000000000011','47000000-0000-4000-8000-000000000001','user','Not an assistant',
'{"cards":[{"kind":"coach_message","body":"Forged"}]}');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"47000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ declare first_ref uuid; replay_ref uuid; done boolean; begin
  select ref_id, already_completed into first_ref, done from public.complete_athlete_ai_card(
    '47000000-0000-4000-8000-000000000021',0,'sent','{"body":"Edited body"}');
  assert not done and first_ref is not null;
  select ref_id, already_completed into replay_ref, done from public.complete_athlete_ai_card(
    '47000000-0000-4000-8000-000000000021',0,'sent','{"body":"Double click"}');
  assert done and replay_ref = first_ref;
  assert (select count(*) from public.messages where athlete_id = '47000000-0000-4000-8000-000000000011') = 1;
  assert (select body from public.messages where id = first_ref) = 'Edited body';
  begin
    insert into public.athlete_ai_card_actions(assistant_message_id,card_index,athlete_id,coach_id,action,ref_id)
      values ('47000000-0000-4000-8000-000000000021',0,'47000000-0000-4000-8000-000000000011','47000000-0000-4000-8000-000000000001','sent',first_ref);
    raise exception 'duplicate action accepted';
  exception when unique_violation then null; end;
  begin
    perform public.complete_athlete_ai_card('47000000-0000-4000-8000-000000000021',1,'saved',
      '{"performed_on":"2026-01-01","activity_type":"run","duration_minutes":0,"rpe":5}');
    raise exception 'invalid activity accepted';
  exception when check_violation then null; end;
  assert not exists(select 1 from public.athlete_ai_card_actions where card_index = 1);
  perform public.complete_athlete_ai_card('47000000-0000-4000-8000-000000000021',1,'saved',
    '{"performed_on":"2026-01-01","activity_type":"run","duration_minutes":30,"rpe":5}');
  select already_completed into done from public.complete_athlete_ai_card('47000000-0000-4000-8000-000000000021',1,'saved',
    '{"performed_on":"2026-01-01","activity_type":"run","duration_minutes":45,"rpe":7}');
  assert done;
  assert (select count(*) from public.athlete_activities) = 1;
  assert (select duration_minutes from public.athlete_activities limit 1) = 30;
  assert (select source from public.athlete_activities limit 1) = 'ai';
  begin update public.athlete_ai_card_actions set action = 'saved'; raise exception 'update allowed'; exception when insufficient_privilege then null; end;
  begin delete from public.athlete_ai_card_actions; raise exception 'delete allowed'; exception when insufficient_privilege then null; end;
  begin
    insert into public.athlete_ai_card_actions(assistant_message_id,card_index,athlete_id,coach_id,action,ref_id)
      values ('47000000-0000-4000-8000-000000000022',0,'47000000-0000-4000-8000-000000000011','47000000-0000-4000-8000-000000000001','sent',first_ref);
    raise exception 'foreign card accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.athlete_ai_card_actions(assistant_message_id,card_index,athlete_id,coach_id,action,ref_id)
      values ('47000000-0000-4000-8000-000000000021',9,'47000000-0000-4000-8000-000000000011','47000000-0000-4000-8000-000000000001','sent',first_ref);
    raise exception 'out of bounds accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.athlete_ai_card_actions(assistant_message_id,card_index,athlete_id,coach_id,action,ref_id)
      values ('47000000-0000-4000-8000-000000000023',0,'47000000-0000-4000-8000-000000000011','47000000-0000-4000-8000-000000000001','sent',first_ref);
    raise exception 'user card accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.complete_athlete_ai_card('47000000-0000-4000-8000-000000000021',2,'sent','{"body":"Wrong kind"}');
    raise exception 'wrong kind accepted';
  exception when raise_exception then if sqlerrm <> 'invalid_assistant_card' then raise; end if; end;
  perform public.create_notification('47000000-0000-4000-8000-000000000011','form_check','Form',null,null,'card-form');
  perform public.create_notification('47000000-0000-4000-8000-000000000011','assistant_red_flag','Safety',null,null,'card-safety');
  raise notice 'PASS: atomic send/save deduplication, failed-save rollback and retry, immutable actions and card validation';
end $$;
select set_config('request.jwt.claims','{"sub":"47000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
  assert (select count(*) from public.athlete_ai_card_actions) = 0;
  begin
    perform public.complete_athlete_ai_card('47000000-0000-4000-8000-000000000021',0,'sent','{"body":"Forged"}');
    raise exception 'other athlete card accepted';
  exception when raise_exception then if sqlerrm <> 'invalid_assistant_card' then raise; end if; end;
  raise notice 'PASS: athlete card action isolation';
end $$;
select set_config('request.jwt.claims','{"sub":"47000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin assert (select count(*) from public.athlete_ai_card_actions) = 0; raise notice 'PASS: unrelated coach cannot read card actions'; end $$;
select set_config('request.jwt.claims','{"sub":"47000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
  assert (select count(*) from public.athlete_ai_card_actions) = 2;
  assert (select count(*) from public.notifications where kind in ('form_check','assistant_red_flag')) = 2;
  perform public.create_notification('47000000-0000-4000-8000-000000000011','form_reviewed','Reviewed',null,null,'card-reviewed');
  raise notice 'PASS: owning coach reads completions and all notification kinds retain routing';
end $$;
reset role;
do $$ begin
  assert exists(select 1 from public.notifications where kind = 'form_reviewed' and recipient_id = '47000000-0000-4000-8000-000000000003');
  delete from public.athletes where id = '47000000-0000-4000-8000-000000000011';
  assert not exists(select 1 from public.athlete_ai_card_actions where athlete_id = '47000000-0000-4000-8000-000000000011');
  raise notice 'PASS: deleting athlete cascades immutable card actions';
end $$;
rollback;
