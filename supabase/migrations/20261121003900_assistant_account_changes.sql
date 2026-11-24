alter type public.suggestion_type add value if not exists 'athlete_account_change';

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (
  kind in (
    'result_logged', 'workout_adjusted', 'low_readiness', 'message', 'missed_workouts',
    'coach_message', 'schedule_changed', 'suggestion_approved', 'progress_report',
    'progress_check_in', 'high_training_load', 'form_check', 'assistant_red_flag',
    'form_reviewed', 'check_in_reminder', 'payment_failed', 'health_flag',
    'athlete_profile_changed'
  )
);

create table public.athlete_assistant_applied_cards (
  message_id uuid not null references public.athlete_ai_messages(id) on delete cascade,
  card_index integer not null check (card_index >= 0),
  athlete_id uuid not null,
  coach_id uuid not null references public.coaches(id) on delete cascade,
  applied_at timestamptz not null default now(),
  primary key (message_id, card_index),
  foreign key (athlete_id, coach_id) references public.athletes(id, coach_id) on delete cascade
);
create index athlete_assistant_applied_cards_athlete_idx on public.athlete_assistant_applied_cards(athlete_id);
alter table public.athlete_assistant_applied_cards enable row level security;
create policy "Athletes and coaches read applied account changes" on public.athlete_assistant_applied_cards
  for select to authenticated using (
    athlete_id = (select public.current_athlete_id())
    or coach_id = (select public.current_gym_id())
    or coach_id = (select auth.uid())
  );
revoke all on public.athlete_assistant_applied_cards from public, anon, authenticated;
grant select on public.athlete_assistant_applied_cards to authenticated;
grant all on public.athlete_assistant_applied_cards to service_role;

create function public.apply_athlete_account_change(
  p_message_id uuid,
  p_card_index integer,
  p_change jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_athlete_id uuid := public.current_athlete_id();
  v_coach_id uuid;
  v_assigned_coach_id uuid;
  v_units public.weight_unit;
  v_name text;
  v_card jsonb;
  v_change jsonb;
  v_inserted uuid;
  v_kind text;
  v_action text;
  v_goal_id uuid;
  v_goal_status public.goal_status;
  v_active_goals integer;
  v_value numeric;
  v_weight_kg numeric;
  v_food public.athlete_food_preferences%rowtype;
  v_diet text;
  v_allergies text[];
  v_dislikes text[];
  v_cooking smallint;
  v_reminder public.check_in_reminders%rowtype;
  v_remind_at time;
  v_time_zone text;
  v_target public.nutrition_targets%rowtype;
  v_today date := current_date;
  v_notification_tab text;
  v_assistant_training boolean;
  v_assistant_nutrition boolean;
begin
  if v_athlete_id is null or p_message_id is null or p_card_index is null or p_card_index < 0 or p_change is null
    or jsonb_typeof(p_change) <> 'object' then
    raise exception 'invalid_account_change' using errcode = '22023';
  end if;

  select a.coach_id, a.assigned_coach_id, c.units, a.first_name || ' ' || a.last_name
    into v_coach_id, v_assigned_coach_id, v_units, v_name
  from public.athletes a join public.coaches c on c.id = a.coach_id
  where a.id = v_athlete_id and a.user_id = auth.uid() and a.status = 'active'
  for update of a;
  if not found then raise exception 'active_athlete_not_found' using errcode = '42501'; end if;

  select m.metadata->'cards'->p_card_index into v_card
  from public.athlete_ai_messages m
  where m.id = p_message_id and m.athlete_id = v_athlete_id and m.coach_id = v_coach_id and m.role = 'assistant';
  if v_card is null or v_card->>'kind' <> 'account_change' or jsonb_typeof(v_card->'change') <> 'object' then
    raise exception 'invalid_account_change_card' using errcode = '42501';
  end if;
  v_change := case when p_change->>'kind' = 'reminder_time' then p_change - 'time_zone' else p_change end;
  if v_change is distinct from v_card->'change' then
    raise exception 'account_change_card_mismatch' using errcode = '42501';
  end if;

  v_kind := p_change->>'kind';
  v_action := p_change->>'action';
  select assistant_training, assistant_nutrition
    into v_assistant_training, v_assistant_nutrition
  from public.athlete_assistant_settings();
  if (v_kind in ('goal','injuries','body_weight','reminder_time') and not coalesce(v_assistant_training, false))
    or (v_kind in ('food_preferences','macros') and not coalesce(v_assistant_nutrition, false)) then
    raise exception 'assistant_topic_disabled' using errcode = '42501';
  end if;

  insert into public.athlete_assistant_applied_cards(message_id, card_index, athlete_id, coach_id)
  values (p_message_id, p_card_index, v_athlete_id, v_coach_id)
  on conflict (message_id, card_index) do nothing
  returning message_id into v_inserted;
  if v_inserted is null then raise exception 'account_change_already_applied' using errcode = '23505'; end if;

  if v_kind = 'goal' then
    if v_action = 'create' then
      if exists(select 1 from jsonb_object_keys(p_change) k where k not in ('kind','action','title','goal_type','target_value','unit','target_date'))
        or not (p_change ? 'title' and p_change ? 'goal_type')
        or jsonb_typeof(p_change->'title') <> 'string' or length(btrim(p_change->>'title')) not between 1 and 120
        or p_change->>'goal_type' not in ('performance','body_composition','skill')
        or (p_change ? 'target_value' and (jsonb_typeof(p_change->'target_value') <> 'number'
          or (p_change->>'target_value')::numeric not between 0 and 100000))
        or (p_change ? 'unit' and (jsonb_typeof(p_change->'unit') <> 'string' or length(p_change->>'unit') > 20))
        or (p_change ? 'target_date' and (jsonb_typeof(p_change->'target_date') <> 'string'
          or (p_change->>'target_date')::date is null)) then
        raise exception 'invalid_goal_change' using errcode = '22023';
      end if;
      select count(*) into v_active_goals from public.goals where athlete_id = v_athlete_id and status = 'active';
      if v_active_goals >= 6 then raise exception 'active_goal_limit' using errcode = '22023'; end if;
      insert into public.goals(coach_id, athlete_id, title, goal_type, target_value, unit, target_date)
        values (v_coach_id, v_athlete_id, btrim(p_change->>'title'), (p_change->>'goal_type')::public.goal_type,
          (p_change->>'target_value')::numeric, p_change->>'unit', (p_change->>'target_date')::date)
        returning id into v_goal_id;
    elsif v_action = 'update' then
      if exists(select 1 from jsonb_object_keys(p_change) k where k not in ('kind','action','goal_id','title','target_value','target_date'))
        or not (p_change ? 'goal_id')
        or (p_change ? 'title' and (jsonb_typeof(p_change->'title') <> 'string' or length(btrim(p_change->>'title')) not between 1 and 120))
        or (p_change ? 'target_value' and jsonb_typeof(p_change->'target_value') not in ('number','null'))
        or (jsonb_typeof(p_change->'target_value') = 'number' and (p_change->>'target_value')::numeric not between 0 and 100000)
        or (p_change ? 'target_date' and jsonb_typeof(p_change->'target_date') not in ('string','null'))
        or (jsonb_typeof(p_change->'target_date') = 'string' and (p_change->>'target_date')::date is null)
        or not (p_change ? 'title' or p_change ? 'target_value' or p_change ? 'target_date') then
        raise exception 'invalid_goal_change' using errcode = '22023';
      end if;
      select id into v_goal_id from public.goals where id = (p_change->>'goal_id')::uuid
        and athlete_id = v_athlete_id and coach_id = v_coach_id for update;
      if v_goal_id is null then raise exception 'goal_not_found' using errcode = '42501'; end if;
      update public.goals set
        title = case when p_change ? 'title' then btrim(p_change->>'title') else title end,
        target_value = case when p_change ? 'target_value' then (p_change->>'target_value')::numeric else target_value end,
        target_date = case when p_change ? 'target_date' then (p_change->>'target_date')::date else target_date end
      where id = v_goal_id;
    elsif v_action = 'set_status' then
      if exists(select 1 from jsonb_object_keys(p_change) k where k not in ('kind','action','goal_id','status'))
        or not (p_change ? 'goal_id' and p_change ? 'status')
        or p_change->>'status' not in ('active','achieved','abandoned') then
        raise exception 'invalid_goal_change' using errcode = '22023';
      end if;
      select id, status into v_goal_id, v_goal_status from public.goals where id = (p_change->>'goal_id')::uuid
        and athlete_id = v_athlete_id and coach_id = v_coach_id for update;
      if v_goal_id is null then raise exception 'goal_not_found' using errcode = '42501'; end if;
      if p_change->>'status' = 'active' and v_goal_status <> 'active' then
        select count(*) into v_active_goals from public.goals where athlete_id = v_athlete_id and status = 'active';
        if v_active_goals >= 6 then raise exception 'active_goal_limit' using errcode = '22023'; end if;
      end if;
      update public.goals set status = (p_change->>'status')::public.goal_status,
        achieved_at = case when p_change->>'status' = 'achieved' then now() else null end
      where id = v_goal_id;
    else
      raise exception 'invalid_goal_change' using errcode = '22023';
    end if;
    v_notification_tab := 'goals';
  elsif v_kind = 'injuries' then
    if exists(select 1 from jsonb_object_keys(p_change) k where k not in ('kind','injuries'))
      or not (p_change ? 'injuries')
      or jsonb_typeof(p_change->'injuries') not in ('string','null')
      or (jsonb_typeof(p_change->'injuries') = 'string' and length(p_change->>'injuries') > 1000) then
      raise exception 'invalid_injuries_change' using errcode = '22023';
    end if;
    update public.athletes set injuries = case when p_change->'injuries' = 'null'::jsonb then null else p_change->>'injuries' end
      where id = v_athlete_id;
    v_notification_tab := 'overview';
  elsif v_kind = 'body_weight' then
    if exists(select 1 from jsonb_object_keys(p_change) k where k not in ('kind','value','measured_on'))
      or not (p_change ? 'value' and p_change ? 'measured_on')
      or jsonb_typeof(p_change->'value') <> 'number' or jsonb_typeof(p_change->'measured_on') <> 'string'
      or p_change->>'measured_on' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or (p_change->>'value')::numeric <= 0 or (p_change->>'value')::numeric >= 1000 then
      raise exception 'invalid_body_weight_change' using errcode = '22023';
    end if;
    v_value := (p_change->>'value')::numeric;
    v_weight_kg := case when v_units = 'lb' then round(v_value / 2.20462, 2) else round(v_value, 2) end;
    if v_weight_kg <= 0 or v_weight_kg >= 1000 then raise exception 'invalid_body_weight_change' using errcode = '22023'; end if;
    insert into public.body_metrics(coach_id, athlete_id, weight_kg, measured_on)
      values (v_coach_id, v_athlete_id, v_weight_kg, (p_change->>'measured_on')::date);
  elsif v_kind = 'food_preferences' then
    if exists(select 1 from jsonb_object_keys(p_change) k where k not in ('kind','diet_type','allergies','dislikes','cooking_minutes'))
      or not (p_change ? 'diet_type' or p_change ? 'allergies' or p_change ? 'dislikes' or p_change ? 'cooking_minutes')
      or (p_change ? 'diet_type' and jsonb_typeof(p_change->'diet_type') <> 'string')
      or (p_change ? 'diet_type' and p_change->>'diet_type' not in ('none','vegetarian','vegan','pescatarian','gluten_free','dairy_free','low_carb','paleo','halal','kosher'))
      or (p_change ? 'allergies' and (jsonb_typeof(p_change->'allergies') <> 'array'
        or jsonb_array_length(p_change->'allergies') > 20
        or exists(select 1 from jsonb_array_elements(p_change->'allergies') as item(value)
          where jsonb_typeof(item.value) <> 'string' or length(btrim(item.value #>> '{}')) not between 1 and 100)))
      or (p_change ? 'dislikes' and (jsonb_typeof(p_change->'dislikes') <> 'array'
        or jsonb_array_length(p_change->'dislikes') > 30
        or exists(select 1 from jsonb_array_elements(p_change->'dislikes') as item(value)
          where jsonb_typeof(item.value) <> 'string' or length(btrim(item.value #>> '{}')) not between 1 and 100)))
      or (p_change ? 'cooking_minutes' and p_change->'cooking_minutes' <> 'null'::jsonb
        and p_change->>'cooking_minutes' not in ('0','15','30','60')) then
      raise exception 'invalid_food_preferences_change' using errcode = '22023';
    end if;
    select * into v_food from public.athlete_food_preferences where athlete_id = v_athlete_id;
    v_diet := coalesce(p_change->>'diet_type', v_food.diet_type, 'none');
    v_allergies := case when p_change ? 'allergies' then array(select jsonb_array_elements_text(p_change->'allergies')) else coalesce(v_food.allergies, '{}'::text[]) end;
    v_dislikes := case when p_change ? 'dislikes' then array(select jsonb_array_elements_text(p_change->'dislikes')) else coalesce(v_food.dislikes, '{}'::text[]) end;
    v_cooking := case when p_change ? 'cooking_minutes' then (p_change->>'cooking_minutes')::smallint else v_food.cooking_minutes end;
    insert into public.athlete_food_preferences(athlete_id, coach_id, diet_type, allergies, dislikes, cooking_minutes)
      values (v_athlete_id, v_coach_id, v_diet, v_allergies, v_dislikes, v_cooking)
      on conflict (athlete_id) do update set diet_type = excluded.diet_type, allergies = excluded.allergies,
        dislikes = excluded.dislikes, cooking_minutes = excluded.cooking_minutes;
  elsif v_kind = 'reminder_time' then
    if exists(select 1 from jsonb_object_keys(p_change) k where k not in ('kind','remind_at','time_zone'))
      or not (p_change ? 'remind_at')
      or jsonb_typeof(p_change->'remind_at') not in ('string','null')
      or (jsonb_typeof(p_change->'remind_at') = 'string' and p_change->>'remind_at' !~ '^(?:[01][0-9]|2[0-3]):(?:00|15|30|45)$')
      or (p_change ? 'time_zone' and (jsonb_typeof(p_change->'time_zone') <> 'string'
        or length(p_change->>'time_zone') not between 1 and 100
        or not public.is_check_in_time_zone(p_change->>'time_zone'))) then
      raise exception 'invalid_reminder_change' using errcode = '22023';
    end if;
    select * into v_reminder from public.check_in_reminders where athlete_id = v_athlete_id for update;
    v_remind_at := case when p_change->'remind_at' = 'null'::jsonb then null else (p_change->>'remind_at')::time end;
    v_time_zone := coalesce(v_reminder.time_zone, p_change->>'time_zone', 'UTC');
    insert into public.check_in_reminders(athlete_id, remind_at, time_zone)
      values (v_athlete_id, v_remind_at, v_time_zone)
      on conflict (athlete_id) do update set remind_at = excluded.remind_at,
        time_zone = check_in_reminders.time_zone;
  elsif v_kind = 'macros' then
    if exists(select 1 from jsonb_object_keys(p_change) k where k not in ('kind','calories','protein_g','carbs_g','fat_g','note'))
      or not (p_change ? 'calories' and p_change ? 'protein_g' and p_change ? 'carbs_g' and p_change ? 'fat_g')
      or jsonb_typeof(p_change->'calories') <> 'number' or jsonb_typeof(p_change->'protein_g') <> 'number'
      or jsonb_typeof(p_change->'carbs_g') <> 'number' or jsonb_typeof(p_change->'fat_g') <> 'number'
      or (p_change->>'calories') !~ '^[0-9]+$' or (p_change->>'protein_g') !~ '^[0-9]+$'
      or (p_change->>'carbs_g') !~ '^[0-9]+$' or (p_change->>'fat_g') !~ '^[0-9]+$'
      or (p_change->>'calories')::integer not between 500 and 10000
      or (p_change->>'protein_g')::integer not between 0 and 2000
      or (p_change->>'carbs_g')::integer not between 0 and 2000
      or (p_change->>'fat_g')::integer not between 0 and 2000
      or (p_change ? 'note' and (jsonb_typeof(p_change->'note') <> 'string' or length(p_change->>'note') > 500)) then
      raise exception 'invalid_macros_change' using errcode = '22023';
    end if;
    select * into v_target from public.nutrition_targets
      where athlete_id = v_athlete_id and end_date is null for update;
    if found and v_target.start_date > v_today then raise exception 'macro_target_starts_in_future' using errcode = '22023'; end if;
    if found and v_target.start_date = v_today then
      update public.nutrition_targets set calories = (p_change->>'calories')::integer,
        protein_g = (p_change->>'protein_g')::integer, carbs_g = (p_change->>'carbs_g')::integer,
        fat_g = (p_change->>'fat_g')::integer, notes = coalesce(p_change->>'note', notes)
      where id = v_target.id;
    else
      if found then update public.nutrition_targets set end_date = v_today - 1 where id = v_target.id; end if;
      insert into public.nutrition_targets(coach_id, athlete_id, calories, protein_g, carbs_g, fat_g, start_date, notes)
        values (v_coach_id, v_athlete_id, (p_change->>'calories')::integer, (p_change->>'protein_g')::integer,
          (p_change->>'carbs_g')::integer, (p_change->>'fat_g')::integer, v_today, p_change->>'note');
    end if;
    v_notification_tab := 'nutrition';
  else
    raise exception 'invalid_account_change' using errcode = '22023';
  end if;

  if v_kind in ('goal','injuries','macros') then
    insert into public.notifications(recipient_id, athlete_id, kind, title, body, link, dedupe_key)
    values (
      coalesce(v_assigned_coach_id, v_coach_id), v_athlete_id, 'athlete_profile_changed',
      'Athlete updated their account', v_name || ' updated ' || case v_kind when 'goal' then 'a goal' when 'injuries' then 'injury information' else 'nutrition targets' end || '.',
      '/athletes/' || v_athlete_id::text || '?tab=' || v_notification_tab,
      'athlete-account-change:' || p_message_id::text || ':' || p_card_index::text
    );
  end if;

  return jsonb_build_object('saved', true, 'kind', v_kind);
end;
$$;
revoke all on function public.apply_athlete_account_change(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.apply_athlete_account_change(uuid, integer, jsonb) to authenticated;
