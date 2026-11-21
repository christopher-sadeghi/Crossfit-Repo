-- Demo data for sales demos: 12 athletes, an 8-week program, 6 weeks of history.
-- Both functions run as the logged-in coach (security invoker), so RLS still applies.

create function public.clear_demo_data()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'You must be logged in.';
  end if;

  -- Athletes cascade to metrics, results, nutrition, goals, scalings and suggestions.
  delete from public.ai_suggestions where coach_id = uid;
  delete from public.athletes where coach_id = uid;
  delete from public.workouts where coach_id = uid;
  delete from public.programs where coach_id = uid;
  delete from public.movements where coach_id = uid;
end;
$$;

create function public.load_demo_data(reset boolean default false)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  program_start date := date_trunc('week', current_date)::date - 42;
  v_program_id uuid;
  v_workout_id uuid;
  v_athlete_id uuid;
  templates jsonb := $json$[
    {"title": "Fran", "type": "for_time", "cap": 600, "base": 300,
     "description": "21-15-9 reps for time", "movements": [
       {"name": "Thruster", "reps": 45, "load_kg": 43},
       {"name": "Pull-Up", "reps": 45}]},
    {"title": "Back Squat 5x5", "type": "strength", "base": 100,
     "description": "5 sets of 5 at a challenging weight. Rest 2-3 min.", "movements": [
       {"name": "Back Squat", "sets": 5, "reps": 5}]},
    {"title": "Cindy", "type": "amrap", "cap": 1200, "base": 16, "round_reps": 30,
     "description": "AMRAP 20 minutes", "movements": [
       {"name": "Pull-Up", "reps": 5},
       {"name": "Push-Up", "reps": 10},
       {"name": "Air Squat", "reps": 15}]},
    {"title": "Row & Burn", "type": "for_time", "cap": 1200, "base": 900, "rounds": 5,
     "description": "5 rounds for time", "movements": [
       {"name": "Row", "distance_m": 500},
       {"name": "Wall Ball", "reps": 15, "load_kg": 9},
       {"name": "Burpee", "reps": 10}]},
    {"title": "Deadlift 3x3", "type": "strength", "base": 140,
     "description": "3 sets of 3, building to a heavy triple.", "movements": [
       {"name": "Deadlift", "sets": 3, "reps": 3}]},
    {"title": "EMOM 12: Clean & Toes", "type": "emom", "cap": 720, "base": 12,
     "description": "Odd minutes: 3 power cleans. Even minutes: 12 toes-to-bar.", "movements": [
       {"name": "Power Clean", "reps": 3, "load_kg": 61},
       {"name": "Toes-to-Bar", "reps": 12}]},
    {"title": "Helen", "type": "for_time", "cap": 900, "base": 660, "rounds": 3,
     "description": "3 rounds for time", "movements": [
       {"name": "Run", "distance_m": 400},
       {"name": "Kettlebell Swing", "reps": 21, "load_kg": 24},
       {"name": "Pull-Up", "reps": 12}]},
    {"title": "Push Press 5-5-3-3-1", "type": "strength", "base": 75,
     "description": "Build across 5 sets.", "movements": [
       {"name": "Push Press", "sets": 5, "reps": 3}]},
    {"title": "The Chipper", "type": "for_time", "cap": 1800, "base": 1500,
     "description": "For time", "movements": [
       {"name": "Double-Under", "reps": 50},
       {"name": "Box Jump", "reps": 40},
       {"name": "Dumbbell Snatch", "reps": 30, "load_kg": 22.5},
       {"name": "Handstand Push-Up", "reps": 20},
       {"name": "Bar Muscle-Up", "reps": 10}]},
    {"title": "AMRAP 15: Thrusters & Box", "type": "amrap", "cap": 900, "base": 6, "round_reps": 20,
     "description": "AMRAP 15 minutes", "movements": [
       {"name": "Dumbbell Thruster", "reps": 10, "load_kg": 22.5},
       {"name": "Burpee Box Jump-Over", "reps": 10},
       {"name": "Run", "distance_m": 200}]}
  ]$json$;
  athletes jsonb := $json$[
    {"first": "Maya", "last": "Chen", "sex": "female", "born": "1994-03-12", "height": 165, "level": "advanced",
     "weight": 61, "trend": 0, "skill": "Ring muscle-up", "skill_movement": "Ring Muscle-Up"},
    {"first": "Jake", "last": "Morrison", "sex": "male", "born": "1989-07-02", "height": 183, "level": "intermediate",
     "weight": 88, "trend": -0.4,
     "injuries": "Left shoulder impingement: avoid kipping and heavy overhead work.",
     "scaling": "Strict pull-ups become ring rows; overhead pressing becomes landmine press; keep loads under 70%."},
    {"first": "Priya", "last": "Patel", "sex": "female", "born": "1997-11-20", "height": 160, "level": "beginner",
     "weight": 58, "trend": 0.15, "skill": "First strict pull-up", "skill_movement": "Pull-Up"},
    {"first": "Marcus", "last": "Johnson", "sex": "male", "born": "1991-01-15", "height": 178, "level": "competitor",
     "weight": 84, "trend": 0, "skill": "25 m unbroken handstand walk", "skill_movement": "Handstand Walk",
     "skill_metric": "unbroken distance", "skill_unit": "m", "skill_start": 10, "skill_target": 25},
    {"first": "Sofia", "last": "Rodriguez", "sex": "female", "born": "1986-05-08", "height": 168, "level": "intermediate",
     "weight": 66, "trend": -0.25,
     "injuries": "Recovering from right knee meniscus repair (cleared 4 weeks ago).",
     "scaling": "Box step-ups instead of box jumps; squat to a box at parallel; row instead of runs over 400 m."},
    {"first": "Ethan", "last": "Walker", "sex": "male", "born": "2000-09-30", "height": 175, "level": "beginner",
     "weight": 72, "trend": 0.3, "skill": "30 unbroken double-unders", "skill_movement": "Double-Under",
     "skill_metric": "unbroken reps", "skill_unit": "reps", "skill_start": 8, "skill_target": 30},
    {"first": "Hannah", "last": "Kim", "sex": "female", "born": "1993-12-01", "height": 170, "level": "advanced",
     "weight": 64, "trend": -0.1, "skill": "First bar muscle-up", "skill_movement": "Bar Muscle-Up", "achieved": true},
    {"first": "David", "last": "Okafor", "sex": "male", "born": "1983-04-22", "height": 188, "level": "intermediate",
     "weight": 95, "trend": -0.5,
     "injuries": "History of lower back strain: conservative deadlift loading.",
     "scaling": "Deadlifts capped at 75% of 1RM with strict form; Russian kettlebell swings instead of American."},
    {"first": "Olivia", "last": "Brooks", "sex": "female", "born": "1999-06-17", "height": 163, "level": "intermediate",
     "weight": 59, "trend": 0, "skill": "Strict handstand push-up", "skill_movement": "Strict Handstand Push-Up"},
    {"first": "Ryan", "last": "Thompson", "sex": "male", "born": "1995-08-09", "height": 180, "level": "advanced",
     "weight": 82, "trend": 0.1,
     "injuries": "Mild left wrist pain in the front rack.",
     "scaling": "Cross-arm front rack or straps; push-ups on dumbbell handles."},
    {"first": "Grace", "last": "Liu", "sex": "female", "born": "1990-02-25", "height": 158, "level": "beginner",
     "weight": 55, "trend": -0.15, "skill": "First toes-to-bar", "skill_movement": "Toes-to-Bar"},
    {"first": "Carlos", "last": "Mendes", "sex": "male", "born": "1987-10-11", "height": 176, "level": "intermediate",
     "weight": 80, "trend": -0.2, "skill": "Legless rope climb", "skill_movement": "Rope Climb"}
  ]$json$;
  foods jsonb := $json${
    "breakfast": [
      {"name": "Oatmeal with berries and whey", "cal": 450, "p": 35, "c": 60, "f": 8},
      {"name": "Eggs, toast and avocado", "cal": 520, "p": 28, "c": 35, "f": 30},
      {"name": "Greek yogurt parfait", "cal": 380, "p": 30, "c": 45, "f": 9}],
    "lunch": [
      {"name": "Chicken rice bowl", "cal": 650, "p": 50, "c": 75, "f": 15},
      {"name": "Turkey wrap and fruit", "cal": 560, "p": 38, "c": 62, "f": 16},
      {"name": "Salmon quinoa salad", "cal": 600, "p": 40, "c": 45, "f": 27}],
    "dinner": [
      {"name": "Steak, sweet potato and greens", "cal": 700, "p": 55, "c": 55, "f": 28},
      {"name": "Chicken stir-fry with rice", "cal": 620, "p": 45, "c": 70, "f": 15},
      {"name": "Pasta with lean beef sauce", "cal": 680, "p": 42, "c": 85, "f": 18}],
    "snack": [
      {"name": "Protein shake and banana", "cal": 300, "p": 30, "c": 35, "f": 4},
      {"name": "Apple and almond butter", "cal": 280, "p": 7, "c": 28, "f": 16},
      {"name": "Cottage cheese and pineapple", "cal": 220, "p": 25, "c": 20, "f": 4}]
  }$json$;
  meal_share jsonb := '{"breakfast": 0.25, "lunch": 0.35, "dinner": 0.3, "snack": 0.1}';
  t jsonb;
  m jsonb;
  a jsonb;
  f jsonb;
  meal text;
  wk integer;
  dy integer;
  i integer;
  pos integer;
  speed numeric;
  strength numeric;
  progress numeric;
  noise numeric;
  total numeric;
  w numeric;
  cal integer;
  prot integer;
  fat integer;
  squat numeric;
  portion numeric;
  is_injured boolean;
begin
  if uid is null then
    raise exception 'You must be logged in to load demo data.';
  end if;

  if reset then
    perform public.clear_demo_data();
  elsif exists (select 1 from public.athletes where coach_id = uid) then
    raise exception 'You already have athletes. Use "Reset demo" to replace them.';
  end if;

  perform setseed(0.42);

  insert into public.programs (name, description, weeks)
  values (
    '8-Week Engine & Strength Builder',
    'Five sessions a week mixing heavy barbell days, benchmark WODs and conditioning.',
    8
  )
  returning id into v_program_id;

  for wk in 1..8 loop
    for dy in 1..5 loop
      t := templates -> (((wk - 1) * 5 + dy - 1) % jsonb_array_length(templates));
      insert into public.workouts (
        program_id, title, workout_type, time_cap_seconds, rounds, description,
        week_number, day_number, scheduled_on
      )
      values (
        v_program_id, t ->> 'title', (t ->> 'type')::public.workout_type,
        (t ->> 'cap')::integer, (t ->> 'rounds')::integer, t ->> 'description',
        wk, dy, program_start + (wk - 1) * 7 + (dy - 1)
      );

      pos := 0;
      for m in select * from jsonb_array_elements(t -> 'movements') loop
        pos := pos + 1;
        insert into public.workout_movements (
          workout_id, movement_id, position, sets, reps, load_kg, distance_m
        )
        select w.id, mv.id, pos, (m ->> 'sets')::integer, (m ->> 'reps')::integer,
          (m ->> 'load_kg')::numeric, (m ->> 'distance_m')::numeric
        from public.workouts w, public.movements mv
        where w.program_id = v_program_id and w.week_number = wk and w.day_number = dy
          and mv.coach_id is null and mv.name = m ->> 'name';
      end loop;
    end loop;
  end loop;

  for a in select * from jsonb_array_elements(athletes) loop
    is_injured := a ? 'injuries';

    insert into public.athletes (
      first_name, last_name, email, birth_date, sex, height_cm, experience_level, injuries
    )
    values (
      a ->> 'first', a ->> 'last',
      lower(a ->> 'first') || '.' || lower(a ->> 'last') || '@example.com',
      (a ->> 'born')::date, a ->> 'sex', (a ->> 'height')::numeric,
      (a ->> 'level')::public.experience_level, a ->> 'injuries'
    )
    returning id into v_athlete_id;

    insert into public.program_assignments (program_id, athlete_id, start_date)
    values (v_program_id, v_athlete_id, program_start);

    -- Higher = faster / stronger.
    speed := case a ->> 'level'
      when 'beginner' then 0.75 when 'intermediate' then 1.0
      when 'advanced' then 1.15 else 1.3 end;
    strength := speed * case a ->> 'sex' when 'female' then 0.7 else 1.0 end;

    -- Results for the weeks that have already happened (~80% attendance).
    for v_workout_id, t, wk in
      select w.id, templates -> (((w.week_number - 1) * 5 + w.day_number - 1) % jsonb_array_length(templates)), w.week_number
      from public.workouts w
      where w.program_id = v_program_id and w.scheduled_on < current_date
      order by w.scheduled_on
    loop
      continue when random()::numeric > (case a ->> 'level' when 'beginner' then 0.7 else 0.85 end);

      progress := 1 + 0.012 * (wk - 1);
      noise := 0.94 + random()::numeric * 0.12;

      insert into public.workout_results (
        workout_id, athlete_id, performed_on, time_seconds, rounds, reps, load_kg, is_rx, notes
      )
      select v_workout_id, v_athlete_id, w.scheduled_on,
        case when t ->> 'type' = 'for_time'
          then least((t ->> 'cap')::integer, round((t ->> 'base')::numeric / (speed * progress * noise))::integer) end,
        case when t ->> 'type' = 'amrap'
          then floor((t ->> 'base')::numeric * speed * progress * noise)::integer
          when t ->> 'type' = 'emom'
          then least(12, round(9 + 3 * speed * noise)::integer) end,
        case when t ->> 'type' = 'amrap'
          then floor(mod((t ->> 'base')::numeric * speed * progress * noise, 1) * (t ->> 'round_reps')::numeric)::integer end,
        case when t ->> 'type' = 'strength'
          then round((t ->> 'base')::numeric * strength * progress * noise / 2.5) * 2.5 end,
        rx.is_rx,
        case when not rx.is_rx then case when is_injured then a ->> 'scaling' else 'Scaled loads and movements.' end end
      from public.workouts w,
        lateral (select a ->> 'level' in ('advanced', 'competitor') and not is_injured
          or a ->> 'level' = 'intermediate' and not is_injured and random()::numeric < 0.6 as is_rx) rx
      where w.id = v_workout_id;
    end loop;

    -- Weekly weigh-ins.
    for i in 0..6 loop
      insert into public.body_metrics (measured_on, athlete_id, weight_kg)
      values (
        least(program_start + i * 7, current_date), v_athlete_id,
        round((a ->> 'weight')::numeric + (a ->> 'trend')::numeric * i + (random()::numeric - 0.5) * 0.6, 1)
      );
    end loop;

    -- Macro targets: an earlier target and the current one (adjusted 3 weeks ago).
    w := (a ->> 'weight')::numeric;
    prot := round(2.0 * w);
    fat := round(0.9 * w);
    cal := round((w * 30 + case a ->> 'sex' when 'male' then 200 else 0 end) / 50) * 50;
    insert into public.nutrition_targets (athlete_id, calories, protein_g, carbs_g, fat_g, start_date, end_date, notes)
    values (v_athlete_id, cal, prot, greatest(0, (cal - prot * 4 - fat * 9) / 4), fat,
      program_start, current_date - 22, 'Starting targets');

    cal := cal + case
      when (a ->> 'trend')::numeric < 0 then -150
      when (a ->> 'trend')::numeric > 0 then 150
      else 0 end;
    insert into public.nutrition_targets (athlete_id, calories, protein_g, carbs_g, fat_g, start_date, notes)
    values (v_athlete_id, cal, prot, greatest(0, (cal - prot * 4 - fat * 9) / 4), fat,
      current_date - 21, 'Adjusted after 3 weeks of check-ins');

    -- Food log for the last 14 days (some days not logged).
    for i in 1..14 loop
      continue when random()::numeric < 0.12;
      for meal in select jsonb_object_keys(meal_share) loop
        f := foods -> meal -> floor(random()::numeric * 3)::integer;
        portion := cal * (meal_share ->> meal)::numeric * (0.85 + random()::numeric * 0.25) / (f ->> 'cal')::numeric;
        insert into public.food_logs (athlete_id, logged_on, meal, food_name, calories, protein_g, carbs_g, fat_g)
        values (
          v_athlete_id, current_date - i, meal::public.meal_type, f ->> 'name',
          round((f ->> 'cal')::numeric * portion), round((f ->> 'p')::numeric * portion, 1),
          round((f ->> 'c')::numeric * portion, 1), round((f ->> 'f')::numeric * portion, 1)
        );
      end loop;
    end loop;

    -- Goals: a strength goal, a body-composition goal if cutting/gaining, and a skill goal.
    squat := round(100 * strength / 2.5) * 2.5;
    insert into public.goals (athlete_id, title, goal_type, movement_id, metric, unit, start_value, target_value, target_date)
    select v_athlete_id, 'Back squat ' || round(squat * 1.1 / 2.5) * 2.5 || ' kg', 'performance', mv.id, '1RM', 'kg',
      squat, round(squat * 1.1 / 2.5) * 2.5, program_start + 70
    from public.movements mv where mv.coach_id is null and mv.name = 'Back Squat';

    if (a ->> 'trend')::numeric <> 0 then
      insert into public.goals (athlete_id, title, goal_type, metric, unit, start_value, target_value, target_date)
      values (
        v_athlete_id,
        case when (a ->> 'trend')::numeric < 0 then 'Lean down to ' else 'Build up to ' end
          || round(w + (a ->> 'trend')::numeric * 10) || ' kg',
        'body_composition', 'body weight', 'kg', w, round(w + (a ->> 'trend')::numeric * 10), program_start + 70
      );
    end if;

    if a ? 'skill' then
      insert into public.goals (athlete_id, title, goal_type, movement_id, metric, unit, start_value, target_value,
        target_date, status, achieved_at)
      select v_athlete_id, a ->> 'skill', 'skill', mv.id,
        coalesce(a ->> 'skill_metric', 'reps'), coalesce(a ->> 'skill_unit', 'reps'),
        coalesce((a ->> 'skill_start')::numeric, 0), coalesce((a ->> 'skill_target')::numeric, 1), program_start + 56,
        case when (a ->> 'achieved')::boolean then 'achieved' else 'active' end::public.goal_status,
        case when (a ->> 'achieved')::boolean then now() - interval '5 days' end
      from public.movements mv where mv.coach_id is null and mv.name = a ->> 'skill_movement';
    end if;

    -- Injured athletes get scaling notes on this week's and next week's workouts.
    if is_injured then
      insert into public.athlete_workout_scalings (workout_id, athlete_id, modifications)
      select w.id, v_athlete_id, a ->> 'scaling'
      from public.workouts w
      where w.program_id = v_program_id and w.week_number in (7, 8);
    end if;
  end loop;

  return jsonb_build_object(
    'athletes', (select count(*) from public.athletes where coach_id = uid),
    'workouts', (select count(*) from public.workouts where coach_id = uid),
    'results', (select count(*) from public.workout_results where coach_id = uid),
    'food_logs', (select count(*) from public.food_logs where coach_id = uid),
    'goals', (select count(*) from public.goals where coach_id = uid)
  );
end;
$$;

revoke execute on function public.clear_demo_data() from public, anon;
revoke execute on function public.load_demo_data(boolean) from public, anon;
grant execute on function public.clear_demo_data() to authenticated;
grant execute on function public.load_demo_data(boolean) to authenticated;
