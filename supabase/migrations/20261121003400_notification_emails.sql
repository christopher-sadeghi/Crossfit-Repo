alter table public.notifications
  add column emailed_at timestamptz;

create index notifications_unemailed_recipient_created_idx
  on public.notifications (recipient_id, created_at)
  where emailed_at is null;
