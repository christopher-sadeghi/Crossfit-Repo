alter table public.coaches
  add column assistant_rules text check (char_length(assistant_rules) <= 2000),
  add column assistant_training boolean not null default true,
  add column assistant_nutrition boolean not null default true,
  add column assistant_recovery boolean not null default true,
  add column athlete_ai_daily_limit integer not null default 25 check (athlete_ai_daily_limit between 1 and 200);

-- Coaches have table-level UPDATE; athletes have no UPDATE policy on profiles.
alter table public.athletes
  add column assistant_rules text check (char_length(assistant_rules) <= 2000);

create function public.athlete_assistant_settings()
returns table (
  coach_rules text, athlete_rules text, assistant_training boolean,
  assistant_nutrition boolean, assistant_recovery boolean, athlete_ai_daily_limit integer
)
language sql stable security definer set search_path = ''
as $$
  select c.assistant_rules, a.assistant_rules, c.assistant_training,
    c.assistant_nutrition, c.assistant_recovery, c.athlete_ai_daily_limit
  from public.athletes a join public.coaches c on c.id = a.coach_id
  where a.user_id = (select auth.uid()) and a.status = 'active';
$$;
revoke all on function public.athlete_assistant_settings() from public, anon, authenticated;
grant execute on function public.athlete_assistant_settings() to authenticated;

create table public.athlete_ai_messages (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  coach_id uuid not null references public.coaches(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 8000),
  metadata jsonb not null default '{}',
  red_flag boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (athlete_id, coach_id) references public.athletes(id, coach_id) on delete cascade
);
create index athlete_ai_messages_athlete_created_idx on public.athlete_ai_messages(athlete_id, created_at);
alter table public.athlete_ai_messages enable row level security;
create policy "Coaches read athlete assistant chats" on public.athlete_ai_messages
  for select to authenticated using (coach_id = (select auth.uid()));
create policy "Athletes read own assistant chats" on public.athlete_ai_messages
  for select to authenticated using (
    athlete_id = (select public.current_athlete_id()) and coach_id = (select public.current_athlete_coach_id())
  );
create policy "Athletes insert own assistant chats" on public.athlete_ai_messages
  for insert to authenticated with check (
    athlete_id = (select public.current_athlete_id()) and coach_id = (select public.current_athlete_coach_id())
  );
revoke all on public.athlete_ai_messages from anon, authenticated;
grant select, insert on public.athlete_ai_messages to authenticated;
grant all on public.athlete_ai_messages to service_role;

create table public.athlete_ai_card_actions (
  id uuid primary key default gen_random_uuid(),
  assistant_message_id uuid not null references public.athlete_ai_messages(id) on delete cascade,
  card_index integer not null check (card_index >= 0),
  athlete_id uuid not null,
  coach_id uuid not null references public.coaches(id) on delete cascade,
  action text not null check (action in ('sent', 'saved')),
  ref_id uuid not null,
  created_at timestamptz not null default now(),
  unique (assistant_message_id, card_index),
  foreign key (athlete_id, coach_id) references public.athletes(id, coach_id) on delete cascade
);
create index athlete_ai_card_actions_athlete_idx on public.athlete_ai_card_actions(athlete_id);
alter table public.athlete_ai_card_actions enable row level security;
create policy "Coaches read assistant card actions" on public.athlete_ai_card_actions
  for select to authenticated using (coach_id = (select auth.uid()));
create policy "Athletes read own assistant card actions" on public.athlete_ai_card_actions
  for select to authenticated using (
    athlete_id = (select public.current_athlete_id()) and coach_id = (select public.current_athlete_coach_id())
  );
create policy "Athletes complete own assistant cards" on public.athlete_ai_card_actions
  for insert to authenticated with check (
    athlete_id = (select public.current_athlete_id()) and coach_id = (select public.current_athlete_coach_id())
    and exists (
      select 1 from public.athlete_ai_messages m
      where m.id = assistant_message_id and m.athlete_id = athlete_ai_card_actions.athlete_id
        and m.coach_id = athlete_ai_card_actions.coach_id and m.role = 'assistant'
        and m.metadata->'cards'->card_index->>'kind' = case action when 'sent' then 'coach_message' else 'activity' end
    )
  );
revoke all on public.athlete_ai_card_actions from anon, authenticated;
grant select, insert on public.athlete_ai_card_actions to authenticated;
grant all on public.athlete_ai_card_actions to service_role;

-- The reservation and side effect commit together, or both roll back.
create function public.complete_athlete_ai_card(
  p_message_id uuid, p_card_index integer, p_action text, p_values jsonb
) returns table (ref_id uuid, already_completed boolean)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_athlete uuid := public.current_athlete_id();
  v_coach uuid := public.current_athlete_coach_id();
  v_ref uuid := gen_random_uuid();
  v_inserted uuid;
begin
  if v_athlete is null or p_card_index is null or p_card_index < 0 or p_action is null or p_action not in ('sent', 'saved') then
    raise exception 'invalid_assistant_card';
  end if;
  if not exists (
    select 1 from public.athlete_ai_messages m where m.id = p_message_id and m.athlete_id = v_athlete
      and m.coach_id = v_coach and m.role = 'assistant'
      and m.metadata->'cards'->p_card_index->>'kind' = case p_action when 'sent' then 'coach_message' else 'activity' end
  ) then raise exception 'invalid_assistant_card'; end if;
  insert into public.athlete_ai_card_actions(assistant_message_id, card_index, athlete_id, coach_id, action, ref_id)
    values (p_message_id, p_card_index, v_athlete, v_coach, p_action, v_ref)
    on conflict (assistant_message_id, card_index) do nothing returning id into v_inserted;
  if v_inserted is null then
    return query select a.ref_id, true from public.athlete_ai_card_actions a
      where a.assistant_message_id = p_message_id and a.card_index = p_card_index;
    return;
  end if;
  if p_action = 'sent' then
    if p_values->>'link_type' is not null and (
      p_values->>'link_type' <> 'workout' or not coalesce(public.athlete_can_view_workout((p_values->>'link_id')::uuid), false)
    ) then raise exception 'invalid_message_link'; end if;
    insert into public.messages(id, athlete_id, coach_id, body, link_type, link_id)
      values (v_ref, v_athlete, v_coach, btrim(p_values->>'body'), p_values->>'link_type', (p_values->>'link_id')::uuid);
  else
    insert into public.athlete_activities(id, athlete_id, coach_id, performed_on, activity_type, custom_label,
      duration_minutes, rpe, distance_m, notes, source)
      values (v_ref, v_athlete, v_coach, (p_values->>'performed_on')::date, p_values->>'activity_type',
        p_values->>'custom_label', (p_values->>'duration_minutes')::integer, (p_values->>'rpe')::integer,
        (p_values->>'distance_m')::numeric, p_values->>'notes', 'ai');
  end if;
  return query select v_ref, false;
end;
$$;
revoke all on function public.complete_athlete_ai_card(uuid, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.complete_athlete_ai_card(uuid, integer, text, jsonb) to authenticated;

create policy "Athletes read own assistant suggestions" on public.ai_suggestions
  for select to authenticated using (athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id())
    and requested_by = (select auth.uid())
    and suggestion_type::text in ('scale_workout', 'adjust_macros', 'write_workout')
    and exists (
      select 1 from public.messages m
      where m.id::text = ai_suggestions.input->>'source_message_id'
        and m.athlete_id = ai_suggestions.athlete_id
        and m.coach_id = ai_suggestions.coach_id
        and m.sender_id = (select auth.uid())
    ));
create policy "Athletes reserve assistant suggestions" on public.ai_suggestions
  for insert to authenticated with check (
    athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id())
    and requested_by = (select auth.uid())
    and suggestion_type::text in ('scale_workout', 'adjust_macros', 'write_workout')
    and exists (
      select 1 from public.messages m
      where m.id::text = ai_suggestions.input->>'source_message_id'
        and m.athlete_id = ai_suggestions.athlete_id
        and m.coach_id = ai_suggestions.coach_id
        and m.sender_id = (select auth.uid())
    ) and status::text = 'failed' and error = 'in_progress'
  );
create policy "Athletes finish assistant suggestions" on public.ai_suggestions
  for update to authenticated using (
    athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id())
    and requested_by = (select auth.uid())
    and suggestion_type::text in ('scale_workout', 'adjust_macros', 'write_workout')
    and exists (
      select 1 from public.messages m
      where m.id::text = ai_suggestions.input->>'source_message_id'
        and m.athlete_id = ai_suggestions.athlete_id
        and m.coach_id = ai_suggestions.coach_id
        and m.sender_id = (select auth.uid())
    ) and status::text = 'failed' and error = 'in_progress'
  ) with check (
    athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id())
    and requested_by = (select auth.uid())
    and suggestion_type::text in ('scale_workout', 'adjust_macros', 'write_workout')
    and exists (
      select 1 from public.messages m
      where m.id::text = ai_suggestions.input->>'source_message_id'
        and m.athlete_id = ai_suggestions.athlete_id
        and m.coach_id = ai_suggestions.coach_id
        and m.sender_id = (select auth.uid())
    ) and status::text in ('pending', 'failed')
  );

create function public.lock_athlete_assistant_suggestion()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if current_user = 'authenticated' and old.coach_id <> auth.uid()
    and (old.suggestion_type::text in ('scale_workout', 'adjust_macros', 'write_workout')
      or new.suggestion_type::text in ('scale_workout', 'adjust_macros', 'write_workout')) then
    if new.athlete_id is distinct from old.athlete_id
      or new.coach_id is distinct from old.coach_id
      or new.requested_by is distinct from old.requested_by
      or new.suggestion_type is distinct from old.suggestion_type
      or new.input is distinct from old.input then
      raise exception 'assistant_suggestion_identity_is_immutable';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.lock_athlete_assistant_suggestion() from public, anon, authenticated;
create trigger lock_athlete_assistant_suggestion before update on public.ai_suggestions
  for each row execute function public.lock_athlete_assistant_suggestion();

alter table public.notifications drop constraint notifications_kind_check;

alter table public.notifications add constraint notifications_kind_check check (
  kind in ('result_logged', 'workout_adjusted', 'low_readiness', 'message', 'missed_workouts', 'coach_message', 'schedule_changed', 'suggestion_approved', 'progress_report', 'progress_check_in', 'high_training_load', 'form_check', 'assistant_red_flag', 'form_reviewed')
);

create or replace function public.create_notification(
  p_athlete_id uuid, p_kind text, p_title text, p_body text default null,
  p_link text default null, p_dedupe_key text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_athlete public.athletes%rowtype;
  v_recipient uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_athlete from public.athletes where id = p_athlete_id;
  if not found then raise exception 'athlete_not_found'; end if;
  if v_athlete.user_id = auth.uid() and v_athlete.status = 'active' then
    if p_kind not in ('result_logged', 'workout_adjusted', 'low_readiness', 'message', 'progress_check_in', 'high_training_load', 'form_check', 'assistant_red_flag') or p_kind is null then
      raise exception 'invalid_notification_kind';
    end if;
    v_recipient := case when p_kind = 'progress_check_in' then v_athlete.user_id else v_athlete.coach_id end;
  elsif v_athlete.coach_id = auth.uid() then
    if p_kind in ('missed_workouts', 'high_training_load') then
      v_recipient := v_athlete.coach_id;
    elsif p_kind in ('coach_message', 'schedule_changed', 'suggestion_approved', 'progress_report', 'progress_check_in', 'form_reviewed') then
      v_recipient := v_athlete.user_id;
    else
      raise exception 'invalid_notification_kind';
    end if;
  else
    raise exception 'not_authorized';
  end if;
  if v_recipient is null then return; end if;
  insert into public.notifications (recipient_id, athlete_id, kind, title, body, link, dedupe_key)
  values (v_recipient, p_athlete_id, p_kind, left(p_title, 160), left(p_body, 2000), left(p_link, 1000), left(p_dedupe_key, 200))
  on conflict (recipient_id, dedupe_key) do nothing;
end;
$$;

revoke all on function public.create_notification(uuid, text, text, text, text, text) from public, anon;

grant execute on function public.create_notification(uuid, text, text, text, text, text) to authenticated, service_role;
