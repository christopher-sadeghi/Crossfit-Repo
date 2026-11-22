-- Run against a migrated local database only. All fixtures roll back.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('31000000-0000-4000-8000-000000000001', 'fit31-coach@test.local', '{}'),
  ('31000000-0000-4000-8000-000000000002', 'fit31-athlete@test.local', '{}'),
  ('31000000-0000-4000-8000-000000000003', 'fit31-other@test.local', '{}');
delete from public.coaches where id in (
  '31000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000003'
);
insert into public.athletes (id, coach_id, user_id, first_name, last_name) values
  ('31000000-0000-4000-8000-000000000011', '31000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000002', 'Athlete', 'A'),
  ('31000000-0000-4000-8000-000000000012', '31000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000003', 'Athlete', 'B');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"31000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into public.ai_suggestions (id, athlete_id, suggestion_type, status, input, proposal) values
  ('31000000-0000-4000-8000-000000000021', '31000000-0000-4000-8000-000000000011', 'weekly_report', 'pending',
    '{"start_on":"2026-11-09","end_on":"2026-11-15","sections":{},"private":"draft metadata"}',
    '{"summary":"Original draft","focus":["A","B"]}'),
  ('31000000-0000-4000-8000-000000000022', '31000000-0000-4000-8000-000000000012', 'weekly_report', 'pending', '{}', '{}'),
  ('31000000-0000-4000-8000-000000000023', '31000000-0000-4000-8000-000000000011', 'weekly_report', 'rejected', '{}', '{}'),
  ('31000000-0000-4000-8000-000000000024', '31000000-0000-4000-8000-000000000011', 'progress_summary', 'pending', '{}', '{}');

select set_config('request.jwt.claims', '{"sub":"31000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$ begin
  assert not exists (select from public.athlete_weekly_reports()), 'pending and rejected reports are invisible';
end $$;

select set_config('request.jwt.claims', '{"sub":"31000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
update public.ai_suggestions set
  status = 'edited', final = '{"summary":"Coach edit","focus":["A","C"],"private":"decision metadata"}', decided_at = now()
where id in ('31000000-0000-4000-8000-000000000021', '31000000-0000-4000-8000-000000000022', '31000000-0000-4000-8000-000000000024');

select set_config('request.jwt.claims', '{"sub":"31000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.athlete_weekly_reports()) = 1, 'only own published weekly reports';
  assert (select content from public.athlete_weekly_reports()) = '{"summary":"Coach edit","focus":["A","C"]}'::jsonb;
  assert (select not (snapshot ? 'private') from public.athlete_weekly_reports()), 'private draft fields stay hidden';
  assert not exists (select from public.ai_suggestions where suggestion_type = 'weekly_report'), 'history stays coach-only';
  raise notice 'PASS: only the athlete’s own approved final and public snapshot are visible';
end $$;

set local role anon;
do $$ begin
  assert not has_function_privilege('public.athlete_weekly_reports()', 'EXECUTE'), 'anonymous callers cannot execute';
end $$;
rollback;
