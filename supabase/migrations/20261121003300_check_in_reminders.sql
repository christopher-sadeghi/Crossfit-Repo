create function public.is_check_in_time_zone(p_zone text)
returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = p_zone);
$$;
revoke all on function public.is_check_in_time_zone(text) from public, anon;
grant execute on function public.is_check_in_time_zone(text) to authenticated, service_role;

create table public.check_in_reminders (
  athlete_id uuid primary key references public.athletes(id) on delete cascade,
  remind_at time check (extract(minute from remind_at)::integer % 15 = 0 and extract(second from remind_at) = 0 and remind_at < time '24:00'),
  time_zone text not null check (length(time_zone) between 1 and 100 and public.is_check_in_time_zone(time_zone)),
  updated_at timestamptz not null default now()
);
create trigger check_in_reminders_updated_at before update on public.check_in_reminders
  for each row execute function public.set_updated_at();
alter table public.check_in_reminders enable row level security;
create policy own_reminders on public.check_in_reminders for all to authenticated
  using (athlete_id = (select public.current_athlete_id()))
  with check (athlete_id = (select public.current_athlete_id()));
revoke all on public.check_in_reminders from anon, authenticated;
grant select, insert, update, delete on public.check_in_reminders to authenticated;
grant all on public.check_in_reminders to service_role;

create table public.check_in_skips (
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  skipped_on date not null,
  created_at timestamptz not null default now(),
  primary key (athlete_id, skipped_on)
);
alter table public.check_in_skips enable row level security;
create policy own_skips_select on public.check_in_skips for select to authenticated
  using (athlete_id = (select public.current_athlete_id()));
create policy own_skips_insert on public.check_in_skips for insert to authenticated
  with check (athlete_id = (select public.current_athlete_id()));
create policy own_skips_delete on public.check_in_skips for delete to authenticated
  using (athlete_id = (select public.current_athlete_id()));
revoke all on public.check_in_skips from anon, authenticated;
grant select, insert, delete on public.check_in_skips to authenticated;
grant all on public.check_in_skips to service_role;

create table public.check_in_reminder_sends (
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  local_date date not null,
  sent_at timestamptz not null default now(),
  primary key (athlete_id, local_date)
);
alter table public.check_in_reminder_sends enable row level security;
create policy own_reminder_sends on public.check_in_reminder_sends for select to authenticated
  using (athlete_id = (select public.current_athlete_id()));
revoke all on public.check_in_reminder_sends from anon, authenticated;
grant select on public.check_in_reminder_sends to authenticated;
grant all on public.check_in_reminder_sends to service_role;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (
  kind in ('result_logged', 'workout_adjusted', 'low_readiness', 'message', 'missed_workouts', 'coach_message', 'schedule_changed', 'suggestion_approved', 'progress_report', 'progress_check_in', 'high_training_load', 'form_check', 'assistant_red_flag', 'form_reviewed', 'check_in_reminder')
);

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule('check-in-reminders', '*/15 * * * *', $cron$
  select net.http_post(
    url := reminder.decrypted_secret,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret.decrypted_secret),
    body := '{}'::jsonb
  )
  from vault.decrypted_secrets reminder
  cross join vault.decrypted_secrets secret
  where reminder.name = 'check_in_reminder_url' and secret.name = 'cron_secret'
    and nullif(reminder.decrypted_secret, '') is not null
    and nullif(secret.decrypted_secret, '') is not null;
$cron$);
