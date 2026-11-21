create table public.athlete_invites (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches (id) on delete cascade,
  athlete_id uuid not null,
  email text not null,
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  foreign key (athlete_id, coach_id) references public.athletes (id, coach_id) on delete cascade
);

create unique index athlete_invites_one_open_per_athlete
  on public.athlete_invites (athlete_id)
  where accepted_at is null and revoked_at is null;

alter table public.athlete_invites enable row level security;

create policy "Coaches manage invites for their athletes" on public.athlete_invites
  for all to authenticated
  using (coach_id = (select auth.uid()))
  with check (coach_id = (select auth.uid()));

grant select, insert, update, delete on public.athlete_invites to authenticated;
grant select, insert, update, delete on public.athlete_invites to service_role;

create function public.current_athlete_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.id
  from public.athletes a
  where a.user_id = auth.uid()
    and a.status = 'active'
  limit 1;
$$;

create function public.current_athlete_coach_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.coach_id
  from public.athletes a
  where a.user_id = auth.uid()
    and a.status = 'active'
  limit 1;
$$;

revoke all on function public.current_athlete_id() from public, anon, authenticated;
revoke all on function public.current_athlete_coach_id() from public, anon, authenticated;
grant execute on function public.current_athlete_id() to authenticated;
grant execute on function public.current_athlete_coach_id() to authenticated;

create function public.get_invite(p_token uuid)
returns table (
  email text,
  athlete_first_name text,
  coach_full_name text,
  gym_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.email, a.first_name, c.full_name, c.gym_name
  from public.athlete_invites i
  join public.athletes a on a.id = i.athlete_id and a.coach_id = i.coach_id
  join public.coaches c on c.id = i.coach_id
  where i.token = p_token
    and i.accepted_at is null
    and i.revoked_at is null
    and a.user_id is null;
$$;

revoke all on function public.get_invite(uuid) from public, anon, authenticated;
grant execute on function public.get_invite(uuid) to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid;
  v_invite_id uuid;
  v_athlete_id uuid;
begin
  if new.raw_user_meta_data ->> 'role' = 'athlete' then
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

create function public.prevent_athlete_user_link_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
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

create trigger prevent_athlete_user_link_changes
  before insert or update of user_id on public.athletes
  for each row execute function public.prevent_athlete_user_link_changes();

create policy "Athletes can view their own profile" on public.athletes
  for select to authenticated
  using (id = (select public.current_athlete_id()));

create policy "Athletes can view their own assignments" on public.program_assignments
  for select to authenticated
  using (athlete_id = (select public.current_athlete_id()));

create policy "Athletes can view their own results" on public.workout_results
  for select to authenticated
  using (athlete_id = (select public.current_athlete_id()));

create policy "Athletes can view their own workout scalings" on public.athlete_workout_scalings
  for select to authenticated
  using (athlete_id = (select public.current_athlete_id()));

create policy "Athletes can view assigned programs" on public.programs
  for select to authenticated
  using (
    exists (
      select 1
      from public.program_assignments pa
      where pa.program_id = programs.id
        and pa.athlete_id = (select public.current_athlete_id())
    )
  );

create policy "Athletes can view assigned or completed workouts" on public.workouts
  for select to authenticated
  using (
    exists (
      select 1
      from public.program_assignments pa
      where pa.program_id = workouts.program_id
        and pa.athlete_id = (select public.current_athlete_id())
    )
    or exists (
      select 1
      from public.workout_results wr
      where wr.workout_id = workouts.id
        and wr.athlete_id = (select public.current_athlete_id())
    )
  );

create policy "Athletes can view movements for visible workouts" on public.workout_movements
  for select to authenticated
  using (
    exists (
      select 1
      from public.workouts w
      where w.id = workout_movements.workout_id
    )
  );

create policy "Athletes can view their coach's movements" on public.movements
  for select to authenticated
  using (coach_id = (select public.current_athlete_coach_id()));

create policy "Athletes can view their coach" on public.coaches
  for select to authenticated
  using (id = (select public.current_athlete_coach_id()));
