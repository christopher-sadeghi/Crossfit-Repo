alter type public.suggestion_type add value if not exists 'movement_guide';

alter table public.movements add column demo_video_url text
  check (demo_video_url is null or (demo_video_url ~ '^https://[^[:space:]]+$' and length(demo_video_url) <= 2048));

create table public.movement_guides (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches (id) on delete cascade,
  movement_id uuid not null references public.movements (id) on delete cascade,
  video_url text check (video_url is null or (video_url ~ '^https://[^[:space:]]+$' and length(video_url) <= 2048)),
  cues text[] not null default '{}',
  common_mistakes text[] not null default '{}',
  easier_versions text[] not null default '{}',
  harder_versions text[] not null default '{}',
  ai_suggestion_id uuid references public.ai_suggestions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_id, movement_id)
);

create index movement_guides_movement_id_idx on public.movement_guides (movement_id);
create trigger set_updated_at before update on public.movement_guides
  for each row execute function public.set_updated_at();

alter table public.movement_guides enable row level security;
create policy "Coaches manage their own rows" on public.movement_guides
  for all to authenticated
  using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()));
create policy "Only library or own movements (insert)" on public.movement_guides as restrictive
  for insert to authenticated with check (
    exists (select 1 from public.movements m where m.id = movement_id
      and (m.coach_id is null or m.coach_id = (select auth.uid())))
  );
create policy "Only library or own movements (update)" on public.movement_guides as restrictive
  for update to authenticated using (true) with check (
    exists (select 1 from public.movements m where m.id = movement_id
      and (m.coach_id is null or m.coach_id = (select auth.uid())))
  );
create policy "Athletes can view their coach's guides" on public.movement_guides
  for select to authenticated using (coach_id = (select public.current_athlete_coach_id()));

grant select, insert, update, delete on public.movement_guides to authenticated;
grant all on public.movement_guides to service_role;

update public.movements as m set demo_video_url = v.url
from (values
  ('Back Squat', 'https://www.youtube.com/watch?v=QmZAiBqPvZw'),
  ('Front Squat', 'https://www.youtube.com/watch?v=uYumuL_G_V0'),
  ('Overhead Squat', 'https://www.youtube.com/watch?v=pn8mqlG0nkE'),
  ('Deadlift', 'https://www.youtube.com/watch?v=1ZXobu7JvvE'),
  ('Sumo Deadlift High Pull', 'https://www.youtube.com/watch?v=gh55vVlwlQg'),
  ('Strict Press', 'https://www.youtube.com/watch?v=Y5xpE2K660s'),
  ('Push Press', 'https://www.youtube.com/watch?v=iaBVSJm78ko'),
  ('Push Jerk', 'https://www.youtube.com/watch?v=VrHNJXoSyXw'),
  ('Split Jerk', 'https://www.youtube.com/watch?v=GUDkOtraHHY'),
  ('Bench Press', 'https://www.youtube.com/watch?v=SCVCLChPQFY'),
  ('Power Clean', 'https://www.youtube.com/watch?v=KwYJTpQ_x5A'),
  ('Squat Clean', 'https://www.youtube.com/watch?v=7A-QEbSMhJs'),
  ('Hang Power Clean', 'https://www.youtube.com/watch?v=0aP3tgKZcHQ'),
  ('Clean and Jerk', 'https://www.youtube.com/watch?v=PjY1rH4_MOA'),
  ('Power Snatch', 'https://www.youtube.com/watch?v=TL8SMp7RdXQ'),
  ('Squat Snatch', 'https://www.youtube.com/watch?v=Iy0vPROslAA'),
  ('Hang Power Snatch', 'https://www.youtube.com/watch?v=-mLzQdVAwlw'),
  ('Thruster', 'https://www.youtube.com/watch?v=L219ltL15zk'),
  ('Clusters', 'https://www.youtube.com/watch?v=plCzO45g9nc'),
  ('Kettlebell Swing', 'https://www.youtube.com/watch?v=mKDIuUbH94Q'),
  ('Goblet Squat', 'https://www.youtube.com/watch?v=f-Vf2yRRqOg'),
  ('Dumbbell Snatch', 'https://www.youtube.com/watch?v=R0mhHuVrLHA'),
  ('Dumbbell Thruster', 'https://www.youtube.com/watch?v=u3wKkZjE8QM'),
  ('Wall Ball', 'https://www.youtube.com/watch?v=fpUD0mcFp_0'),
  ('Front Rack Lunge', 'https://www.youtube.com/watch?v=f3WLs_HutLw'),
  ('Turkish Get-Up', 'https://www.youtube.com/watch?v=-_zTytmHM94'),
  ('Pull-Up', 'https://www.youtube.com/watch?v=aAggnpPyR6E'),
  ('Chest-to-Bar Pull-Up', 'https://www.youtube.com/watch?v=AyPTCEXTjOo'),
  ('Bar Muscle-Up', 'https://www.youtube.com/watch?v=OCg3UXgzftc'),
  ('Ring Muscle-Up', 'https://www.youtube.com/watch?v=_GZW0WYftWA'),
  ('Ring Row', 'https://www.youtube.com/watch?v=sEAOZc77wk8'),
  ('Toes-to-Bar', 'https://www.youtube.com/watch?v=6dHvTlsMvNY'),
  ('Knees-to-Elbows', 'https://www.youtube.com/watch?v=6cKohUNjMt0'),
  ('Push-Up', 'https://www.youtube.com/watch?v=0pkjOk0EiAk'),
  ('Hand-Release Push-Up', 'https://www.youtube.com/watch?v=kfnMuP5JgIw'),
  ('Ring Dip', 'https://www.youtube.com/watch?v=EznLCDBAPIU'),
  ('Handstand Push-Up', 'https://www.youtube.com/watch?v=9wIkPCS4Mbo'),
  ('Strict Handstand Push-Up', 'https://www.youtube.com/watch?v=0wDEO6shVjc'),
  ('Handstand Walk', 'https://www.youtube.com/watch?v=FdgJ9jZIT-Q'),
  ('Pistol', 'https://www.youtube.com/watch?v=qDcniqddTeE'),
  ('Air Squat', 'https://www.youtube.com/watch?v=rMvwVtlqjTE'),
  ('Burpee', 'https://www.youtube.com/watch?v=auBLPXO8Fww'),
  ('Burpee Box Jump-Over', 'https://www.youtube.com/watch?v=GLktGkmcvWE'),
  ('Box Jump', 'https://www.youtube.com/watch?v=NBY9-kTuHEk'),
  ('Box Step-Up', 'https://www.youtube.com/watch?v=5qjqDHOUh-A'),
  ('Sit-Up', 'https://www.youtube.com/watch?v=8Ax9H9VPdm4'),
  ('GHD Sit-Up', 'https://www.youtube.com/watch?v=1pbZ8mX2D1U'),
  ('Rope Climb', 'https://www.youtube.com/watch?v=Pa4QUC9AvuA'),
  ('Walking Lunge', 'https://www.youtube.com/watch?v=DlhojghkaQ0'),
  ('Plank', 'https://www.youtube.com/watch?v=sZxrs3C209k'),
  ('Run', null),
  ('Row', 'https://www.youtube.com/watch?v=S7HEm-fd534'),
  ('Bike Erg', 'https://www.youtube.com/watch?v=dPv58nB0Bjw'),
  ('Assault Bike', 'https://www.youtube.com/watch?v=mY9ihujdkc0'),
  ('Ski Erg', 'https://www.youtube.com/watch?v=B0lIgT5PHc8'),
  ('Double-Under', 'https://www.youtube.com/watch?v=82jNjDS19lg'),
  ('Single-Under', 'https://www.youtube.com/watch?v=hCuXYrTOMxI'),
  ('Swim', 'https://www.youtube.com/watch?v=oD_8MCB2YqM'),
  ('Sled Push', 'https://www.youtube.com/watch?v=QwscR2BhdEg'),
  ('Farmers Carry', 'https://www.youtube.com/watch?v=5whPRPdrEiY'),
  ('Sandbag Carry', 'https://www.youtube.com/watch?v=DZtrqfa7Whg'),
  ('Med Ball Clean', 'https://www.youtube.com/watch?v=KVGhkHSrDJo')
) as v(name, url)
where m.coach_id is null and m.name = v.name;
