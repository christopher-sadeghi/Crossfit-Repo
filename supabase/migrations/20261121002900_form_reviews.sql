-- FIT-38: video form review. Athletes upload short technique videos to a private bucket;
-- their coach pins comments at timestamps and marks them reviewed.

alter table public.notifications drop constraint notifications_kind_check;

alter table public.notifications add constraint notifications_kind_check check (
  kind in ('result_logged', 'workout_adjusted', 'low_readiness', 'message', 'missed_workouts', 'coach_message', 'schedule_changed', 'suggestion_approved', 'progress_report', 'progress_check_in', 'high_training_load', 'form_check', 'form_reviewed')
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
    if p_kind not in ('result_logged', 'workout_adjusted', 'low_readiness', 'message', 'progress_check_in', 'high_training_load', 'form_check') or p_kind is null then
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

create table public.form_reviews (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  storage_path text not null unique check (
    storage_path ~ ('^' || coach_id || '/' || athlete_id || '/[a-f0-9-]{36}\.(mp4|mov|webm)$')
  ),
  content_type text not null check (content_type in ('video/mp4', 'video/quicktime', 'video/webm')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 104857600),
  duration_seconds numeric(6,2) not null check (duration_seconds > 0 and duration_seconds <= 60),
  recorded_on date not null,
  movement_id uuid references public.movements (id) on delete set null,
  workout_result_id uuid references public.workout_results (id) on delete set null,
  set_label text check (set_label is null or char_length(set_label) between 1 and 80),
  question text check (question is null or char_length(question) between 1 and 1000),
  status text not null default 'awaiting_review' check (status in ('awaiting_review', 'reviewed')),
  reviewed_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, athlete_id, coach_id),
  check ((status = 'reviewed') = (reviewed_at is not null)),
  foreign key (athlete_id, coach_id) references public.athletes (id, coach_id) on delete cascade
);

create index form_reviews_coach_status_idx on public.form_reviews (coach_id, status, created_at);

create index form_reviews_athlete_idx on public.form_reviews (athlete_id, created_at);

create index form_reviews_result_idx on public.form_reviews (workout_result_id) where workout_result_id is not null;

create index form_reviews_movement_idx on public.form_reviews (movement_id) where movement_id is not null;

create trigger set_updated_at before update on public.form_reviews
  for each row execute function public.set_updated_at();

create function public.form_review_status_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'reviewed' and (tg_op = 'INSERT' or old.status <> 'reviewed') then
    new.reviewed_at := now();
  elsif new.status = 'awaiting_review' then
    new.reviewed_at := null;
  end if;
  return new;
end;
$$;

create trigger form_review_status_stamp before insert or update of status on public.form_reviews
  for each row execute function public.form_review_status_stamp();

create table public.form_review_comments (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null,
  coach_id uuid not null,
  athlete_id uuid not null,
  parent_id uuid,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  at_seconds numeric(6,2) check (at_seconds is null or (at_seconds >= 0 and at_seconds <= 60)),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, review_id),
  check ((parent_id is null) = (at_seconds is not null)),
  foreign key (review_id, athlete_id, coach_id) references public.form_reviews (id, athlete_id, coach_id) on delete cascade,
  foreign key (parent_id, review_id) references public.form_review_comments (id, review_id) on delete cascade
);

create index form_review_comments_review_idx on public.form_review_comments (review_id, at_seconds);

create index form_review_comments_parent_idx on public.form_review_comments (parent_id) where parent_id is not null;

create trigger set_updated_at before update on public.form_review_comments
  for each row execute function public.set_updated_at();

create table public.athlete_movement_cues (
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  movement_id uuid not null references public.movements (id) on delete cascade,
  coach_id uuid not null references public.coaches (id) on delete cascade,
  cue text not null check (char_length(btrim(cue)) between 1 and 300),
  updated_at timestamptz not null default now(),
  primary key (athlete_id, movement_id),
  foreign key (athlete_id, coach_id) references public.athletes (id, coach_id) on delete cascade
);

create index athlete_movement_cues_movement_idx on public.athlete_movement_cues (movement_id);

create trigger set_updated_at before update on public.athlete_movement_cues
  for each row execute function public.set_updated_at();

-- form_reviews: athletes create and delete their own; coaches review and delete their athletes'.
alter table public.form_reviews enable row level security;

revoke all on public.form_reviews from anon, authenticated;

grant select, insert, delete on public.form_reviews to authenticated;

grant update (status) on public.form_reviews to authenticated;

grant all on public.form_reviews to service_role;

create policy "Coaches read their athletes' form reviews" on public.form_reviews
  for select to authenticated using (coach_id = (select auth.uid()) and exists (
    select 1 from public.athletes a where a.id = athlete_id and a.coach_id = (select auth.uid())
  ));

create policy "Coaches review their athletes' form reviews" on public.form_reviews
  for update to authenticated using (coach_id = (select auth.uid()) and exists (
    select 1 from public.athletes a where a.id = athlete_id and a.coach_id = (select auth.uid())
  )) with check (coach_id = (select auth.uid()));

create policy "Coaches delete their athletes' form reviews" on public.form_reviews
  for delete to authenticated using (coach_id = (select auth.uid()) and exists (
    select 1 from public.athletes a where a.id = athlete_id and a.coach_id = (select auth.uid())
  ));

create policy "Athletes read their form reviews" on public.form_reviews
  for select to authenticated using (athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id()));

create policy "Athletes submit form reviews" on public.form_reviews
  for insert to authenticated with check (
    athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id())
    and created_by = (select auth.uid())
    and status = 'awaiting_review'
    and (movement_id is null or exists (
      select 1 from public.movements m where m.id = movement_id and (m.coach_id is null or m.coach_id = form_reviews.coach_id)
    ))
    and (workout_result_id is null or exists (
      select 1 from public.workout_results r where r.id = workout_result_id and r.athlete_id = form_reviews.athlete_id
    ))
  );

create policy "Athletes delete their form reviews" on public.form_reviews
  for delete to authenticated using (athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id()));

-- form_review_comments: coaches pin timestamped comments; athletes reply to them.
-- Replies attach only to a coach's timestamped comment (checked outside RLS to avoid policy recursion).
create function public.is_pinned_form_comment(p_comment_id uuid, p_review_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.form_review_comments c
    where c.id = p_comment_id and c.review_id = p_review_id and c.parent_id is null
  );
$$;

revoke all on function public.is_pinned_form_comment(uuid, uuid) from public, anon;

grant execute on function public.is_pinned_form_comment(uuid, uuid) to authenticated, service_role;

alter table public.form_review_comments enable row level security;

revoke all on public.form_review_comments from anon, authenticated;

grant select, insert, delete on public.form_review_comments to authenticated;

grant update (body) on public.form_review_comments to authenticated;

grant all on public.form_review_comments to service_role;

create policy "Coaches read comments on their athletes' videos" on public.form_review_comments
  for select to authenticated using (coach_id = (select auth.uid()) and exists (
    select 1 from public.athletes a where a.id = athlete_id and a.coach_id = (select auth.uid())
  ));

create policy "Coaches pin comments on their athletes' videos" on public.form_review_comments
  for insert to authenticated with check (
    coach_id = (select auth.uid()) and author_id = (select auth.uid()) and parent_id is null
    and exists (select 1 from public.athletes a where a.id = athlete_id and a.coach_id = (select auth.uid()))
  );

create policy "Coaches edit their comments" on public.form_review_comments
  for update to authenticated using (coach_id = (select auth.uid()) and author_id = (select auth.uid()))
  with check (coach_id = (select auth.uid()) and author_id = (select auth.uid()));

create policy "Coaches delete comments on their athletes' videos" on public.form_review_comments
  for delete to authenticated using (coach_id = (select auth.uid()) and exists (
    select 1 from public.athletes a where a.id = athlete_id and a.coach_id = (select auth.uid())
  ));

create policy "Athletes read comments on their videos" on public.form_review_comments
  for select to authenticated using (athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id()));

create policy "Athletes reply to coach comments" on public.form_review_comments
  for insert to authenticated with check (
    athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id())
    and author_id = (select auth.uid())
    and parent_id is not null
    and (select public.is_pinned_form_comment(parent_id, review_id))
  );

create policy "Athletes edit their replies" on public.form_review_comments
  for update to authenticated using (athlete_id = (select public.current_athlete_id()) and author_id = (select auth.uid()))
  with check (athlete_id = (select public.current_athlete_id()) and author_id = (select auth.uid()));

create policy "Athletes delete their replies" on public.form_review_comments
  for delete to authenticated using (athlete_id = (select public.current_athlete_id()) and author_id = (select auth.uid()));

-- athlete_movement_cues: coaches write a personal cue; athletes read theirs.
alter table public.athlete_movement_cues enable row level security;

revoke all on public.athlete_movement_cues from anon, authenticated;

grant select, insert, update, delete on public.athlete_movement_cues to authenticated;

grant all on public.athlete_movement_cues to service_role;

create policy "Coaches manage their athletes' cues" on public.athlete_movement_cues
  for all to authenticated using (coach_id = (select auth.uid()) and exists (
    select 1 from public.athletes a where a.id = athlete_id and a.coach_id = (select auth.uid())
  )) with check (coach_id = (select auth.uid()) and exists (
    select 1 from public.athletes a where a.id = athlete_id and a.coach_id = (select auth.uid())
  ) and exists (
    select 1 from public.movements m where m.id = movement_id and (m.coach_id is null or m.coach_id = (select auth.uid()))
  ));

create policy "Athletes read their cues" on public.athlete_movement_cues
  for select to authenticated using (athlete_id = (select public.current_athlete_id())
    and coach_id = (select public.current_athlete_coach_id()));

-- Private bucket: <coach_id>/<athlete_id>/<uuid>.<ext>, 100 MB, phone video formats only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('form-videos', 'form-videos', false, 104857600, array['video/mp4', 'video/quicktime', 'video/webm']);

create policy "Coaches select form videos" on storage.objects
  for select to authenticated using (
    bucket_id = 'form-videos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.athletes a where a.id::text = (storage.foldername(objects.name))[2]
        and a.coach_id = (select auth.uid())
    )
  );

create policy "Coaches delete form videos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'form-videos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.athletes a where a.id::text = (storage.foldername(objects.name))[2]
        and a.coach_id = (select auth.uid())
    )
  );

create policy "Athletes insert form videos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'form-videos'
    and (storage.foldername(name))[1] = (select public.current_athlete_coach_id())::text
    and (storage.foldername(name))[2] = (select public.current_athlete_id())::text
    and name ~ '^[a-f0-9-]+/[a-f0-9-]+/[a-f0-9-]{36}\.(mp4|mov|webm)$'
  );

create policy "Athletes select form videos" on storage.objects
  for select to authenticated using (
    bucket_id = 'form-videos'
    and (storage.foldername(name))[1] = (select public.current_athlete_coach_id())::text
    and (storage.foldername(name))[2] = (select public.current_athlete_id())::text
  );

create policy "Athletes delete form videos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'form-videos'
    and (storage.foldername(name))[1] = (select public.current_athlete_coach_id())::text
    and (storage.foldername(name))[2] = (select public.current_athlete_id())::text
  );
