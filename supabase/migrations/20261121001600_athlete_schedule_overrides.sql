create table public.athlete_workout_overrides (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid(),
  athlete_id uuid not null,
  workout_id uuid not null references public.workouts (id) on delete cascade,
  replacement_workout_id uuid unique references public.workouts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (athlete_id, coach_id) references public.athletes (id, coach_id) on delete cascade,
  unique (athlete_id, workout_id)
);

create index on public.athlete_workout_overrides (coach_id);
create index on public.athlete_workout_overrides (workout_id);
create trigger set_updated_at before update on public.athlete_workout_overrides
  for each row execute function public.set_updated_at();
revoke all on public.athlete_workout_overrides from anon, authenticated;
grant select, insert, update, delete on public.athlete_workout_overrides to authenticated;
grant all on public.athlete_workout_overrides to service_role;
alter table public.athlete_workout_overrides enable row level security;
create policy coach_manage on public.athlete_workout_overrides for all to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid()
    and exists (select 1 from public.workouts w where w.id = workout_id and w.coach_id = auth.uid())
    and (replacement_workout_id is null or exists (
      select 1 from public.workouts w where w.id = replacement_workout_id and w.coach_id = auth.uid()
    )));
create policy athlete_read on public.athlete_workout_overrides for select to authenticated
  using (athlete_id = public.current_athlete_id());

create function public.copy_workout_for_athlete(p_workout_id uuid, p_athlete_id uuid, p_scheduled_on date)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_source public.workouts;
  v_id uuid;
begin
  select * into v_source from public.workouts where id = p_workout_id and coach_id = auth.uid();
  if not found or not exists (select 1 from public.athletes where id = p_athlete_id and coach_id = auth.uid()) then
    raise exception 'Choose a workout and athlete owned by your account.';
  end if;
  if p_scheduled_on is null then raise exception 'Choose a date.'; end if;
  insert into public.workouts (coach_id, athlete_id, scheduled_on, title, workout_type, time_cap_seconds, rounds, description, notes, source_workout_id)
  values (auth.uid(), p_athlete_id, p_scheduled_on, v_source.title, v_source.workout_type, v_source.time_cap_seconds, v_source.rounds, v_source.description, v_source.notes, coalesce(v_source.source_workout_id, v_source.id))
  returning id into v_id;
  insert into public.workout_movements (coach_id, workout_id, movement_id, position, sets, reps, load_kg, distance_m, calories, duration_seconds, notes)
  select coach_id, v_id, movement_id, position, sets, reps, load_kg, distance_m, calories, duration_seconds, notes
  from public.workout_movements where workout_id = p_workout_id;
  return v_id;
end;
$$;

create function public.override_workout_for_athlete(p_workout_id uuid, p_athlete_id uuid, p_mode text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_date date;
  v_old uuid;
  v_id uuid;
begin
  if p_mode is null or p_mode not in ('edit', 'remove') then raise exception 'Choose edit or remove.'; end if;
  perform 1 from public.athletes where id = p_athlete_id and coach_id = auth.uid() for update;
  if not found then raise exception 'Choose an athlete from your roster.'; end if;
  select pa.start_date + (w.week_number - 1) * 7 + (w.day_number - 1) into v_date
  from public.workouts w join public.program_assignments pa on pa.program_id = w.program_id
  where w.id = p_workout_id and pa.athlete_id = p_athlete_id and w.coach_id = auth.uid();
  if v_date is null then raise exception 'This workout is not in an assigned program.'; end if;
  select replacement_workout_id into v_old from public.athlete_workout_overrides
  where athlete_id = p_athlete_id and workout_id = p_workout_id;
  if p_mode = 'edit' then
    if v_old is not null then return v_old; end if;
    v_id := public.copy_workout_for_athlete(p_workout_id, p_athlete_id, v_date);
    insert into public.athlete_workout_scalings (coach_id, workout_id, athlete_id, modifications, details, athlete_suggestion_id, athlete_adjusted_at, coach_modifications, coach_details)
    select coach_id, v_id, athlete_id, modifications, details, athlete_suggestion_id, athlete_adjusted_at, coach_modifications, coach_details
    from public.athlete_workout_scalings where workout_id = p_workout_id and athlete_id = p_athlete_id;
  end if;
  insert into public.athlete_workout_overrides (athlete_id, workout_id, replacement_workout_id)
  values (p_athlete_id, p_workout_id, v_id)
  on conflict (athlete_id, workout_id) do update set replacement_workout_id = excluded.replacement_workout_id, updated_at = now();
  if v_old is not null then
    perform 1 from public.workouts where id = v_old and coach_id = auth.uid() for update;
    if not exists (select 1 from public.workout_results where workout_id = v_old) then
      delete from public.workouts where id = v_old;
    end if;
  end if;
  return v_id;
end;
$$;

create function public.restore_workout_for_athlete(p_workout_id uuid, p_athlete_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_old uuid;
begin
  perform 1 from public.athletes where id = p_athlete_id and coach_id = auth.uid() for update;
  if not found then raise exception 'Choose an athlete from your roster.'; end if;
  select replacement_workout_id into v_old from public.athlete_workout_overrides
  where athlete_id = p_athlete_id and workout_id = p_workout_id;
  perform 1 from public.workouts where id = v_old and coach_id = auth.uid() for update;
  if exists (select 1 from public.workout_results where workout_id = v_old) then
    raise exception 'This athlete already logged their version; delete their result first.';
  end if;
  delete from public.athlete_workout_overrides where athlete_id = p_athlete_id and workout_id = p_workout_id;
  delete from public.workouts where id = v_old;
end;
$$;

create function public.delete_athlete_workout(p_workout_id uuid, p_athlete_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.workouts
  where id = p_workout_id and coach_id = auth.uid()
    and athlete_id = p_athlete_id and program_id is null
  for update;
  if not found then raise exception 'Choose a one-off WOD for this athlete.'; end if;
  if exists (select 1 from public.workout_results where workout_id = p_workout_id) then
    raise exception 'This athlete already logged this WOD; delete their result first.';
  end if;
  delete from public.workouts where id = p_workout_id;
end;
$$;

revoke all on function public.delete_athlete_workout(uuid, uuid) from public, anon;
grant execute on function public.delete_athlete_workout(uuid, uuid) to authenticated;
revoke all on function public.copy_workout_for_athlete(uuid, uuid, date) from public, anon;
revoke all on function public.override_workout_for_athlete(uuid, uuid, text) from public, anon;
revoke all on function public.restore_workout_for_athlete(uuid, uuid) from public, anon;
grant execute on function public.copy_workout_for_athlete(uuid, uuid, date) to authenticated;
grant execute on function public.override_workout_for_athlete(uuid, uuid, text) to authenticated;
grant execute on function public.restore_workout_for_athlete(uuid, uuid) to authenticated;

create or replace function public.athlete_can_view_workout(p_workout_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workouts w where w.id = p_workout_id and (
      w.athlete_id = public.current_athlete_id()
      or (exists (
        select 1 from public.program_assignments pa
        where pa.program_id = w.program_id and pa.athlete_id = public.current_athlete_id()
      ) and not exists (
        select 1 from public.athlete_workout_overrides o
        where o.workout_id = w.id and o.athlete_id = public.current_athlete_id()
      ))
      or exists (
        select 1 from public.workout_results r where r.workout_id = w.id and r.athlete_id = public.current_athlete_id()
      )
    )
  );
$$;
