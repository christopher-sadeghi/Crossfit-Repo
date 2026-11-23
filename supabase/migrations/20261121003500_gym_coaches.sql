alter table public.coaches
  add column gym_id uuid references public.coaches(id) on delete cascade;

update public.coaches set gym_id = id;

alter table public.coaches alter column gym_id set not null;

create function public.set_coach_gym_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.gym_id := coalesce(new.gym_id, new.id);
  return new;
end;
$$;

create trigger set_coach_gym_id
before insert on public.coaches
for each row execute function public.set_coach_gym_id();

revoke all on function public.set_coach_gym_id() from public, anon, authenticated;
grant all on public.coaches to service_role;
revoke update on public.coaches from authenticated;
grant update (
  full_name,
  gym_name,
  units,
  created_at,
  updated_at,
  drift_days,
  load_warning_ratio,
  assistant_rules,
  assistant_training,
  assistant_nutrition,
  assistant_recovery,
  athlete_ai_daily_limit
) on public.coaches to authenticated;

create function public.current_gym_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.gym_id from public.coaches c where c.id = auth.uid()
$$;

create function public.is_gym_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.coaches c where c.id = auth.uid() and c.gym_id = c.id
  )
$$;

revoke all on function public.current_gym_id() from public, anon;
revoke all on function public.is_gym_owner() from public, anon;
grant execute on function public.current_gym_id() to authenticated, service_role;
grant execute on function public.is_gym_owner() to authenticated, service_role;

drop policy "Coaches can view their own profile" on public.coaches;
create policy "Coaches can view their own profile" on public.coaches
  for select to authenticated
  using (id = (select auth.uid()) or gym_id = (select public.current_gym_id()));

alter table public.athletes
  add column assigned_coach_id uuid references public.coaches(id) on delete set null;

create index athletes_assigned_coach_id_idx on public.athletes (assigned_coach_id);

create function public.validate_assigned_coach()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.assigned_coach_id is not null and not exists (
    select 1 from public.coaches c
    where c.id = new.assigned_coach_id and c.gym_id = new.coach_id
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_assigned_coach';
  end if;
  return new;
end;
$$;

create trigger validate_assigned_coach
before insert or update of coach_id, assigned_coach_id on public.athletes
for each row execute function public.validate_assigned_coach();

revoke all on function public.validate_assigned_coach() from public, anon, authenticated;

create table public.coach_invites (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null default public.current_gym_id() references public.coaches(id) on delete cascade,
  email text not null,
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid default auth.uid() references public.coaches(id) on delete set null,
  created_at timestamptz default now(),
  accepted_at timestamptz,
  revoked_at timestamptz
);

create unique index coach_invites_active_email_idx
  on public.coach_invites (gym_id, lower(email))
  where accepted_at is null and revoked_at is null;

alter table public.coach_invites enable row level security;
revoke all on public.coach_invites from public, anon, authenticated, service_role;
grant select, insert, update on public.coach_invites to authenticated;
grant all on public.coach_invites to service_role;

create policy "Owners can view coach invites" on public.coach_invites
  for select to authenticated
  using (gym_id = (select public.current_gym_id()) and (select public.is_gym_owner()));

create policy "Owners can create coach invites" on public.coach_invites
  for insert to authenticated
  with check (gym_id = (select public.current_gym_id()) and (select public.is_gym_owner()));

create policy "Owners can update coach invites" on public.coach_invites
  for update to authenticated
  using (gym_id = (select public.current_gym_id()) and (select public.is_gym_owner()))
  with check (gym_id = (select public.current_gym_id()) and (select public.is_gym_owner()));

create function public.get_coach_invite(p_token uuid)
returns table (gym_name text, email text, usable boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select owner.gym_name, invite.email,
    invite.accepted_at is null and invite.revoked_at is null
  from public.coach_invites invite
  join public.coaches owner on owner.id = invite.gym_id and owner.gym_id = owner.id
  where invite.token = p_token
$$;

revoke all on function public.get_coach_invite(uuid) from public;
grant execute on function public.get_coach_invite(uuid) to anon, authenticated, service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid;
  v_invite_id uuid;
  v_gym_id uuid;
  v_athlete_id uuid;
begin
  if new.raw_user_meta_data ->> 'role' = 'coach_invite' then
    begin
      v_token := (new.raw_user_meta_data ->> 'invite_token')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = 'P0001', message = 'invalid_invite';
    end;

    select i.id, i.gym_id
    into v_invite_id, v_gym_id
    from public.coach_invites i
    where i.token = v_token
      and i.accepted_at is null
      and i.revoked_at is null
      and lower(btrim(i.email)) = lower(btrim(coalesce(new.email, '')))
    for update of i;

    if not found then
      raise exception using errcode = 'P0001', message = 'invalid_invite';
    end if;

    insert into public.coaches (id, gym_id, full_name)
    values (new.id, v_gym_id, new.raw_user_meta_data ->> 'full_name');

    update public.coach_invites
    set accepted_at = now()
    where id = v_invite_id and accepted_at is null and revoked_at is null;

    if not found then
      raise exception using errcode = 'P0001', message = 'invalid_invite';
    end if;

    return new;
  elsif new.raw_user_meta_data ->> 'role' = 'athlete' then
    begin
      v_token := (new.raw_user_meta_data ->> 'invite_token')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = 'P0001', message = 'invalid_invite';
    end;

    select i.id, i.athlete_id
    into v_invite_id, v_athlete_id
    from public.athlete_invites i
    join public.athletes a on a.id = i.athlete_id and a.coach_id = i.coach_id
    where i.token = v_token
      and i.accepted_at is null
      and i.revoked_at is null
      and a.user_id is null
      and lower(btrim(i.email)) = lower(btrim(coalesce(new.email, '')))
    for update of i, a;

    if not found then
      raise exception using errcode = 'P0001', message = 'invalid_invite';
    end if;

    update public.athletes
    set user_id = new.id
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

    return new;
  end if;

  insert into public.coaches (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create function public.remove_gym_coach(p_coach_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gym_id uuid := public.current_gym_id();
  v_target_gym_id uuid;
begin
  if not public.is_gym_owner() then
    raise exception using errcode = '42501', message = 'owner_required';
  end if;

  select c.gym_id into v_target_gym_id
  from public.coaches c
  where c.id = p_coach_id
  for update;

  if not found or p_coach_id = v_gym_id or v_target_gym_id <> v_gym_id then
    raise exception using errcode = 'P0001', message = 'invalid_gym_coach';
  end if;

  update public.athletes set assigned_coach_id = null
  where assigned_coach_id = p_coach_id and coach_id = v_gym_id;

  update public.coaches set gym_id = id
  where id = p_coach_id and gym_id = v_gym_id;
end;
$$;

revoke all on function public.remove_gym_coach(uuid) from public, anon;
grant execute on function public.remove_gym_coach(uuid) to authenticated, service_role;

do $$
declare
  c record;
begin
  for c in
    select table_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'coach_id'
      and column_default ~* 'uid\(\)'
      and table_name <> 'ai_chat_messages'
  loop
    execute format(
      'alter table public.%I alter column coach_id set default public.current_gym_id()',
      c.table_name
    );
  end loop;
end;
$$;

do $$
declare
  p record;
  v_qual text;
  v_check text;
  v_roles text;
  v_statement text;
begin
  for p in
    select * from pg_policies
    where (schemaname = 'public' and tablename not in ('ai_chat_messages', 'coaches'))
       or (schemaname = 'storage' and tablename = 'objects')
  loop
    v_qual := p.qual;
    v_check := p.with_check;

    if p.schemaname = 'storage' then
      v_qual := regexp_replace(v_qual, 'auth\.uid\(\)', 'public.current_gym_id()', 'gi');
      v_check := regexp_replace(v_check, 'auth\.uid\(\)', 'public.current_gym_id()', 'gi');
      v_qual := replace(v_qual, 'uid()', 'public.current_gym_id()');
      v_check := replace(v_check, 'uid()', 'public.current_gym_id()');
    else
      if v_qual is not null then
        v_qual := regexp_replace(v_qual,
          '(coach_id[[:space:]]*=[[:space:]]*\([[:space:]]*SELECT[[:space:]]+)(auth\.)?uid\(\)',
          '\1public.current_gym_id()', 'gi');
        v_qual := regexp_replace(v_qual,
          '(coach_id[[:space:]]*=[[:space:]]*)(auth\.)?uid\(\)',
          '\1(SELECT public.current_gym_id())', 'gi');
        v_qual := regexp_replace(v_qual,
          '(\([[:space:]]*SELECT[[:space:]]+)(auth\.)?uid\(\)([[:space:]]+AS[[:space:]]+uid\)[[:space:]]*=[[:space:]]*([[:alnum:]_]+\.)?coach_id)',
          '\1public.current_gym_id()\3', 'gi');
        v_qual := regexp_replace(v_qual,
          '(auth\.)?uid\(\)([[:space:]]*=[[:space:]]*([[:alnum:]_]+\.)?coach_id)',
          '(SELECT public.current_gym_id())\2', 'gi');
      end if;

      if v_check is not null then
        v_check := regexp_replace(v_check,
          '(coach_id[[:space:]]*=[[:space:]]*\([[:space:]]*SELECT[[:space:]]+)(auth\.)?uid\(\)',
          '\1public.current_gym_id()', 'gi');
        v_check := regexp_replace(v_check,
          '(coach_id[[:space:]]*=[[:space:]]*)(auth\.)?uid\(\)',
          '\1(SELECT public.current_gym_id())', 'gi');
        v_check := regexp_replace(v_check,
          '(\([[:space:]]*SELECT[[:space:]]+)(auth\.)?uid\(\)([[:space:]]+AS[[:space:]]+uid\)[[:space:]]*=[[:space:]]*([[:alnum:]_]+\.)?coach_id)',
          '\1public.current_gym_id()\3', 'gi');
        v_check := regexp_replace(v_check,
          '(auth\.)?uid\(\)([[:space:]]*=[[:space:]]*([[:alnum:]_]+\.)?coach_id)',
          '(SELECT public.current_gym_id())\2', 'gi');
      end if;
    end if;

    if v_qual is distinct from p.qual or v_check is distinct from p.with_check then
      select string_agg(
        case when role_name = 'public' then 'PUBLIC' else format('%I', role_name) end,
        ', ' order by ordinal
      )
      into v_roles
      from unnest(p.roles) with ordinality as r(role_name, ordinal);

      execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
      v_statement := format(
        'create policy %I on %I.%I as %s for %s to %s',
        p.policyname, p.schemaname, p.tablename, p.permissive, p.cmd, v_roles
      );
      if v_qual is not null then
        v_statement := v_statement || format(' using (%s)', v_qual);
      end if;
      if v_check is not null then
        v_statement := v_statement || format(' with check (%s)', v_check);
      end if;
      execute v_statement;
    end if;
  end loop;
end;
$$;

drop policy if exists "Coaches manage own rows" on public.benchmarks;
create policy "Coaches read gym benchmarks" on public.benchmarks
  for select to authenticated
  using (coach_id = (select public.current_gym_id()));
create policy "Owners insert gym benchmarks" on public.benchmarks
  for insert to authenticated
  with check (coach_id = (select public.current_gym_id()) and (select public.is_gym_owner()));
create policy "Owners update gym benchmarks" on public.benchmarks
  for update to authenticated
  using (coach_id = (select public.current_gym_id()) and (select public.is_gym_owner()))
  with check (coach_id = (select public.current_gym_id()) and (select public.is_gym_owner()));
create policy "Owners delete gym benchmarks" on public.benchmarks
  for delete to authenticated
  using (coach_id = (select public.current_gym_id()) and (select public.is_gym_owner()));

drop policy if exists "Coaches manage own rows" on public.benchmark_settings;
create policy "Coaches read gym benchmark settings" on public.benchmark_settings
  for select to authenticated
  using (coach_id = (select public.current_gym_id()));
create policy "Owners insert gym benchmark settings" on public.benchmark_settings
  for insert to authenticated
  with check (coach_id = (select public.current_gym_id()) and (select public.is_gym_owner()));
create policy "Owners update gym benchmark settings" on public.benchmark_settings
  for update to authenticated
  using (coach_id = (select public.current_gym_id()) and (select public.is_gym_owner()))
  with check (coach_id = (select public.current_gym_id()) and (select public.is_gym_owner()));
create policy "Owners delete gym benchmark settings" on public.benchmark_settings
  for delete to authenticated
  using (coach_id = (select public.current_gym_id()) and (select public.is_gym_owner()));

do $$
declare
  f record;
  v_definition text;
begin
  for f in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'apply_draft_program',
        'clear_demo_data',
        'copy_program_for_athlete',
        'copy_workout_for_athlete',
        'delete_athlete_workout',
        'load_demo_data',
        'load_demo_data_unscored',
        'lock_athlete_assistant_suggestion',
        'override_workout_for_athlete',
        'restore_workout_for_athlete'
      ])
      and p.prosrc ilike '%auth.uid%'
  loop
    v_definition := replace(pg_get_functiondef(f.oid), 'auth.uid()', 'public.current_gym_id()');
    if f.proname = 'lock_athlete_assistant_suggestion' then
      v_definition := replace(
        v_definition,
        'old.coach_id <> public.current_gym_id()',
        'old.coach_id IS DISTINCT FROM public.current_gym_id()'
      );
    end if;
    if f.proname in ('clear_demo_data', 'load_demo_data', 'load_demo_data_unscored') then
      v_definition := regexp_replace(
        v_definition,
        '(BEGIN[[:space:]]*)',
        E'\\1  IF NOT public.is_gym_owner() THEN RAISE EXCEPTION USING ERRCODE = ''42501'', MESSAGE = ''owner_required''; END IF;\n',
        'i'
      );
    end if;
    execute v_definition;
  end loop;

  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'save_ai_workout';
  v_definition := replace(v_definition, 'auth.uid(),', 'public.current_gym_id(),');
  execute v_definition;

  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_notification';
  v_definition := replace(
    v_definition,
    'else v_athlete.coach_id end;',
    'else coalesce(v_athlete.assigned_coach_id, v_athlete.coach_id) end;'
  );
  v_definition := replace(
    v_definition,
    'elsif v_athlete.coach_id = auth.uid() then',
    'elsif v_athlete.coach_id = public.current_gym_id() then'
  );
  execute v_definition;
end;
$$;
