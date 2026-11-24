begin;

insert into auth.users(id, email, raw_user_meta_data) values
  ('39000000-0000-4000-8000-000000000001', 'account-owner-a@test.local', '{}'),
  ('39000000-0000-4000-8000-000000000002', 'account-staff-a@test.local', '{}'),
  ('39000000-0000-4000-8000-000000000003', 'account-owner-b@test.local', '{}'),
  ('39000000-0000-4000-8000-000000000011', 'account-athlete-a@test.local', '{}'),
  ('39000000-0000-4000-8000-000000000012', 'account-athlete-b@test.local', '{}'),
  ('39000000-0000-4000-8000-000000000013', 'account-athlete-c@test.local', '{}'),
  ('39000000-0000-4000-8000-000000000014', 'account-athlete-archived@test.local', '{}');

update public.coaches set gym_id = '39000000-0000-4000-8000-000000000001'
where id = '39000000-0000-4000-8000-000000000002';

insert into public.athletes(id, coach_id, assigned_coach_id, user_id, first_name, last_name)
values
  ('39000000-0000-4000-8000-000000000021', '39000000-0000-4000-8000-000000000001', '39000000-0000-4000-8000-000000000002', '39000000-0000-4000-8000-000000000011', 'Alex', 'Assigned'),
  ('39000000-0000-4000-8000-000000000022', '39000000-0000-4000-8000-000000000001', null, '39000000-0000-4000-8000-000000000012', 'Blair', 'Owner'),
  ('39000000-0000-4000-8000-000000000023', '39000000-0000-4000-8000-000000000003', null, '39000000-0000-4000-8000-000000000013', 'Casey', 'Other'),
  ('39000000-0000-4000-8000-000000000024', '39000000-0000-4000-8000-000000000001', null, '39000000-0000-4000-8000-000000000014', 'Drew', 'Archived');
update public.athletes set status = 'archived' where id = '39000000-0000-4000-8000-000000000024';

insert into public.athlete_ai_messages(id, athlete_id, coach_id, role, content, metadata)
values
  ('39000000-0000-4000-8000-000000000031', '39000000-0000-4000-8000-000000000021', '39000000-0000-4000-8000-000000000001', 'assistant', 'Account changes', jsonb_build_object('cards', jsonb_build_array(
    jsonb_build_object('kind','account_change','change',jsonb_build_object('kind','injuries','injuries','Shoulder tightness'),'before',jsonb_build_object('injuries',null)),
    jsonb_build_object('kind','account_change','change',jsonb_build_object('kind','body_weight','value',200,'measured_on','2026-11-21'),'before',jsonb_build_object('weight_kg',null))
  ))),
  ('39000000-0000-4000-8000-000000000032', '39000000-0000-4000-8000-000000000022', '39000000-0000-4000-8000-000000000001', 'assistant', 'Account changes', jsonb_build_object('cards', jsonb_build_array(
    jsonb_build_object('kind','account_change','change',jsonb_build_object('kind','macros','calories',2200,'protein_g',160,'carbs_g',220,'fat_g',70),'before',jsonb_build_object('target',null)),
    jsonb_build_object('kind','account_change','change',jsonb_build_object('kind','goal','action','create','title','Run a 5K','goal_type','performance'),'before',jsonb_build_object('active_goal_count',0)),
    jsonb_build_object('kind','account_change','change',jsonb_build_object('kind','injuries','injuries','No current injuries'),'before',jsonb_build_object('injuries',null)),
    jsonb_build_object('kind','account_change','change',jsonb_build_object('kind','goal','action','set_status','goal_id','39000000-0000-4000-8000-000000000066','status','active'),'before',jsonb_build_object('goal',jsonb_build_object('id','39000000-0000-4000-8000-000000000066','title','Reactivate','status','abandoned')))
  ))),
  ('39000000-0000-4000-8000-000000000033', '39000000-0000-4000-8000-000000000023', '39000000-0000-4000-8000-000000000003', 'assistant', 'Other athlete', jsonb_build_object('cards', jsonb_build_array(
    jsonb_build_object('kind','account_change','change',jsonb_build_object('kind','injuries','injuries','Other'),'before',jsonb_build_object())
  ))),
  ('39000000-0000-4000-8000-000000000034', '39000000-0000-4000-8000-000000000024', '39000000-0000-4000-8000-000000000001', 'assistant', 'Archived athlete', jsonb_build_object('cards', jsonb_build_array(
    jsonb_build_object('kind','account_change','change',jsonb_build_object('kind','injuries','injuries','Archived'),'before',jsonb_build_object())
  )));

insert into public.ai_suggestions(id, athlete_id, coach_id, suggestion_type, status, proposal, input)
values ('39000000-0000-4000-8000-000000000041', '39000000-0000-4000-8000-000000000021',
  '39000000-0000-4000-8000-000000000001', 'athlete_account_change', 'pending',
  '{"change":{"kind":"profile","notes":"cross-scope"},"before":{}}', '{}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"39000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
insert into public.ai_suggestions(id, athlete_id, coach_id, suggestion_type, status, proposal, input)
values ('39000000-0000-4000-8000-000000000042', '39000000-0000-4000-8000-000000000021',
  '39000000-0000-4000-8000-000000000001', 'athlete_account_change', 'pending',
  '{"change":{"kind":"profile","notes":"staff-created"},"before":{}}', '{}');
do $$ begin
  assert exists(select 1 from public.ai_suggestions where id = '39000000-0000-4000-8000-000000000042');
  raise notice 'PASS: staff can create an account-change proposal in their coach scope';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"39000000-0000-4000-8000-000000000011","role":"authenticated"}', true);
select public.apply_athlete_account_change(
  '39000000-0000-4000-8000-000000000031', 0,
  '{"kind":"injuries","injuries":"Shoulder tightness"}'
);
select public.apply_athlete_account_change(
  '39000000-0000-4000-8000-000000000031', 1,
  '{"kind":"body_weight","value":200,"measured_on":"2026-11-21"}'
);
do $$ begin
  begin
    perform public.apply_athlete_account_change(
      '39000000-0000-4000-8000-000000000031', 0,
      '{"kind":"injuries","injuries":"Shoulder tightness"}'
    );
    raise exception 'duplicate application succeeded';
  exception when unique_violation then null;
  end;
  begin
    perform public.apply_athlete_account_change(
      '39000000-0000-4000-8000-000000000032', 0,
      '{"kind":"macros","calories":2200,"protein_g":160,"carbs_g":220,"fat_g":70}'
    );
    raise exception 'other athlete message was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.athlete_assistant_applied_cards(message_id, card_index, athlete_id, coach_id)
    values ('39000000-0000-4000-8000-000000000031', 5, '39000000-0000-4000-8000-000000000021', '39000000-0000-4000-8000-000000000001');
    raise exception 'direct applied-card insert succeeded';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) = 2 from public.athlete_assistant_applied_cards);
  raise notice 'PASS: own athlete changes apply once, duplicate and direct writes are denied';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"39000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) = 2 from public.athlete_assistant_applied_cards
    where coach_id = '39000000-0000-4000-8000-000000000001');
  raise notice 'PASS: coach in the athlete scope can read applied account changes';
end $$;
reset role;

do $$ begin
  assert (select injuries = 'Shoulder tightness' from public.athletes where id = '39000000-0000-4000-8000-000000000021');
  assert (select count(*) = 1 from public.body_metrics where athlete_id = '39000000-0000-4000-8000-000000000021');
  assert (select count(*) = 1
    and bool_and(recipient_id = '39000000-0000-4000-8000-000000000002')
    and bool_and(link = '/athletes/39000000-0000-4000-8000-000000000021?tab=overview')
    from public.notifications where athlete_id = '39000000-0000-4000-8000-000000000021' and kind = 'athlete_profile_changed');
  assert not exists(select 1 from public.notifications where athlete_id = '39000000-0000-4000-8000-000000000021' and dedupe_key like '%:1');
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"39000000-0000-4000-8000-000000000012","role":"authenticated"}', true);
select public.apply_athlete_account_change(
  '39000000-0000-4000-8000-000000000032', 0,
  '{"kind":"macros","calories":2200,"protein_g":160,"carbs_g":220,"fat_g":70}'
);
select public.apply_athlete_account_change(
  '39000000-0000-4000-8000-000000000032', 1,
  '{"kind":"goal","action":"create","title":"Run a 5K","goal_type":"performance"}'
);
select public.apply_athlete_account_change(
  '39000000-0000-4000-8000-000000000032', 2,
  '{"kind":"injuries","injuries":"No current injuries"}'
);
reset role;

insert into public.goals(id, coach_id, athlete_id, title, goal_type, status)
values
  ('39000000-0000-4000-8000-000000000061', '39000000-0000-4000-8000-000000000001', '39000000-0000-4000-8000-000000000022', 'Active 2', 'performance', 'active'),
  ('39000000-0000-4000-8000-000000000062', '39000000-0000-4000-8000-000000000001', '39000000-0000-4000-8000-000000000022', 'Active 3', 'performance', 'active'),
  ('39000000-0000-4000-8000-000000000063', '39000000-0000-4000-8000-000000000001', '39000000-0000-4000-8000-000000000022', 'Active 4', 'performance', 'active'),
  ('39000000-0000-4000-8000-000000000064', '39000000-0000-4000-8000-000000000001', '39000000-0000-4000-8000-000000000022', 'Active 5', 'performance', 'active'),
  ('39000000-0000-4000-8000-000000000065', '39000000-0000-4000-8000-000000000001', '39000000-0000-4000-8000-000000000022', 'Active 6', 'performance', 'active'),
  ('39000000-0000-4000-8000-000000000066', '39000000-0000-4000-8000-000000000001', '39000000-0000-4000-8000-000000000022', 'Reactivate', 'performance', 'abandoned');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"39000000-0000-4000-8000-000000000012","role":"authenticated"}', true);
do $$ begin
  begin
    perform public.apply_athlete_account_change(
      '39000000-0000-4000-8000-000000000032', 3,
      '{"kind":"goal","action":"set_status","goal_id":"39000000-0000-4000-8000-000000000066","status":"active"}'
    );
    raise exception 'seventh active goal was accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;

do $$ begin
  assert (select count(*) = 3 and bool_and(recipient_id = '39000000-0000-4000-8000-000000000001')
    from public.notifications where athlete_id = '39000000-0000-4000-8000-000000000022' and kind = 'athlete_profile_changed');
  assert exists(select 1 from public.notifications where athlete_id = '39000000-0000-4000-8000-000000000022' and link like '%?tab=nutrition');
  assert exists(select 1 from public.notifications where athlete_id = '39000000-0000-4000-8000-000000000022' and link like '%?tab=goals');
  assert exists(select 1 from public.notifications where athlete_id = '39000000-0000-4000-8000-000000000022' and link like '%?tab=overview');
  assert (select count(*) = 1 from public.nutrition_targets where athlete_id = '39000000-0000-4000-8000-000000000022' and calories = 2200);
  assert (select count(*) = 1 from public.goals where athlete_id = '39000000-0000-4000-8000-000000000022' and title = 'Run a 5K');
  raise notice 'PASS: macros, goals and injuries notify owner fallback; body weight does not notify';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"39000000-0000-4000-8000-000000000014","role":"authenticated"}', true);
do $$ begin
  begin
    perform public.apply_athlete_account_change(
      '39000000-0000-4000-8000-000000000034', 0,
      '{"kind":"injuries","injuries":"Archived"}'
    );
    raise exception 'archived athlete applied a change';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'PASS: archived athlete cannot apply an account change';
end $$;

select set_config('request.jwt.claims', '{"sub":"39000000-0000-4000-8000-000000000013","role":"authenticated"}', true);
do $$ begin
  begin
    perform public.apply_athlete_account_change(
      '39000000-0000-4000-8000-000000000032', 0,
      '{"kind":"macros","calories":2200,"protein_g":160,"carbs_g":220,"fat_g":70}'
    );
    raise exception 'other athlete applied a change';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"39000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$ declare n integer; begin
  assert not exists(select 1 from public.ai_suggestions where id = '39000000-0000-4000-8000-000000000041');
  update public.ai_suggestions set status = 'approved'
    where id = '39000000-0000-4000-8000-000000000041';
  get diagnostics n = row_count;
  assert n = 0;
  assert not exists(select 1 from public.athlete_assistant_applied_cards where coach_id = '39000000-0000-4000-8000-000000000001');
  raise notice 'PASS: coach in another gym cannot see or approve the account-change suggestion';
end $$;

rollback;
