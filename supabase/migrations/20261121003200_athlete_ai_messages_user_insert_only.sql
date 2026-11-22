drop policy if exists "Athletes insert own assistant chats" on public.athlete_ai_messages;

create policy "Athletes insert own assistant chats" on public.athlete_ai_messages
  for insert to authenticated with check (
    athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id())
    and role = 'user'
  );
