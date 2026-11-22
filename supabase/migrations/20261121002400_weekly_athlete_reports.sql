alter type public.suggestion_type add value if not exists 'weekly_report';

-- Return only the published report, keeping AI history and draft data coach-only.
create function public.athlete_weekly_reports()
returns table (id uuid, published_at timestamptz, snapshot jsonb, content jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.decided_at,
    jsonb_build_object('start_on', s.input -> 'start_on', 'end_on', s.input -> 'end_on', 'sections', s.input -> 'sections'),
    jsonb_build_object('summary', s.final -> 'summary', 'focus', s.final -> 'focus')
  from public.ai_suggestions s
  where s.athlete_id = (select public.current_athlete_id())
    and s.suggestion_type::text = 'weekly_report'
    and s.status in ('approved', 'edited')
    and s.decided_at is not null
    and s.final is not null
  order by s.decided_at desc, s.id desc;
$$;

revoke all on function public.athlete_weekly_reports() from public, anon, authenticated;
grant execute on function public.athlete_weekly_reports() to authenticated, service_role;
