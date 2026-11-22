create table public.messages (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  coach_id uuid not null references public.coaches (id) on delete cascade,
  sender_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  link_type text check (link_type in ('workout', 'result', 'suggestion')),
  link_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check ((link_type is null) = (link_id is null))
);
create index messages_athlete_created_idx on public.messages (athlete_id, created_at);
create index messages_unread_idx on public.messages (coach_id, athlete_id, sender_id) where read_at is null;
alter table public.messages enable row level security;
create policy "Participants read messages" on public.messages for select to authenticated
  using (coach_id = (select auth.uid()) or athlete_id = (select public.current_athlete_id()));
create policy "Participants send messages" on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and (
    (coach_id = (select auth.uid()) and exists (
      select 1 from public.athletes a where a.id = athlete_id and a.coach_id = auth.uid()
    )) or
    (athlete_id = (select public.current_athlete_id()) and coach_id = (select public.current_athlete_coach_id()))
  ));
create policy "Recipients read receipts" on public.messages for update to authenticated
  using (sender_id <> (select auth.uid()) and
    (coach_id = (select auth.uid()) or athlete_id = (select public.current_athlete_id())))
  with check (sender_id <> (select auth.uid()) and
    (coach_id = (select auth.uid()) or athlete_id = (select public.current_athlete_id())));
revoke all on public.messages from anon, authenticated;
grant select, insert on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;
grant all on public.messages to service_role;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users (id) on delete cascade,
  athlete_id uuid references public.athletes (id) on delete cascade,
  kind text not null check (kind in ('result_logged', 'workout_adjusted', 'low_readiness', 'message', 'missed_workouts', 'coach_message', 'schedule_changed', 'suggestion_approved', 'progress_report')),
  title text not null check (char_length(title) between 1 and 160),
  body text check (char_length(body) <= 2000),
  link text check (char_length(link) <= 1000 and left(link, 1) = '/' and left(link, 2) <> '//'),
  dedupe_key text check (char_length(dedupe_key) <= 200),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_id, dedupe_key)
);
create index notifications_recipient_created_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_id) where read_at is null;
alter table public.notifications enable row level security;
create policy "Read own notifications" on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));
create policy "Mark own notifications read" on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;

create function public.create_notification(
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
    if p_kind not in ('result_logged', 'workout_adjusted', 'low_readiness', 'message') or p_kind is null then
      raise exception 'invalid_notification_kind';
    end if;
    v_recipient := v_athlete.coach_id;
  elsif v_athlete.coach_id = auth.uid() then
    if p_kind = 'missed_workouts' then
      v_recipient := v_athlete.coach_id;
    elsif p_kind in ('coach_message', 'schedule_changed', 'suggestion_approved', 'progress_report') then
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
revoke all on function public.create_notification(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.create_notification(uuid, text, text, text, text, text) to authenticated, service_role;

create table public.notification_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  email_enabled boolean not null default false,
  email_frequency text not null default 'daily' check (email_frequency in ('instant', 'daily')),
  updated_at timestamptz not null default now()
);
create trigger notification_settings_updated_at before update on public.notification_settings
  for each row execute function public.set_updated_at();
alter table public.notification_settings enable row level security;
create policy "Read own notification settings" on public.notification_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Insert own notification settings" on public.notification_settings for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Update own notification settings" on public.notification_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.notification_settings from anon, authenticated;
grant select, insert, update on public.notification_settings to authenticated;
grant all on public.notification_settings to service_role;
