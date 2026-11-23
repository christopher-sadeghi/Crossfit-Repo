begin;

insert into auth.users(id, email, raw_user_meta_data) values
  ('78000000-0000-0000-0000-000000000001', 'style-owner-a@test.local', '{"full_name":"Owner A"}'),
  ('78000000-0000-0000-0000-000000000002', 'style-staff-a@test.local', '{"full_name":"Staff A"}'),
  ('78000000-0000-0000-0000-000000000003', 'style-owner-b@test.local', '{"full_name":"Owner B"}'),
  ('78000000-0000-0000-0000-000000000004', 'style-athlete-a@test.local', '{}'),
  ('78000000-0000-0000-0000-000000000005', 'style-athlete-b@test.local', '{}');

update public.coaches set gym_id = '78000000-0000-0000-0000-000000000001'
where id = '78000000-0000-0000-0000-000000000002';

insert into public.athletes(id, coach_id, assigned_coach_id, user_id, first_name, last_name) values
  ('78000000-0000-0000-0000-000000000011', '78000000-0000-0000-0000-000000000001',
   '78000000-0000-0000-0000-000000000002', '78000000-0000-0000-0000-000000000004', 'Athlete', 'A'),
  ('78000000-0000-0000-0000-000000000012', '78000000-0000-0000-0000-000000000003',
   null, '78000000-0000-0000-0000-000000000005', 'Athlete', 'B');

insert into public.coach_programming_styles(coach_id, status, answers) values
  ('78000000-0000-0000-0000-000000000001', 'completed', '{"strength_method":"minimal"}'),
  ('78000000-0000-0000-0000-000000000002', 'completed', '{"strength_method":"rpe"}'),
  ('78000000-0000-0000-0000-000000000003', 'completed', '{"strength_method":"linear"}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"78000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$ declare style jsonb; begin
  assert (select count(*) = 2 from public.coach_programming_styles);
  assert not has_table_privilege('authenticated', 'public.coach_programming_styles', 'delete');
  assert public.programming_style_for_athlete('78000000-0000-0000-0000-000000000011') = '{"strength_method":"rpe"}'::jsonb;
  assert public.programming_style_for_athlete('78000000-0000-0000-0000-000000000012') is null;
  begin
    insert into public.coach_programming_styles(coach_id, status) values ('78000000-0000-0000-0000-000000000002', 'completed');
    raise exception 'coach inserted a different coach style';
  exception when insufficient_privilege then null;
  end;
  update public.coach_programming_styles set answers = '{"strength_method":"531"}'
    where coach_id = auth.uid();
  assert (select answers = '{"strength_method":"531"}'::jsonb from public.coach_programming_styles where coach_id = auth.uid());
  update public.coach_programming_styles set answers = '{"strength_method":"bodybuilding"}'
    where coach_id = '78000000-0000-0000-0000-000000000002';
  assert (select answers = '{"strength_method":"rpe"}'::jsonb
    from public.coach_programming_styles where coach_id = '78000000-0000-0000-0000-000000000002');
  raise notice 'PASS: coach reads scope styles, writes only own style, and assigned staff style is returned';
end $$;

select set_config('request.jwt.claims', '{"sub":"78000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) = 1 from public.coach_programming_styles);
  assert public.programming_style_for_athlete('78000000-0000-0000-0000-000000000012') = '{"strength_method":"linear"}'::jsonb;
  assert public.programming_style_for_athlete('78000000-0000-0000-0000-000000000011') is null;
  raise notice 'PASS: owner fallback is used and unrelated athlete style is denied';
end $$;

select set_config('request.jwt.claims', '{"sub":"78000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
do $$ begin
  assert public.programming_style_for_athlete('78000000-0000-0000-0000-000000000011') = '{"strength_method":"rpe"}'::jsonb;
  assert public.programming_style_for_athlete('78000000-0000-0000-0000-000000000012') is null;
  raise notice 'PASS: athlete reads assigned coach style only for own athlete profile';
end $$;

reset role;
rollback;
