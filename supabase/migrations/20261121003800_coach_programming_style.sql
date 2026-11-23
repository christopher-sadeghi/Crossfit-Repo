create table public.coach_programming_styles (
  coach_id uuid primary key references public.coaches(id) on delete cascade,
  status text not null check (status in ('skipped', 'completed')),
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  updated_at timestamptz not null default now()
);

insert into public.coach_programming_styles (coach_id, status)
select id, 'skipped' from public.coaches
on conflict (coach_id) do nothing;

alter table public.coach_programming_styles enable row level security;
revoke all on public.coach_programming_styles from anon, authenticated;
grant select, insert, update on public.coach_programming_styles to authenticated;
grant all on public.coach_programming_styles to service_role;

create policy "Coaches can read programming styles in their scope" on public.coach_programming_styles
  for select to authenticated
  using (exists (
    select 1 from public.coaches c
    where c.id = coach_id and c.gym_id = (select public.current_gym_id())
  ));

create policy "Coaches can insert their own programming style" on public.coach_programming_styles
  for insert to authenticated
  with check (coach_id = (select auth.uid()));

create policy "Coaches can update their own programming style" on public.coach_programming_styles
  for update to authenticated
  using (coach_id = (select auth.uid()))
  with check (coach_id = (select auth.uid()));

create function public.programming_style_for_athlete(p_athlete_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when a.user_id = (select auth.uid())
      or exists (
        select 1 from public.coaches requester
        where requester.id = (select auth.uid()) and requester.gym_id = a.coach_id
      )
    then (
      select s.answers
      from public.coach_programming_styles s
      where s.coach_id = coalesce(a.assigned_coach_id, a.coach_id)
        and s.status = 'completed'
    )
    else null
  end
  from public.athletes a
  where a.id = p_athlete_id
$$;

revoke all on function public.programming_style_for_athlete(uuid) from public, anon;
grant execute on function public.programming_style_for_athlete(uuid) to authenticated;
