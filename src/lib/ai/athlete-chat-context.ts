import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRecentCheckIns } from "@/lib/check-in";
import { loadAthleteBenchmarks, loadLiftMaxes } from "@/lib/benchmarks";
import { loadAthleteSchedule } from "@/lib/athlete-schedule";
import { addDays } from "@/lib/nutrition";
import { goalProgress } from "@/lib/progress";
import { personalRecords } from "@/lib/results";
import { fromKgPrecise, type Units } from "@/lib/units";
import type { Database } from "@/lib/supabase/database.types";
import { formatLiftMaxes } from "./lift-context";
import { consistencyContext, trainingLoadContext } from "./athlete-context";

const load = (kg: number | null, units: Units) => (kg == null ? null : fromKgPrecise(Number(kg), units));

export async function getAthleteContext(supabase: SupabaseClient<Database>, athleteId: string, today: string, units: Units, options: { athleteFacing?: boolean; driftDays?: number } = {}) {
  const [
    benchmarks,
    liftMaxes,
    { data: athlete, error },
    { data: metrics },
    { data: goals },
    { data: results },
    { data: journal },
    recentCheckIns,
    consistency,
    trainingLoad,
  ] = await Promise.all([
    loadAthleteBenchmarks(supabase, athleteId, today),
    loadLiftMaxes(supabase, athleteId),
    supabase
      .from("athletes")
      .select("id, first_name, last_name, experience_level, injuries, notes, status, sex, birth_date")
      .eq("id", athleteId)
      .maybeSingle(),
    supabase
      .from("body_metrics")
      .select("measured_on, weight_kg, body_fat_pct")
      .eq("athlete_id", athleteId)
      .order("measured_on", { ascending: false })
      .limit(10),
    supabase
      .from("goals")
      .select("title, goal_type, metric, unit, movement_id, start_value, target_value, target_date, status, movements(name)")
      .eq("athlete_id", athleteId),
    supabase
      .from("workout_results")
      .select(
        "performed_on, time_seconds, rounds, reps, load_kg, is_rx, notes, rpe, energy, sleep_hours, soreness, pain_notes, workouts(title, workout_type, workout_movements(movement_id))",
      )
      .eq("athlete_id", athleteId)
      .order("performed_on", { ascending: false }),
    supabase
      .from("athlete_journal_entries")
      .select("entry_on, alcohol, late_caffeine, hit_water_goal, late_meal, screens_in_bed, mobility")
      .eq("athlete_id", athleteId)
      .gte("entry_on", addDays(today, -13))
      .lte("entry_on", today)
      .order("entry_on", { ascending: false }),
    loadRecentCheckIns(supabase, athleteId, today, 7),
    consistencyContext(supabase, athleteId, today, options.driftDays),
    trainingLoadContext(supabase, athleteId, today),
  ]);
  if (error) throw error;
  if (!athlete) return { error: "Athlete not found." };

  const schedule = await loadAthleteSchedule(
    supabase,
    athleteId,
    { from: addDays(today, -7), to: addDays(today, 14) },
    "id, source_workout_id, title, week_number, day_number, workout_type",
  );
  const allResults = results ?? [];
  const goalData = { metrics: metrics ?? [], results: allResults, liftMaxes };
  const kgValue = (value: number | null, unit: string | null) => (unit === "kg" ? load(value, units) : value);

  return {
    recent_check_ins: recentCheckIns,
    consistency,
    training_load: trainingLoad,
    lift_maxes: formatLiftMaxes(liftMaxes, units),
    benchmark_bests: benchmarks.flatMap((b) => b.best ? [{
      name: b.name, workout_type: b.workout_type, date: b.best.performed_on,
      time_seconds: b.best.time_seconds, rounds: b.best.rounds, reps: b.best.reps,
      load: load(b.best.load_kg, units), units, rep_max: b.best.rep_max, rx: b.best.is_rx,
    }] : []),
    athlete_id: athlete.id,
    name: `${athlete.first_name} ${athlete.last_name}`,
    experience_level: athlete.experience_level,
    injuries: athlete.injuries,
    ...(options.athleteFacing ? {} : { coach_notes: athlete.notes }),
    status: athlete.status,
    sex: athlete.sex,
    birth_date: athlete.birth_date,
    latest_body_metrics: metrics?.[0]
      ? { ...metrics[0], weight: load(metrics[0].weight_kg, units), weight_kg: undefined }
      : null,
    goals: (goals ?? []).map((goal) => {
      const progress = goalProgress(goal, goalData);
      const unit = goal.unit === "kg" ? units : goal.unit;
      return {
        title: goal.title,
        status: goal.status,
        movement: goal.movements?.name ?? null,
        metric: goal.metric,
        unit,
        start: kgValue(goal.start_value, goal.unit),
        target: kgValue(goal.target_value, goal.unit),
        current: kgValue(progress.current, goal.unit),
        percent_complete: progress.pct,
        target_date: goal.target_date,
      };
    }),
    personal_records: personalRecords(allResults)
      .slice(0, 15)
      .map((pr) => ({
        workout: pr.workouts?.title,
        performed_on: pr.performed_on,
        time_seconds: pr.time_seconds,
        rounds: pr.rounds,
        reps: pr.reps,
        load: load(pr.load_kg, units),
        rx: pr.is_rx,
        attempts: pr.attempts,
      })),
    recent_results: allResults.slice(0, 15).map((r) => ({
      performed_on: r.performed_on,
      workout: r.workouts?.title,
      time_seconds: r.time_seconds,
      rounds: r.rounds,
      reps: r.reps,
      load: load(r.load_kg, units),
      rx: r.is_rx,
      notes: r.notes,
      rpe: r.rpe,
      energy_1_to_5: r.energy,
      sleep_hours: r.sleep_hours,
      soreness_1_to_5: r.soreness,
      pain_notes: r.pain_notes,
    })),
    journal_last_14_days: journal ?? [],
    schedule_last_7_and_next_14_days: schedule.map((item) => ({
      date: item.date,
      workout_id: item.workout.id,
      title: item.workout.title,
      source: item.source,
      program: item.programName,
    })),
  };
}
