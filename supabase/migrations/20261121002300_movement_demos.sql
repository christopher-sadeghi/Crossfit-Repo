alter table public.movements
  add column demo_cues text[] not null default '{}',
  add column demo_common_faults text[] not null default '{}',
  add column easier_movement_id uuid references public.movements (id) on delete set null,
  add column harder_movement_id uuid references public.movements (id) on delete set null;

alter table public.movement_guides
  add column clip_path text check (
    clip_path is null or clip_path ~ ('^' || coach_id || '/' || movement_id || '/[a-f0-9-]+\.(mp4|webm)$')
  ),
  add column easier_movement_id uuid references public.movements (id) on delete set null,
  add column harder_movement_id uuid references public.movements (id) on delete set null;

create index movements_easier_movement_idx on public.movements (easier_movement_id);
create index movements_harder_movement_idx on public.movements (harder_movement_id);
create index movement_guides_easier_movement_idx on public.movement_guides (easier_movement_id);
create index movement_guides_harder_movement_idx on public.movement_guides (harder_movement_id);
create index movement_guides_clip_path_idx on public.movement_guides (clip_path) where clip_path is not null;

create function public.check_movement_demo_variations() returns trigger
language plpgsql set search_path = ''
as $$
declare
  movement_id uuid;
  variation_id uuid;
begin
  if tg_table_name = 'movements' then
    movement_id := new.id;
  else
    movement_id := new.movement_id;
  end if;
  if new.easier_movement_id = new.harder_movement_id then
    raise exception 'Use different easier and harder movements.' using errcode = '23514';
  end if;
  foreach variation_id in array array[new.easier_movement_id, new.harder_movement_id] loop
    if variation_id is not null and (variation_id = movement_id or not exists (
      select 1 from public.movements m where m.id = variation_id
        and (m.coach_id is null or m.coach_id = new.coach_id)
    )) then
      raise exception 'Choose another movement in your library.' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.check_movement_demo_variations() from public, anon, authenticated;

create trigger check_movement_demo_variations
  before insert or update of id, coach_id, easier_movement_id, harder_movement_id on public.movements
  for each row execute function public.check_movement_demo_variations();
create trigger check_movement_demo_variations
  before insert or update of movement_id, coach_id, easier_movement_id, harder_movement_id on public.movement_guides
  for each row execute function public.check_movement_demo_variations();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('movement-demos', 'movement-demos', false, 20971520, array['video/mp4', 'video/webm']);

create policy "Coaches can upload movement demos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'movement-demos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.coaches where id = (select auth.uid()))
    and exists (
      select 1 from public.movements m where m.id::text = (storage.foldername(objects.name))[2]
        and (m.coach_id is null or m.coach_id = (select auth.uid()))
    )
    and name ~ '^[a-f0-9-]+/[a-f0-9-]+/[a-f0-9-]+\.(mp4|webm)$'
  );
create policy "Coaches can read their movement demos" on storage.objects
  for select to authenticated using (
    bucket_id = 'movement-demos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.coaches where id = (select auth.uid()))
  );
create policy "Coaches can delete unused movement demos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'movement-demos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.coaches where id = (select auth.uid()))
    and not exists (select 1 from public.movement_guides g where g.clip_path = objects.name)
  );
create policy "Athletes can read their coach's published movement demos" on storage.objects
  for select to authenticated using (
    bucket_id = 'movement-demos'
    and (storage.foldername(name))[1] = (select public.current_athlete_coach_id())::text
    and exists (
      select 1 from public.movement_guides g
      join public.movements m on m.id = g.movement_id
      where g.clip_path = objects.name and g.coach_id = (select public.current_athlete_coach_id())
    )
  );

update public.movements as m
set demo_video_url = null,
    demo_cues = v.cues,
    demo_common_faults = v.faults,
    easier_movement_id = easier.id,
    harder_movement_id = harder.id
from (values
  ('Back Squat', array['Brace before you unrack', 'Sit between your hips', 'Drive through your whole foot'], array['Heels rising', 'Knees collapsing inward'], 'Goblet Squat', 'Front Squat'),
  ('Front Squat', array['Rest the bar on your shoulders', 'Keep elbows high', 'Keep pressure over midfoot'], array['Elbows dropping', 'Torso folding forward'], 'Goblet Squat', 'Overhead Squat'),
  ('Overhead Squat', array['Lock elbows and press up', 'Sit between your hips', 'Keep the bar over midfoot'], array['Bar drifting forward', 'Soft elbows'], 'Front Squat', 'Squat Snatch'),
  ('Deadlift', array['Brace and pull slack out of the bar', 'Push through the floor', 'Stand tall without leaning back'], array['Bar drifting forward', 'Hips shooting up early'], 'Kettlebell Swing', 'Power Clean'),
  ('Sumo Deadlift High Pull', array['Take a wide stance with knees over toes', 'Extend the hips before pulling', 'Guide the bar down before bending the knees'], array['Early arm pull', 'Knees collapsing inward'], 'Deadlift', 'Power Clean'),
  ('Strict Press', array['Squeeze glutes and keep ribs down', 'Press close past your face', 'Finish with the bar over midfoot'], array['Leaning back', 'Bending the knees to start'], 'Push Press', 'Strict Handstand Push-Up'),
  ('Push Press', array['Dip straight down', 'Drive through your legs before pressing', 'Finish with locked elbows'], array['Dipping forward', 'Rebending the knees to catch'], 'Strict Press', 'Push Jerk'),
  ('Push Jerk', array['Dip and drive vertically', 'Punch up as you drop under', 'Stand fully before lowering'], array['Pressing out the catch', 'Catching on the toes'], 'Push Press', 'Split Jerk'),
  ('Split Jerk', array['Drive the bar straight up', 'Land on two tracks with a soft rear knee', 'Recover front foot first'], array['Landing on a tightrope', 'Straight rear knee'], 'Push Jerk', 'Clean and Jerk'),
  ('Bench Press', array['Plant your feet and set your shoulder blades', 'Lower under control to your chest', 'Press to straight elbows'], array['Bouncing off the chest', 'Hips lifting off the bench'], 'Push-Up', 'Ring Dip'),
  ('Power Clean', array['Push the floor away', 'Finish the leg drive before bending your arms', 'Catch high with elbows through'], array['Pulling early with arms', 'Catching with low elbows'], 'Hang Power Clean', 'Squat Clean'),
  ('Squat Clean', array['Keep the bar close off the floor', 'Pull yourself under after full extension', 'Stand from the catch with elbows high'], array['Bar looping forward', 'Collapsing in the catch'], 'Power Clean', 'Clean and Jerk'),
  ('Hang Power Clean', array['Hinge to the hang with the bar close', 'Drive tall before pulling under', 'Receive above parallel with fast elbows'], array['Dropping the chest in the hang', 'Reverse curling the bar'], 'Med Ball Clean', 'Power Clean'),
  ('Clean and Jerk', array['Finish standing from the clean', 'Settle your feet before dipping', 'Catch the jerk securely before recovering'], array['Rushing the dip', 'Unstable overhead catch'], 'Power Clean', 'Squat Snatch'),
  ('Power Snatch', array['Start balanced over midfoot', 'Finish the drive with the bar close', 'Punch to locked arms in a high catch'], array['Bar swinging away', 'Soft elbows in the catch'], 'Hang Power Snatch', 'Squat Snatch'),
  ('Squat Snatch', array['Keep shoulders over the bar in the first pull', 'Drive tall then pull under', 'Stabilize overhead before standing'], array['Early arm bend', 'Bar forward at the bottom'], 'Power Snatch', 'Overhead Squat'),
  ('Hang Power Snatch', array['Set your back and hinge to the hang', 'Keep the bar close through the drive', 'Catch overhead with locked elbows'], array['Jumping forward', 'Pulling before extending'], 'Dumbbell Snatch', 'Power Snatch'),
  ('Thruster', array['Keep elbows up into the squat', 'Drive out of the bottom before pressing', 'Lower to the rack before the next squat'], array['Pressing too early', 'Bar dropping straight into the squat'], 'Dumbbell Thruster', 'Clusters'),
  ('Clusters', array['Reset your brace at the floor', 'Catch the clean in a balanced squat', 'Drive out of the squat into the press'], array['Pulling with a rounded back', 'Pausing after the squat to strict press'], 'Thruster', 'Clean and Jerk'),
  ('Kettlebell Swing', array['Hinge with soft knees', 'Snap your hips to float the bell', 'Let the bell return before hinging again'], array['Squatting instead of hinging', 'Lifting the bell with your arms'], 'Deadlift', 'Dumbbell Snatch'),
  ('Goblet Squat', array['Hold the weight close to your chest', 'Brace and keep your heels grounded', 'Stand without shifting forward'], array['Weight drifting away', 'Knees caving in'], 'Air Squat', 'Front Squat'),
  ('Dumbbell Snatch', array['Center the dumbbell between your feet', 'Drive with your legs and keep it close', 'Punch overhead to a stable finish'], array['Curling with the arm', 'Twisting through the lower back'], 'Kettlebell Swing', 'Hang Power Snatch'),
  ('Dumbbell Thruster', array['Rack dumbbells at the shoulders', 'Drive out of the squat with your legs', 'Finish both bells overhead together'], array['Pressing from the bottom', 'Finishing unevenly'], 'Wall Ball', 'Thruster'),
  ('Wall Ball', array['Hold the ball high at your chest', 'Stand explosively and throw up', 'Catch softly before the next squat'], array['Throwing from low at the waist', 'Chasing the ball forward'], 'Goblet Squat', 'Dumbbell Thruster'),
  ('Front Rack Lunge', array['Brace with elbows lifted', 'Lower the back knee with control', 'Push through the front foot to stand'], array['Front knee caving in', 'Feet crossing the midline'], 'Walking Lunge', 'Pistol'),
  ('Turkish Get-Up', array['Keep your eyes on the bell until upright', 'Press the bell over a locked elbow', 'Move through each position before the next'], array['Bending the loaded elbow', 'Rushing the leg sweep'], 'Plank', 'Overhead Squat'),
  ('Pull-Up', array['Start from a controlled hang', 'Drive elbows toward your ribs', 'Lower all the way with control'], array['Reaching with your chin', 'Cutting the lowering phase short'], 'Ring Row', 'Chest-to-Bar Pull-Up'),
  ('Chest-to-Bar Pull-Up', array['Stay active in the hang', 'Pull elbows back to bring chest to bar', 'Control the return into the next rep'], array['Pulling straight up without opening the chest', 'Losing shoulder tension'], 'Pull-Up', 'Bar Muscle-Up'),
  ('Bar Muscle-Up', array['Build a controlled swing', 'Drive hips toward the bar', 'Turn both elbows over together'], array['One elbow coming over first', 'Pulling too early'], 'Chest-to-Bar Pull-Up', 'Ring Muscle-Up'),
  ('Ring Muscle-Up', array['Keep the rings close on the pull', 'Turn the shoulders over the rings together', 'Finish in stable support'], array['Rings drifting apart', 'Rushing the transition'], 'Bar Muscle-Up', 'Strict Handstand Push-Up'),
  ('Ring Row', array['Keep a straight line from shoulders to heels', 'Pull rings to your ribs', 'Lower with control to straight elbows'], array['Hips sagging', 'Shrugging at the top'], 'Plank', 'Pull-Up'),
  ('Toes-to-Bar', array['Start with active shoulders', 'Press the bar down as the knees rise', 'Bring both feet up together'], array['Swinging without control', 'Dropping the legs early'], 'Knees-to-Elbows', 'Ring Muscle-Up'),
  ('Knees-to-Elbows', array['Keep the shoulders active', 'Curl the hips as you lift your knees', 'Lower without dropping into the hang'], array['Only lifting the thighs', 'Losing grip or shoulder tension'], 'Sit-Up', 'Toes-to-Bar'),
  ('Push-Up', array['Brace in a straight plank', 'Lower chest and hips together', 'Press to full elbow extension'], array['Hips sagging', 'Elbows flaring hard'], 'Plank', 'Hand-Release Push-Up'),
  ('Hand-Release Push-Up', array['Lower chest and thighs together', 'Lift both hands briefly without arching', 'Press the whole body off the floor together'], array['Peeling the chest up first', 'Hands shifting wider each rep'], 'Push-Up', 'Ring Dip'),
  ('Ring Dip', array['Set the rings close to your sides', 'Lower with control', 'Press back to locked support'], array['Rings flaring outward', 'Dropping into the bottom'], 'Hand-Release Push-Up', 'Ring Muscle-Up'),
  ('Handstand Push-Up', array['Set a stable hand and head tripod', 'Keep pressure through your hands', 'Finish with elbows locked and ribs down'], array['Crashing onto the head', 'Arching at the finish'], 'Push-Up', 'Strict Handstand Push-Up'),
  ('Strict Handstand Push-Up', array['Keep legs together with no kick', 'Lower to a controlled tripod', 'Press straight up to a locked finish'], array['Kicking to initiate', 'Losing control of the descent'], 'Handstand Push-Up', 'Handstand Walk'),
  ('Handstand Walk', array['Push tall through the shoulders', 'Look between your hands', 'Take short controlled steps'], array['Soft shoulders', 'Overstriding with the hands'], 'Plank', 'Strict Handstand Push-Up'),
  ('Pistol', array['Reach the free leg forward', 'Keep the planted heel down', 'Drive the knee in line with your toes'], array['Rocking onto the toes', 'Knee collapsing inward'], 'Box Step-Up', 'Front Rack Lunge'),
  ('Air Squat', array['Set feet at a comfortable width', 'Sit between your hips', 'Stand with knees tracking over toes'], array['Heels lifting', 'Knees collapsing inward'], 'Box Step-Up', 'Goblet Squat'),
  ('Burpee', array['Plant hands under your shoulders', 'Lower chest and thighs to the floor', 'Bring feet back under you before standing'], array['Landing stiff legged', 'Rushing the floor position'], 'Push-Up', 'Burpee Box Jump-Over'),
  ('Burpee Box Jump-Over', array['Finish the floor portion before setting your feet', 'Land softly on the box', 'Control the descent on the far side'], array['Jumping before establishing balance', 'Landing on the edge'], 'Burpee', 'Box Jump'),
  ('Box Jump', array['Load your hips with a short dip', 'Jump with both feet', 'Land softly and step down under control'], array['Knees caving on landing', 'Clipping the front edge'], 'Box Step-Up', 'Burpee Box Jump-Over'),
  ('Box Step-Up', array['Place your whole foot on the box', 'Stand through the top leg', 'Control the step down'], array['Pushing off hard with the trailing foot', 'Knee falling inward'], 'Walking Lunge', 'Box Jump'),
  ('Sit-Up', array['Set your feet and start on your back', 'Brace as you sit up', 'Lower under control between reps'], array['Yanking on your neck', 'Bouncing the torso off the floor'], 'Plank', 'Knees-to-Elbows'),
  ('GHD Sit-Up', array['Set the pad so hips can pivot freely', 'Use only a controlled range you have trained', 'Drive the legs to return upright'], array['Dropping into untrained range', 'Relying on low-back extension'], 'Sit-Up', 'Toes-to-Bar'),
  ('Rope Climb', array['Bring knees up before setting the foot lock', 'Stand on the lock before reaching', 'Descend under control with your feet engaged'], array['Climbing entirely with your arms', 'Sliding down the rope'], 'Pull-Up', 'Ring Muscle-Up'),
  ('Walking Lunge', array['Step onto two tracks', 'Lower the back knee under control', 'Stand through the entire front foot'], array['Feet crossing', 'Knee collapsing inward'], 'Air Squat', 'Front Rack Lunge'),
  ('Plank', array['Stack elbows under shoulders', 'Squeeze glutes with ribs down', 'Breathe without losing tension'], array['Hips sagging or piking', 'Holding your breath'], 'Sit-Up', 'Push-Up'),
  ('Run', array['Keep your stride relaxed', 'Land beneath your body', 'Build pace gradually'], array['Overstriding', 'Tensing your shoulders'], 'Bike Erg', 'Double-Under'),
  ('Row', array['Drive legs before opening the torso', 'Finish with the handle at your lower ribs', 'Recover arms then body then legs'], array['Bending arms early', 'Rushing the slide back'], 'Bike Erg', 'Ski Erg'),
  ('Bike Erg', array['Set saddle height for a soft knee at the bottom', 'Keep pedal strokes smooth', 'Build cadence before adding resistance'], array['Rocking hips', 'Grinding at low cadence'], 'Row', 'Assault Bike'),
  ('Assault Bike', array['Set the seat before starting', 'Push and pull the handles evenly', 'Build pace before sprinting'], array['Hunching over the handles', 'Going all-out before settling the stroke'], 'Bike Erg', 'Sled Push'),
  ('Ski Erg', array['Start tall with hands high', 'Hinge and drive handles toward thighs', 'Return smoothly before the next pull'], array['Pulling only with your arms', 'Squatting instead of hinging'], 'Row', 'Assault Bike'),
  ('Double-Under', array['Jump tall with elbows close', 'Turn the rope from your wrists', 'Land softly in the same spot'], array['Tucking the knees', 'Swinging with wide arms'], 'Single-Under', 'Box Jump'),
  ('Single-Under', array['Use small springy jumps', 'Keep your hands just outside your hips', 'Turn the rope from your wrists'], array['Jumping too high', 'Hands drifting wide'], 'Bike Erg', 'Double-Under'),
  ('Swim', array['Keep your body long in the water', 'Exhale underwater', 'Turn to breathe without lifting your head'], array['Holding your breath', 'Letting your hips sink'], 'Row', 'Ski Erg'),
  ('Sled Push', array['Brace before you lean into the sled', 'Take short deliberate steps', 'Keep steady pressure through your arms'], array['Rounding the back', 'Taking steps too long to maintain drive'], 'Farmers Carry', 'Sandbag Carry'),
  ('Farmers Carry', array['Stand tall with the loads at your sides', 'Keep your shoulders level', 'Take short steady steps'], array['Leaning side to side', 'Letting weights swing'], 'Walking Lunge', 'Sandbag Carry'),
  ('Sandbag Carry', array['Hug the bag high against your torso', 'Brace before you stand', 'Keep steps short and steady'], array['Bag slipping low', 'Arching backwards under load'], 'Farmers Carry', 'Sled Push'),
  ('Med Ball Clean', array['Start with the ball between your feet', 'Extend legs and hips before pulling under', 'Catch the ball close in a balanced squat'], array['Curling the ball up', 'Losing balance in the catch'], 'Goblet Squat', 'Hang Power Clean')
) as v(name, cues, faults, easier, harder)
join public.movements easier on easier.coach_id is null and easier.name = v.easier
join public.movements harder on harder.coach_id is null and harder.name = v.harder
where m.coach_id is null and m.name = v.name;
