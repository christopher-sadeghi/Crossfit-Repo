create function public.athlete_can_view_workout(p_workout_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workouts w
    where w.id = p_workout_id
      and (
        exists (
          select 1
          from public.program_assignments pa
          where pa.program_id = w.program_id
            and pa.athlete_id = public.current_athlete_id()
        )
        or exists (
          select 1
          from public.workout_results r
          where r.workout_id = w.id
            and r.athlete_id = public.current_athlete_id()
        )
      )
  );
$$;

revoke all on function public.athlete_can_view_workout(uuid) from public, anon;
grant execute on function public.athlete_can_view_workout(uuid) to authenticated;

drop policy "Athletes can log their own results" on public.workout_results;
create policy "Athletes can log their own results" on public.workout_results
  for insert to authenticated
  with check (
    athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id())
    and logged_by = auth.uid()
    and (select public.athlete_can_view_workout(workout_id))
  );

drop policy "Athletes can update their own results" on public.workout_results;
create policy "Athletes can update their own results" on public.workout_results
  for update to authenticated
  using (
    athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id())
    and logged_by = auth.uid()
  )
  with check (
    athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id())
    and logged_by = auth.uid()
    and (select public.athlete_can_view_workout(workout_id))
  );
