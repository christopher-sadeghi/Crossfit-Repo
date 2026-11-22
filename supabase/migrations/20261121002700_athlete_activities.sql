alter table public.coaches add column load_warning_ratio numeric not null default 1.5
  check (load_warning_ratio > 0 and load_warning_ratio < 'Infinity'::numeric);

create table public.athlete_activities (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null,
  coach_id uuid not null references public.coaches (id) on delete cascade,
  performed_on date not null,
  activity_type text not null check (activity_type in ('run','hike','bike','swim','row','sport','walk','other')),
  custom_label text,
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  rpe integer not null check (rpe between 1 and 10),
  distance_m numeric check (distance_m > 0 and distance_m < 'Infinity'::numeric),
  notes text check (char_length(notes) <= 500),
  source text not null check (source in ('manual','ai')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (athlete_id, coach_id) references public.athletes (id, coach_id) on delete cascade
);

create index athlete_activities_athlete_date_idx on public.athlete_activities (athlete_id, performed_on desc);
create index athlete_activities_coach_idx on public.athlete_activities (coach_id);

create trigger set_updated_at before update on public.athlete_activities
  for each row execute function public.set_updated_at();

alter table public.athlete_activities enable row level security;

create policy "Coaches manage their athletes' activities" on public.athlete_activities
  for all to authenticated using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()));

create policy "Athletes manage their own activities" on public.athlete_activities
  for all to authenticated
  using (athlete_id = (select public.current_athlete_id()) and coach_id = (select public.current_athlete_coach_id()))
  with check (athlete_id = (select public.current_athlete_id()) and coach_id = (select public.current_athlete_coach_id()));

create policy "Activity creator must match signed-in user" on public.athlete_activities
  as restrictive for insert to authenticated with check (created_by = (select auth.uid()));

revoke all on public.athlete_activities from anon, authenticated;
grant select, insert, delete on public.athlete_activities to authenticated;
grant update (performed_on, activity_type, custom_label, duration_minutes, rpe, distance_m, notes)
  on public.athlete_activities to authenticated;
grant select, insert, update, delete on public.athlete_activities to service_role;

create table public.ai_activity_draft_requests (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index ai_activity_draft_requests_user_created_idx on public.ai_activity_draft_requests (user_id, created_at);
alter table public.ai_activity_draft_requests enable row level security;
create policy "Read own activity draft requests" on public.ai_activity_draft_requests
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Reserve own activity draft requests" on public.ai_activity_draft_requests
  for insert to authenticated with check (user_id = (select auth.uid()));

revoke all on public.ai_activity_draft_requests from anon, authenticated;
grant select, insert (id) on public.ai_activity_draft_requests to authenticated;
grant select, insert, update, delete on public.ai_activity_draft_requests to service_role;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (
  kind in ('result_logged', 'workout_adjusted', 'low_readiness', 'message', 'missed_workouts',
    'coach_message', 'schedule_changed', 'suggestion_approved', 'progress_report', 'progress_check_in', 'high_training_load')
);

create or replace function public.create_notification(
  p_athlete_id uuid, p_kind text, p_title text, p_body text default null,
  p_link text default null, p_dedupe_key text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_athlete public.athletes%rowtype;
  v_recipient uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_athlete from public.athletes where id = p_athlete_id;
  if not found then raise exception 'athlete_not_found'; end if;
  if v_athlete.user_id = auth.uid() and v_athlete.status = 'active' then
    if p_kind not in ('result_logged', 'workout_adjusted', 'low_readiness', 'message', 'progress_check_in', 'high_training_load') or p_kind is null then
      raise exception 'invalid_notification_kind';
    end if;
    v_recipient := case when p_kind = 'progress_check_in' then v_athlete.user_id else v_athlete.coach_id end;
  elsif v_athlete.coach_id = auth.uid() then
    if p_kind in ('missed_workouts', 'high_training_load') then
      v_recipient := v_athlete.coach_id;
    elsif p_kind in ('coach_message', 'schedule_changed', 'suggestion_approved', 'progress_report', 'progress_check_in') then
      v_recipient := v_athlete.user_id;
    else
      raise exception 'invalid_notification_kind';
    end if;
  else
    raise exception 'not_authorized';
  end if;
  if v_recipient is null then return; end if;
  insert into public.notifications (recipient_id, athlete_id, kind, title, body, link, dedupe_key)
  values (v_recipient, p_athlete_id, p_kind, left(p_title, 160), left(p_body, 2000), left(p_link, 1000), left(p_dedupe_key, 200))
  on conflict (recipient_id, dedupe_key) do nothing;
end;
$$;
