-- Run against a migrated local database only.
begin;
set local storage.allow_delete_query = 'true';
insert into auth.users (id, email, raw_user_meta_data) values
  ('38000000-0000-0000-0000-000000000001', 'fit38-coach1@test.local', '{}'),
  ('38000000-0000-0000-0000-000000000002', 'fit38-coach2@test.local', '{}'),
  ('38000000-0000-0000-0000-000000000003', 'fit38-a@test.local', '{}'),
  ('38000000-0000-0000-0000-000000000004', 'fit38-b@test.local', '{}'),
  ('38000000-0000-0000-0000-000000000005', 'fit38-c@test.local', '{}');
insert into public.athletes (id, coach_id, user_id, first_name, last_name) values
  ('38000000-0000-0000-0000-000000000011', '38000000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-000000000003', 'Athlete', 'A'),
  ('38000000-0000-0000-0000-000000000012', '38000000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-000000000004', 'Athlete', 'B'),
  ('38000000-0000-0000-0000-000000000013', '38000000-0000-0000-0000-000000000002', '38000000-0000-0000-0000-000000000005', 'Athlete', 'C');
insert into public.movements (id, coach_id, name, category) values
  ('38000000-0000-0000-0000-000000000021', '38000000-0000-0000-0000-000000000001', 'FIT38 Snatch', 'weightlifting'),
  ('38000000-0000-0000-0000-000000000022', '38000000-0000-0000-0000-000000000002', 'FIT38 Other gym lift', 'weightlifting');
do $$ begin
  assert (select not public and file_size_limit = 104857600
    and allowed_mime_types = array['video/mp4','video/quicktime','video/webm']
    from storage.buckets where id = 'form-videos'), 'private 100 MB video bucket';
  assert (select has_table_privilege('service_role', 'public.form_reviews', 'select')
    and has_table_privilege('authenticated', 'public.form_review_comments', 'insert')
    and has_table_privilege('authenticated', 'public.athlete_movement_cues', 'update')
    and not has_table_privilege('anon', 'public.form_reviews', 'select')), 'explicit grants';
  raise notice 'PASS: private bucket and grants';
end $$;

-- Athlete A uploads.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"38000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
insert into storage.objects (bucket_id, name) values
  ('form-videos', '38000000-0000-0000-0000-000000000001/38000000-0000-0000-0000-000000000011/aaaaaaaa-0000-0000-0000-000000000001.mp4');
insert into public.form_reviews (id, coach_id, athlete_id, storage_path, content_type, size_bytes, duration_seconds, recorded_on, movement_id, set_label, question)
values ('38000000-0000-0000-0000-000000000031', '38000000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-000000000011',
  '38000000-0000-0000-0000-000000000001/38000000-0000-0000-0000-000000000011/aaaaaaaa-0000-0000-0000-000000000001.mp4',
  'video/mp4', 5000000, 42.5, current_date, '38000000-0000-0000-0000-000000000021', 'Set 3', 'Is my bar path ok?');
select public.create_notification('38000000-0000-0000-0000-000000000011', 'form_check', 'New form check', null, '/form-checks/x', 'form-check:38000000-0000-0000-0000-000000000031');
select public.create_notification('38000000-0000-0000-0000-000000000011', 'form_check', 'New form check again', null, '/form-checks/x', 'form-check:38000000-0000-0000-0000-000000000031');
do $$ declare n integer; begin
  assert (select count(*) from public.form_reviews) = 1, 'athlete sees own review';
  assert (select status from public.form_reviews) = 'awaiting_review', 'starts awaiting review';
  begin
    insert into storage.objects (bucket_id, name) values ('form-videos', '38000000-0000-0000-0000-000000000001/38000000-0000-0000-0000-000000000012/aaaaaaaa-0000-0000-0000-000000000002.mp4');
    raise exception 'operation unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('form-videos', '38000000-0000-0000-0000-000000000001/38000000-0000-0000-0000-000000000011/aaaaaaaa-0000-0000-0000-000000000003.exe');
    raise exception 'operation unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.form_reviews (coach_id, athlete_id, storage_path, content_type, size_bytes, duration_seconds, recorded_on)
    values ('38000000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-000000000011', '38000000-0000-0000-0000-000000000001/38000000-0000-0000-0000-000000000011/aaaaaaaa-0000-0000-0000-000000000004.mp4', 'video/mp4', 104857601, 30, current_date);
    raise exception 'operation unexpectedly allowed';
  exception when check_violation then null;
  end;
  begin
    insert into public.form_reviews (coach_id, athlete_id, storage_path, content_type, size_bytes, duration_seconds, recorded_on)
    values ('38000000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-000000000011', '38000000-0000-0000-0000-000000000001/38000000-0000-0000-0000-000000000011/aaaaaaaa-0000-0000-0000-000000000004.mp4', 'video/mp4', 1000, 61, current_date);
    raise exception 'operation unexpectedly allowed';
  exception when check_violation then null;
  end;
  begin
    insert into public.form_reviews (coach_id, athlete_id, storage_path, content_type, size_bytes, duration_seconds, recorded_on)
    values ('38000000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-000000000011', '38000000-0000-0000-0000-000000000001/38000000-0000-0000-0000-000000000011/aaaaaaaa-0000-0000-0000-000000000004.avi', 'video/x-msvideo', 1000, 30, current_date);
    raise exception 'operation unexpectedly allowed';
  exception when check_violation then null;
  end;
  begin
    insert into public.form_reviews (coach_id, athlete_id, storage_path, content_type, size_bytes, duration_seconds, recorded_on)
    values ('38000000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-000000000012', '38000000-0000-0000-0000-000000000001/38000000-0000-0000-0000-000000000012/aaaaaaaa-0000-0000-0000-000000000004.mp4', 'video/mp4', 1000, 30, current_date);
    raise exception 'operation unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.form_reviews (coach_id, athlete_id, storage_path, content_type, size_bytes, duration_seconds, recorded_on, movement_id)
    values ('38000000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-000000000011', '38000000-0000-0000-0000-000000000001/38000000-0000-0000-0000-000000000011/aaaaaaaa-0000-0000-0000-000000000004.mp4', 'video/mp4', 1000, 30, current_date, '38000000-0000-0000-0000-000000000022');
    raise exception 'operation unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.form_reviews (coach_id, athlete_id, storage_path, content_type, size_bytes, duration_seconds, recorded_on, status)
    values ('38000000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-000000000011', '38000000-0000-0000-0000-000000000001/38000000-0000-0000-0000-000000000011/aaaaaaaa-0000-0000-0000-000000000004.mp4', 'video/mp4', 1000, 30, current_date, 'reviewed');
    raise exception 'operation unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  update public.form_reviews set status = 'reviewed';
  get diagnostics n = row_count;
  assert n = 0, 'athlete cannot mark own video reviewed';
  begin
    insert into public.form_review_comments (review_id, coach_id, athlete_id, at_seconds, body)
    values ('38000000-0000-0000-0000-000000000031', '38000000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-000000000011', 3, 'Athletes cannot pin');
    raise exception 'operation unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_notification('38000000-0000-0000-0000-000000000011', 'form_reviewed', 'Self reviewed');
    raise exception 'athlete sent form_reviewed';
  exception when raise_exception then
    if sqlerrm <> 'invalid_notification_kind' then raise; end if;
  end;
  raise notice 'PASS: athlete upload, path/size/duration/MIME/movement checks, no self-review';
end $$;

-- Coach 1 reviews.
select set_config('request.jwt.claims', '{"sub":"38000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into public.form_review_comments (id, review_id, coach_id, athlete_id, at_seconds, body)
values ('38000000-0000-0000-0000-000000000041', '38000000-0000-0000-0000-000000000031', '38000000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-000000000011', 12.3, 'Hips rise early here.');
update public.form_reviews set status = 'reviewed' where id = '38000000-0000-0000-0000-000000000031';
insert into public.athlete_movement_cues (athlete_id, movement_id, coach_id, cue)
values ('38000000-0000-0000-0000-000000000011', '38000000-0000-0000-0000-000000000021', '38000000-0000-0000-0000-000000000001', 'Chest up off the floor.');
select public.create_notification('38000000-0000-0000-0000-000000000011', 'form_reviewed', 'Feedback ready', null, '/athlete/form-checks/x', 'form-reviewed:38000000-0000-0000-0000-000000000031');
do $$ declare n integer; begin
  assert (select count(*) from public.form_reviews) = 1, 'coach sees athlete review';
  assert (select reviewed_at is not null from public.form_reviews), 'reviewed stamp';
  assert (select count(*) from public.notifications where kind = 'form_check') = 1, 'coach notified once (deduped)';
  assert (select count(*) from storage.objects where bucket_id = 'form-videos') = 1, 'coach sees athlete file';
  begin
    update public.form_reviews set storage_path = '38000000-0000-0000-0000-000000000001/38000000-0000-0000-0000-000000000011/aaaaaaaa-0000-0000-0000-000000000009.mp4';
    raise exception 'operation unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.form_review_comments (review_id, coach_id, athlete_id, at_seconds, body)
    values ('38000000-0000-0000-0000-000000000031', '38000000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-000000000011', 5, repeat('x', 1001));
    raise exception 'operation unexpectedly allowed';
  exception when check_violation then null;
  end;
  begin
    insert into public.form_review_comments (review_id, coach_id, athlete_id, at_seconds, body)
    values ('38000000-0000-0000-0000-000000000031', '38000000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-000000000011', null, 'No timestamp');
    raise exception 'operation unexpectedly allowed';
  exception when check_violation then null;
  end;
  begin
    insert into public.athlete_movement_cues (athlete_id, movement_id, coach_id, cue)
    values ('38000000-0000-0000-0000-000000000011', '38000000-0000-0000-0000-000000000022', '38000000-0000-0000-0000-000000000001', 'Other gym movement');
    raise exception 'operation unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS: coach comments, review stamp, cue, notification dedupe';
end $$;

-- Coach 2 and athlete C (other gym) see nothing.
select set_config('request.jwt.claims', '{"sub":"38000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
do $$ declare n integer; begin
  assert (select count(*) from public.form_reviews) = 0, 'coach isolation reviews';
  assert (select count(*) from public.form_review_comments) = 0, 'coach isolation comments';
  assert (select count(*) from public.athlete_movement_cues) = 0, 'coach isolation cues';
  assert (select count(*) from storage.objects where bucket_id = 'form-videos') = 0, 'coach isolation files';
  update public.form_reviews set status = 'awaiting_review';
  get diagnostics n = row_count;
  assert n = 0, 'other coach cannot update';
  delete from public.form_reviews;
  get diagnostics n = row_count;
  assert n = 0, 'other coach cannot delete';
  delete from storage.objects where bucket_id = 'form-videos';
  get diagnostics n = row_count;
  assert n = 0, 'other coach cannot delete files';
  begin
    insert into public.form_review_comments (review_id, coach_id, athlete_id, at_seconds, body)
    values ('38000000-0000-0000-0000-000000000031', '38000000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-000000000011', 3, 'Stranger');
    raise exception 'operation unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_notification('38000000-0000-0000-0000-000000000011', 'form_reviewed', 'Stranger');
    raise exception 'stranger notification allowed';
  exception when raise_exception then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
  raise notice 'PASS: other coach isolation';
end $$;

-- Athlete B (same gym) sees nothing of A's.
select set_config('request.jwt.claims', '{"sub":"38000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
do $$ declare n integer; begin
  assert (select count(*) from public.form_reviews) = 0, 'same-gym athlete isolation reviews';
  assert (select count(*) from public.form_review_comments) = 0, 'same-gym athlete isolation comments';
  assert (select count(*) from public.athlete_movement_cues) = 0, 'same-gym athlete isolation cues';
  assert (select count(*) from storage.objects where bucket_id = 'form-videos') = 0, 'same-gym athlete isolation files';
  delete from public.form_reviews;
  get diagnostics n = row_count;
  assert n = 0, 'other athlete cannot delete';
  begin
    insert into public.form_review_comments (review_id, coach_id, athlete_id, parent_id, body)
    values ('38000000-0000-0000-0000-000000000031', '38000000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-000000000011', '38000000-0000-0000-0000-000000000041', 'Not mine');
    raise exception 'operation unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS: same-gym athlete isolation';
end $$;

-- Athlete A sees feedback, replies, then deletes (file first, then row).
select set_config('request.jwt.claims', '{"sub":"38000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
insert into public.form_review_comments (review_id, coach_id, athlete_id, parent_id, body)
values ('38000000-0000-0000-0000-000000000031', '38000000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-000000000011', '38000000-0000-0000-0000-000000000041', 'Thanks, will fix!');
do $$ begin
  assert (select status from public.form_reviews) = 'reviewed', 'athlete sees reviewed';
  assert (select count(*) from public.form_review_comments) = 2, 'athlete sees comment + reply';
  assert (select count(*) from public.athlete_movement_cues) = 1, 'athlete sees cue';
  assert (select count(*) from public.notifications where kind = 'form_reviewed') = 1, 'athlete notified';
  begin
    insert into public.form_review_comments (review_id, coach_id, athlete_id, parent_id, at_seconds, body)
    values ('38000000-0000-0000-0000-000000000031', '38000000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-000000000011', '38000000-0000-0000-0000-000000000041', 2, 'Reply with time');
    raise exception 'operation unexpectedly allowed';
  exception when check_violation then null;
  end;
  begin
    update public.athlete_movement_cues set cue = 'Self cue';
    if found then raise exception 'athlete edited cue'; end if;
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS: athlete sees review, replies, cue read-only';
end $$;
delete from storage.objects where bucket_id = 'form-videos';
delete from public.form_reviews where id = '38000000-0000-0000-0000-000000000031';
do $$ begin
  assert (select count(*) from public.form_reviews) = 0, 'athlete deleted review';
  assert (select count(*) from public.form_review_comments) = 0, 'comments cascade';
  reset role;
  assert (select count(*) from storage.objects where bucket_id = 'form-videos') = 0, 'file deleted';
  raise notice 'PASS: athlete delete removes file and row';
end $$;

-- Coach can delete their athlete's video too.
select set_config('request.jwt.claims', '{"sub":"38000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;
insert into storage.objects (bucket_id, name) values
  ('form-videos', '38000000-0000-0000-0000-000000000001/38000000-0000-0000-0000-000000000011/aaaaaaaa-0000-0000-0000-000000000005.webm');
insert into public.form_reviews (coach_id, athlete_id, storage_path, content_type, size_bytes, duration_seconds, recorded_on, question)
values ('38000000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-000000000011',
  '38000000-0000-0000-0000-000000000001/38000000-0000-0000-0000-000000000011/aaaaaaaa-0000-0000-0000-000000000005.webm', 'video/webm', 1000, 60, current_date, 'Standalone question');
select set_config('request.jwt.claims', '{"sub":"38000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
delete from storage.objects where bucket_id = 'form-videos';
delete from public.form_reviews;
do $$ begin
  reset role;
  assert (select count(*) from public.form_reviews) = 0, 'coach deleted review';
  assert (select count(*) from storage.objects where bucket_id = 'form-videos') = 0, 'coach deleted file';
  raise notice 'PASS: coach delete removes file and row';
end $$;

-- Archived athletes lose access; anon has none.
update public.athletes set status = 'archived' where id = '38000000-0000-0000-0000-000000000011';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"38000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.athlete_movement_cues) = 0, 'archived athlete has no cue access';
  begin
    insert into storage.objects (bucket_id, name) values ('form-videos', '38000000-0000-0000-0000-000000000001/38000000-0000-0000-0000-000000000011/aaaaaaaa-0000-0000-0000-000000000006.mp4');
    raise exception 'operation unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS: inactive athlete blocked';
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform * from public.form_reviews;
    raise exception 'operation unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS: anon blocked';
end $$;
rollback;
