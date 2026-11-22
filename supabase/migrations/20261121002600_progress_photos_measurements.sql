alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (
  kind in ('result_logged', 'workout_adjusted', 'low_readiness', 'message', 'missed_workouts', 'coach_message', 'schedule_changed', 'suggestion_approved', 'progress_report', 'progress_check_in')
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
    if p_kind not in ('result_logged', 'workout_adjusted', 'low_readiness', 'message', 'progress_check_in') or p_kind is null then
      raise exception 'invalid_notification_kind';
    end if;
    v_recipient := case when p_kind = 'progress_check_in' then v_athlete.user_id else v_athlete.coach_id end;
  elsif v_athlete.coach_id = auth.uid() then
    if p_kind = 'missed_workouts' then
      v_recipient := v_athlete.coach_id;
    elsif p_kind in ('coach_message', 'schedule_changed', 'suggestion_approved', 'progress_report', 'progress_check_in') then
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
create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  measured_on date not null,
  site text not null check (site ~ '^[a-z_]{1,40}$'),
  value_cm numeric(5,1) not null check (value_cm > 0 and value_cm < 400),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_id, measured_on, site),
  foreign key (athlete_id, coach_id) references public.athletes (id, coach_id) on delete cascade
);
create index body_measurements_athlete_measured_idx on public.body_measurements (athlete_id, measured_on);
create trigger set_updated_at before update on public.body_measurements
  for each row execute function public.set_updated_at();

create table public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  taken_on date not null,
  pose text not null check (pose in ('front', 'side', 'back')),
  storage_path text not null unique check (
    storage_path ~ ('^' || coach_id || '/' || athlete_id || '/[a-f0-9-]+\.(jpg|png|webp)$')
  ),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (athlete_id, taken_on, pose),
  foreign key (athlete_id, coach_id) references public.athletes (id, coach_id) on delete cascade
);

create table public.progress_reminders (
  athlete_id uuid primary key references public.athletes (id) on delete cascade,
  coach_id uuid not null references public.coaches (id) on delete cascade,
  cadence_weeks smallint not null check (cadence_weeks in (2,4)),
  starts_on date not null,
  updated_at timestamptz not null default now(),
  foreign key (athlete_id, coach_id) references public.athletes (id, coach_id) on delete cascade
);
create trigger set_updated_at before update on public.progress_reminders
  for each row execute function public.set_updated_at();

alter table public.body_measurements enable row level security;
revoke all on public.body_measurements from anon, authenticated;
grant select, insert, update, delete on public.body_measurements to authenticated;
grant all on public.body_measurements to service_role;
create policy "Coaches manage their athletes' progress" on public.body_measurements
  for all to authenticated using (coach_id = (select auth.uid()) and exists (
      select 1 from public.athletes a where a.id = athlete_id and a.coach_id = (select auth.uid())
    )) with check (coach_id = (select auth.uid()) and exists (
      select 1 from public.athletes a where a.id = athlete_id and a.coach_id = (select auth.uid())
    ));
create policy "Athletes read their progress" on public.body_measurements
  for select to authenticated using (athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id()));
create policy "Athletes insert their progress" on public.body_measurements
  for insert to authenticated  with check (athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id()));
create policy "Athletes update their progress" on public.body_measurements
  for update to authenticated using (athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id())) with check (athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id()));
create policy "Athletes delete their progress" on public.body_measurements
  for delete to authenticated using (athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id())) ;

alter table public.progress_photos enable row level security;
revoke all on public.progress_photos from anon, authenticated;
grant select, insert, update, delete on public.progress_photos to authenticated;
grant all on public.progress_photos to service_role;
create policy "Coaches manage their athletes' progress" on public.progress_photos
  for all to authenticated using (coach_id = (select auth.uid()) and exists (
      select 1 from public.athletes a where a.id = athlete_id and a.coach_id = (select auth.uid())
    )) with check (coach_id = (select auth.uid()) and exists (
      select 1 from public.athletes a where a.id = athlete_id and a.coach_id = (select auth.uid())
    ));
create policy "Athletes read their progress" on public.progress_photos
  for select to authenticated using (athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id()));
create policy "Athletes insert their progress" on public.progress_photos
  for insert to authenticated  with check (athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id()));
create policy "Athletes update their progress" on public.progress_photos
  for update to authenticated using (athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id())) with check (athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id()));
create policy "Athletes delete their progress" on public.progress_photos
  for delete to authenticated using (athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id())) ;

alter table public.progress_reminders enable row level security;
revoke all on public.progress_reminders from anon, authenticated;
grant select, insert, update, delete on public.progress_reminders to authenticated;
grant all on public.progress_reminders to service_role;
create policy "Coaches manage their athletes' progress" on public.progress_reminders
  for all to authenticated using (coach_id = (select auth.uid()) and exists (
      select 1 from public.athletes a where a.id = athlete_id and a.coach_id = (select auth.uid())
    )) with check (coach_id = (select auth.uid()) and exists (
      select 1 from public.athletes a where a.id = athlete_id and a.coach_id = (select auth.uid())
    ));
create policy "Athletes read their progress" on public.progress_reminders
  for select to authenticated using (athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']);

create policy "Coaches insert progress photos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.athletes a where a.id::text = (storage.foldername(objects.name))[2]
        and a.coach_id = (select auth.uid())
    )
    and name ~ '^[a-f0-9-]+/[a-f0-9-]+/[a-f0-9-]+\.(jpg|png|webp)$'
  );
create policy "Coaches select progress photos" on storage.objects
  for select to authenticated using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.athletes a where a.id::text = (storage.foldername(objects.name))[2]
        and a.coach_id = (select auth.uid())
    )
  );
create policy "Coaches delete progress photos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.athletes a where a.id::text = (storage.foldername(objects.name))[2]
        and a.coach_id = (select auth.uid())
    )
  );
create policy "Athletes insert progress photos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (select public.current_athlete_coach_id())::text
    and (storage.foldername(name))[2] = (select public.current_athlete_id())::text
    and name ~ '^[a-f0-9-]+/[a-f0-9-]+/[a-f0-9-]+\.(jpg|png|webp)$'
  );
create policy "Athletes select progress photos" on storage.objects
  for select to authenticated using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (select public.current_athlete_coach_id())::text
    and (storage.foldername(name))[2] = (select public.current_athlete_id())::text
  );
create policy "Athletes delete progress photos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (select public.current_athlete_coach_id())::text
    and (storage.foldername(name))[2] = (select public.current_athlete_id())::text
  );
