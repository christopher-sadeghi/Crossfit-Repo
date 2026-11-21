-- FIT-26: AI coach programming assistant (chat).

create table public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 8000),
  suggestion_ids uuid[] not null default '{}',
  context jsonb,
  created_at timestamptz not null default now()
);

create index ai_chat_messages_coach_id_created_at_idx on public.ai_chat_messages (coach_id, created_at);

alter table public.ai_chat_messages enable row level security;
create policy "Coaches manage their own rows" on public.ai_chat_messages
  for all to authenticated
  using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()));

grant select, insert, delete on public.ai_chat_messages to authenticated;
grant all on public.ai_chat_messages to service_role;

-- AI-written WODs can be saved as a one-off for one athlete on a date (individual programming).
drop function if exists public.save_ai_workout(uuid, jsonb, jsonb, timestamptz);

create function public.save_ai_workout(
  p_workout_id uuid,
  p_workout jsonb,
  p_movements jsonb,
  p_expected_updated_at timestamptz default null,
  p_athlete_id uuid default null,
  p_scheduled_on date default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workout_id uuid;
  v_movement jsonb;
  v_position integer := 0;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;

  if p_workout_id is null then
    insert into public.workouts (
      coach_id,
      program_id,
      title,
      workout_type,
      time_cap_seconds,
      rounds,
      description,
      notes,
      athlete_id,
      scheduled_on
    )
    values (
      auth.uid(),
      null,
      p_workout->>'title',
      (p_workout->>'workout_type')::public.workout_type,
      nullif(p_workout->>'time_cap_seconds', '')::integer,
      nullif(p_workout->>'rounds', '')::integer,
      p_workout->>'description',
      p_workout->>'notes',
      p_athlete_id,
      case when p_athlete_id is null then null else p_scheduled_on end
    )
    returning id into v_workout_id;
  else
    update public.workouts
    set
      title = p_workout->>'title',
      workout_type = (p_workout->>'workout_type')::public.workout_type,
      time_cap_seconds = nullif(p_workout->>'time_cap_seconds', '')::integer,
      rounds = nullif(p_workout->>'rounds', '')::integer,
      description = p_workout->>'description',
      notes = p_workout->>'notes',
      updated_at = now()
    where id = p_workout_id
      and (p_expected_updated_at is null or updated_at <= p_expected_updated_at)
    returning id into v_workout_id;

    if v_workout_id is null then
      if exists (select 1 from public.workouts where id = p_workout_id) then
        raise exception using errcode = 'P0001', message = 'workout_changed';
      else
        raise exception using errcode = 'P0001', message = 'workout_not_found';
      end if;
    end if;

    delete from public.workout_movements
    where workout_id = v_workout_id;
  end if;

  for v_movement in
    select value from jsonb_array_elements(p_movements)
  loop
    v_position := v_position + 1;
    insert into public.workout_movements (
      workout_id,
      coach_id,
      movement_id,
      position,
      sets,
      reps,
      load_kg,
      distance_m,
      calories,
      duration_seconds,
      notes
    )
    values (
      v_workout_id,
      auth.uid(),
      (v_movement->>'movement_id')::uuid,
      v_position,
      nullif(v_movement->>'sets', '')::integer,
      nullif(v_movement->>'reps', '')::integer,
      nullif(v_movement->>'load_kg', '')::numeric,
      nullif(v_movement->>'distance_m', '')::numeric,
      nullif(v_movement->>'calories', '')::integer,
      nullif(v_movement->>'duration_seconds', '')::integer,
      v_movement->>'notes'
    );
  end loop;

  return v_workout_id;
end;
$$;

revoke all on function public.save_ai_workout(uuid, jsonb, jsonb, timestamptz, uuid, date) from public, anon;
grant execute on function public.save_ai_workout(uuid, jsonb, jsonb, timestamptz, uuid, date) to authenticated;
