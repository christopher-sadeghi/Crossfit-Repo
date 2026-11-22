create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%' and length(endpoint) <= 2000),
  p256dh text not null check (length(p256dh) <= 500),
  auth text not null check (length(auth) <= 500),
  user_agent text check (length(user_agent) <= 500),
  created_at timestamptz default now(),
  last_used_at timestamptz
);
alter table public.push_subscriptions enable row level security;
create policy own_subscriptions on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

create function public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh,
    auth = excluded.auth, user_agent = excluded.user_agent, last_used_at = null;
end;
$$;
revoke all on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;

alter table public.notification_settings add column push_categories text[] not null
  default '{messages,schedule,updates,reminders,alerts}'
  check (push_categories <@ array['messages','schedule','updates','reminders','alerts']::text[]);
alter table public.notifications add column pushed_at timestamptz;
