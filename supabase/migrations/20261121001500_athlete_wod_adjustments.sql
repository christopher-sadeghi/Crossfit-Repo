-- FIT-22: an athlete can ask the AI to make today's WOD easier or safer.
-- The change applies right away (the one exception to coach approval), is saved
-- only for that athlete, is logged in ai_suggestions, and the coach reviews it later.

alter type public.suggestion_type add value if not exists 'athlete_adjust_workout';

alter table public.ai_suggestions
  add column coach_reviewed_at timestamptz;

create index ai_suggestions_athlete_adjust_review_idx
  on public.ai_suggestions (coach_id, created_at desc)
  where coach_reviewed_at is null;

-- athlete_adjusted_at marks a scaling the athlete changed. coach_modifications /
-- coach_details keep the coach earlier scaling (if any) so the coach can undo.
alter table public.athlete_workout_scalings
  add column athlete_suggestion_id uuid references public.ai_suggestions (id) on delete set null,
  add column athlete_adjusted_at timestamptz,
  add column coach_modifications text,
  add column coach_details jsonb;

-- Reserve a logged AI request for the signed-in athlete (max 5 a day).
create function public.start_athlete_workout_adjustment(
  p_workout_id uuid,
  p_input jsonb,
  p_model text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_athlete_id uuid := public.current_athlete_id();
  v_coach_id uuid := public.current_athlete_coach_id();
  v_id uuid;
begin
  if v_athlete_id is null or v_coach_id is null then
    raise exception using errcode = 'P0001', message = 'not_athlete';
  end if;
  if not public.athlete_can_view_workout(p_workout_id) then
    raise exception using errcode = 'P0001', message = 'workout_not_found';
  end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' or octet_length(p_input::text) > 200000 then
    raise exception using errcode = 'P0001', message = 'invalid_input';
  end if;

  -- Serialize requests per athlete so the daily cap cannot be raced.
  perform 1 from public.athletes where id = v_athlete_id for update;
  if (
    select count(*) from public.ai_suggestions s
    where s.athlete_id = v_athlete_id
      and s.suggestion_type = 'athlete_adjust_workout'
      and s.created_at > now() - interval '1 day'
  ) >= 5 then
    raise exception using errcode = 'P0001', message = 'daily_limit';
  end if;

  insert into public.ai_suggestions (coach_id, athlete_id, suggestion_type, status, error, input, model)
  values (
    v_coach_id,
    v_athlete_id,
    'athlete_adjust_workout',
    'failed',
    'in_progress',
    p_input || jsonb_build_object('workout_id', p_workout_id),
    left(p_model, 100)
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Record why an athlete request did not apply (AI error or a "harder" proposal).
create function public.fail_athlete_workout_adjustment(
  p_suggestion_id uuid,
  p_error text,
  p_proposal jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ai_suggestions
  set error = left(coalesce(nullif(p_error, ''), 'failed'), 500),
      proposal = case when octet_length(coalesce(p_proposal, '{}'::jsonb)::text) <= 200000 then p_proposal end
  where id = p_suggestion_id
    and athlete_id = public.current_athlete_id()
    and suggestion_type = 'athlete_adjust_workout'
    and status = 'failed'
    and error = 'in_progress';
end;
$$;

-- Apply an athlete AI adjustment. Re-checks in the database that nothing is
-- harder than what the athlete was given (the coach scaling if any, else the WOD).
create function public.apply_athlete_workout_adjustment(
  p_suggestion_id uuid,
  p_proposal jsonb,
  p_modifications text,
  p_details jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_athlete_id uuid := public.current_athlete_id();
  v_suggestion public.ai_suggestions;
  v_workout public.workouts;
  v_existing public.athlete_workout_scalings;
  v_base_details jsonb;
  v_base_modifications text;
  v_has_base boolean := false;
  v_base_movements jsonb;
  v_new_movements jsonb;
  v_original jsonb;
  v_base jsonb;
  v_new jsonb;
  v_field text;
  v_base_rounds numeric;
  v_new_rounds numeric;
  v_base_cap numeric;
  v_new_cap numeric;
  v_details jsonb;
  v_scaling_id uuid;
  v_count integer;
  v_tolerance numeric;
begin
  if v_athlete_id is null then
    raise exception using errcode = 'P0001', message = 'not_athlete';
  end if;

  select * into v_suggestion
  from public.ai_suggestions s
  where s.id = p_suggestion_id
    and s.athlete_id = v_athlete_id
    and s.suggestion_type = 'athlete_adjust_workout'
    and s.status = 'failed'
    and s.error = 'in_progress'
    and s.created_at > now() - interval '10 minutes'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'suggestion_not_found';
  end if;

  if p_modifications is null or length(trim(p_modifications)) not between 1 and 600 then
    raise exception using errcode = 'P0001', message = 'invalid_summary';
  end if;
  if p_details is null or jsonb_typeof(p_details -> 'movements') <> 'array'
    or octet_length(p_details::text) > 100000 then
    raise exception using errcode = 'P0001', message = 'invalid_details';
  end if;

  select * into v_workout from public.workouts w where w.id = (v_suggestion.input ->> 'workout_id')::uuid;
  if not found or not public.athlete_can_view_workout(v_workout.id) then
    raise exception using errcode = 'P0001', message = 'workout_not_found';
  end if;
  if v_workout.updated_at > (v_suggestion.input ->> 'workout_updated_at')::timestamptz then
    raise exception using errcode = 'P0001', message = 'workout_changed';
  end if;

  select * into v_existing
  from public.athlete_workout_scalings aws
  where aws.workout_id = v_workout.id and aws.athlete_id = v_athlete_id
  for update;
  if found then
    if v_existing.updated_at > (v_suggestion.input ->> 'scaling_updated_at')::timestamptz
      or v_suggestion.input ->> 'scaling_updated_at' is null then
      raise exception using errcode = 'P0001', message = 'scaling_changed';
    end if;
    v_has_base := true;
    v_base_details := v_existing.details;
    v_base_modifications := v_existing.modifications;
  elsif v_suggestion.input ->> 'scaling_updated_at' is not null then
    raise exception using errcode = 'P0001', message = 'scaling_changed';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'movement_id', wm.movement_id,
      'sets', wm.sets,
      'reps', wm.reps,
      'load_kg', wm.load_kg,
      'distance_m', wm.distance_m,
      'calories', wm.calories,
      'duration_seconds', wm.duration_seconds
    ) order by wm.position), '[]'::jsonb)
  into v_base_movements
  from public.workout_movements wm
  where wm.workout_id = v_workout.id;

  v_new_movements := p_details -> 'movements';
  v_count := jsonb_array_length(v_base_movements);
  if jsonb_array_length(v_new_movements) <> v_count then
    raise exception using errcode = 'P0001', message = 'movement_count_mismatch';
  end if;

  v_base_rounds := v_workout.rounds;
  v_base_cap := v_workout.time_cap_seconds;
  if v_has_base and jsonb_typeof(v_base_details -> 'movements') = 'array'
    and jsonb_array_length(v_base_details -> 'movements') = v_count then
    if v_base_details ? 'rounds' then v_base_rounds := (v_base_details ->> 'rounds')::numeric; end if;
    if v_base_details ? 'time_cap_seconds' then v_base_cap := (v_base_details ->> 'time_cap_seconds')::numeric; end if;
  else
    v_base_details := null;
  end if;

  for i in 0 .. v_count - 1 loop
    v_original := v_base_movements -> i;
    v_base := coalesce(v_base_details -> 'movements' -> i, v_original);
    v_new := v_new_movements -> i;

    if v_new ->> 'original_movement_id' is distinct from v_original ->> 'movement_id' then
      raise exception using errcode = 'P0001', message = 'original_movement_mismatch';
    end if;
    if not exists (
      select 1 from public.movements m
      where m.id = (v_new ->> 'movement_id')::uuid
        and (m.coach_id is null or m.coach_id = v_workout.coach_id)
    ) then
      raise exception using errcode = 'P0001', message = 'unknown_movement';
    end if;

    if v_new ->> 'movement_id' = v_base ->> 'movement_id' then
      foreach v_field in array array['sets', 'reps', 'load_kg', 'distance_m', 'calories', 'duration_seconds'] loop
        v_tolerance := 0;
        if v_field = 'load_kg' then v_tolerance := 0.5; end if;
        if v_base ->> v_field is not null then
          if v_new ->> v_field is null
            or (v_new ->> v_field)::numeric > (v_base ->> v_field)::numeric + v_tolerance then
            raise exception using errcode = 'P0001', message = 'harder_' || v_field;
          end if;
        elsif v_field <> 'load_kg' and v_new ->> v_field is not null then
          raise exception using errcode = 'P0001', message = 'harder_' || v_field;
        end if;
      end loop;
    else
      -- A substitution may not swap back to a movement the coach already scaled away from.
      if v_new ->> 'movement_id' = v_original ->> 'movement_id' then
        raise exception using errcode = 'P0001', message = 'harder_substitution';
      end if;
      if v_base ->> 'load_kg' is not null and v_new ->> 'load_kg' is not null
        and (v_new ->> 'load_kg')::numeric > (v_base ->> 'load_kg')::numeric + 0.5 then
        raise exception using errcode = 'P0001', message = 'harder_load_kg';
      end if;
    end if;
  end loop;

  v_new_rounds := (p_details ->> 'rounds')::numeric;
  v_new_cap := (p_details ->> 'time_cap_seconds')::numeric;
  if v_base_rounds is null then
    if v_new_rounds is not null then
      raise exception using errcode = 'P0001', message = 'harder_rounds';
    end if;
  elsif v_new_rounds is null or v_new_rounds < 1 or v_new_rounds > v_base_rounds then
    raise exception using errcode = 'P0001', message = 'harder_rounds';
  end if;

  if v_base_cap is null then
    if v_new_cap is not null then
      raise exception using errcode = 'P0001', message = 'harder_time_cap';
    end if;
  elsif v_new_cap is null then
    raise exception using errcode = 'P0001', message = 'harder_time_cap';
  elsif v_workout.workout_type = 'for_time' then
    if v_new_cap < v_base_cap or v_new_cap > v_base_cap * 2 then
      raise exception using errcode = 'P0001', message = 'harder_time_cap';
    end if;
  elsif v_workout.workout_type in ('amrap', 'emom') then
    if v_new_cap > v_base_cap or v_new_cap < 60 then
      raise exception using errcode = 'P0001', message = 'harder_time_cap';
    end if;
  elsif v_new_cap <> v_base_cap then
    raise exception using errcode = 'P0001', message = 'harder_time_cap';
  end if;

  v_details := p_details || jsonb_build_object(
    'source', 'ai',
    'requested_by', 'athlete',
    'suggestion_id', p_suggestion_id
  );

  if v_existing.id is not null then
    update public.athlete_workout_scalings
    set modifications = trim(p_modifications),
        details = v_details,
        athlete_suggestion_id = p_suggestion_id,
        athlete_adjusted_at = now(),
        coach_modifications = case when v_existing.athlete_adjusted_at is null then v_base_modifications else v_existing.coach_modifications end,
        coach_details = case when v_existing.athlete_adjusted_at is null then v_existing.details else v_existing.coach_details end
    where id = v_existing.id
    returning id into v_scaling_id;
  else
    insert into public.athlete_workout_scalings (
      coach_id, workout_id, athlete_id, modifications, details, athlete_suggestion_id, athlete_adjusted_at
    )
    values (
      v_workout.coach_id, v_workout.id, v_athlete_id, trim(p_modifications), v_details, p_suggestion_id, now()
    )
    returning id into v_scaling_id;
  end if;

  update public.ai_suggestions
  set status = 'approved',
      error = null,
      proposal = p_proposal,
      final = p_proposal,
      decided_at = now(),
      target_table = 'athlete_workout_scalings',
      target_id = v_scaling_id
  where id = p_suggestion_id;

  return v_scaling_id;
end;
$$;

revoke all on function public.start_athlete_workout_adjustment(uuid, jsonb, text) from public, anon;
revoke all on function public.fail_athlete_workout_adjustment(uuid, text, jsonb) from public, anon;
revoke all on function public.apply_athlete_workout_adjustment(uuid, jsonb, text, jsonb) from public, anon;
grant execute on function public.start_athlete_workout_adjustment(uuid, jsonb, text) to authenticated, service_role;
grant execute on function public.fail_athlete_workout_adjustment(uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.apply_athlete_workout_adjustment(uuid, jsonb, text, jsonb) to authenticated, service_role;
