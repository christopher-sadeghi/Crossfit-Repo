begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('39000000-0000-0000-0000-000000000001', 'demo-coach-a@test.local', '{"full_name": "Coach A"}'),
  ('39000000-0000-0000-0000-000000000002', 'demo-coach-b@test.local', '{"full_name": "Coach B"}');

insert into public.athletes (coach_id, id, first_name, last_name) values
  ('39000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000006', 'Athlete', 'A'),
  ('39000000-0000-0000-0000-000000000002', '39000000-0000-0000-0000-000000000007', 'Athlete', 'B');
insert into public.athlete_invites (coach_id, athlete_id, email, token) values
  ('39000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000006', 'demo-athlete-a@test.local', '39000000-0000-0000-0000-000000000008'),
  ('39000000-0000-0000-0000-000000000002', '39000000-0000-0000-0000-000000000007', 'demo-athlete-b@test.local', '39000000-0000-0000-0000-000000000009');
insert into auth.users (id, email, raw_user_meta_data) values
  ('39000000-0000-0000-0000-000000000003', 'demo-athlete-a@test.local', '{"role":"athlete","invite_token":"39000000-0000-0000-0000-000000000008"}'),
  ('39000000-0000-0000-0000-000000000004', 'demo-athlete-b@test.local', '{"role":"athlete","invite_token":"39000000-0000-0000-0000-000000000009"}');

do $$
begin
  assert (select count(*) from public.movements where coach_id is null) >= 62, 'missing library movements';
  assert not exists (
    select 1 from public.movements where coach_id is null and
      (cardinality(demo_cues) not between 3 and 5 or cardinality(demo_common_faults) = 0 or
       easier_movement_id is null or harder_movement_id is null or demo_video_url is not null)
  ), 'the shared library should have complete text and links, with no videos';
  assert (select not public from storage.buckets where id = 'movement-demos'), 'bucket must be private';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"39000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

insert into public.movements (id, name, category)
values ('39000000-0000-0000-0000-000000000005', 'Custom Movement A', 'other');
insert into storage.objects (bucket_id, name) values
  ('movement-demos', '39000000-0000-0000-0000-000000000001/39000000-0000-0000-0000-000000000005/a.mp4'),
  ('movement-demos', '39000000-0000-0000-0000-000000000001/39000000-0000-0000-0000-000000000005/b.mp4');
insert into public.movement_guides (movement_id, clip_path, cues)
values ('39000000-0000-0000-0000-000000000005',
  '39000000-0000-0000-0000-000000000001/39000000-0000-0000-0000-000000000005/a.mp4',
  array['Set up', 'Brace', 'Move with control']);
insert into public.movement_guides (movement_id, easier_movement_id, cues)
select id, '39000000-0000-0000-0000-000000000005', array['Coach A cue 1', 'Coach A cue 2', 'Coach A cue 3']
from public.movements where coach_id is null and name = 'Back Squat';

do $$
begin
  assert (select count(*) from storage.objects where bucket_id = 'movement-demos') = 2, 'coach reads their own clips';
  delete from storage.objects where bucket_id = 'movement-demos' and name like '%/a.mp4';
  assert found = false, 'the published clip cannot be deleted while in use';
  begin
    update public.movement_guides set harder_movement_id = movement_id where clip_path is not null;
    raise exception 'self variation was accepted';
  exception when check_violation then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"39000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from storage.objects where bucket_id = 'movement-demos') = 0, 'another coach cannot read clips';
  assert (select count(*) from public.movement_guides) = 0, 'another coach cannot read gym overrides';
  begin
    insert into storage.objects (bucket_id, name) values
      ('movement-demos', '39000000-0000-0000-0000-000000000002/39000000-0000-0000-0000-000000000005/c.mp4');
    raise exception 'another coach uploaded against a private movement';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.movement_guides (movement_id, easier_movement_id)
    select id, '39000000-0000-0000-0000-000000000005' from public.movements where name = 'Back Squat' and coach_id is null;
    raise exception 'another coach linked a private movement';
  exception when check_violation then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"39000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from storage.objects where bucket_id = 'movement-demos') = 1, 'athlete can only read their coach’s published clip';
  assert (select count(*) from public.movement_guides where cues[1] = 'Coach A cue 1') = 1, 'athlete can read gym overrides';
  begin
    insert into storage.objects (bucket_id, name)
    select 'movement-demos', '39000000-0000-0000-0000-000000000003/' || id || '/c.mp4'
    from public.movements where coach_id is null and name = 'Back Squat';
    raise exception 'athlete uploaded a clip';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"39000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from storage.objects where bucket_id = 'movement-demos') = 0, 'another gym’s athlete cannot read clips';
  assert (select count(*) from public.movement_guides) = 0, 'another gym’s athlete cannot read overrides';
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  assert (select count(*) from storage.objects where bucket_id = 'movement-demos') = 0, 'anonymous users cannot read clips';
end $$;

rollback;
