create or replace function public.claim_athlete_invite(p_token uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite_id uuid;
  v_athlete_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'invalid_invite';
  end if;

  if exists (select 1 from public.coaches where id = auth.uid()) then
    raise exception using errcode = 'P0001', message = 'invalid_invite';
  end if;

  if exists (select 1 from public.athletes where user_id = auth.uid()) then
    raise exception using errcode = 'P0001', message = 'invalid_invite';
  end if;

  select i.id, i.athlete_id
  into v_invite_id, v_athlete_id
  from public.athlete_invites i
  join public.athletes a on a.id = i.athlete_id and a.coach_id = i.coach_id
  where i.token = p_token
    and i.accepted_at is null
    and i.revoked_at is null
    and a.user_id is null
    and lower(btrim(i.email)) = lower(btrim(coalesce(
      (select u.email from auth.users u where u.id = auth.uid()),
      ''
    )))
  for update of i, a;

  if not found then
    raise exception using errcode = 'P0001', message = 'invalid_invite';
  end if;

  update public.athletes
  set user_id = auth.uid()
  where id = v_athlete_id and user_id is null;

  if not found then
    raise exception using errcode = 'P0001', message = 'invalid_invite';
  end if;

  update public.athlete_invites
  set accepted_at = now()
  where id = v_invite_id and accepted_at is null and revoked_at is null;

  if not found then
    raise exception using errcode = 'P0001', message = 'invalid_invite';
  end if;
end;
$$;

revoke all on function public.claim_athlete_invite(uuid) from public, anon, authenticated;
grant execute on function public.claim_athlete_invite(uuid) to authenticated;

create or replace function public.prevent_athlete_user_link_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and new.user_id is not null then
      raise exception 'Athlete account links can only be managed by the auth system.';
    end if;

    if tg_op = 'UPDATE'
      and old.user_id is distinct from new.user_id
      and new.user_id is not null then
      raise exception 'Athlete account links can only be managed by the auth system.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_athlete_user_link_changes() from public, anon, authenticated;
