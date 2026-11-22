import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAthleteSchedule } from "@/lib/athlete-schedule";
import { DEFAULT_DRIFT_DAYS } from "@/lib/consistency";
import type { Database } from "@/lib/supabase/database.types";
import type { AthleteViewer } from "@/lib/viewer";
import { effectiveScaling } from "@/lib/workout-scaling";
import { getAthleteContext } from "./athlete-chat-context";

export async function getMyTraining(supabase: SupabaseClient<Database>, viewer: AthleteViewer, today: string) {
  const [profile, schedule, scalings, targets, preferences, intake] = await Promise.all([
    getAthleteContext(supabase, viewer.athleteId, today, viewer.units, { athleteFacing: true, driftDays: DEFAULT_DRIFT_DAYS }),
    loadAthleteSchedule(supabase, viewer.athleteId, { from: today, to: today },
      "id, source_workout_id, title, workout_type, time_cap_seconds, rounds, description, week_number, day_number, workout_movements(position, sets, reps, load_kg, distance_m, calories, duration_seconds, notes, movements(id, name))"),
    supabase.from("athlete_workout_scalings").select("workout_id, modifications, details, athlete_adjusted_at, coach_modifications, coach_details").eq("athlete_id", viewer.athleteId),
    supabase.from("nutrition_targets").select("calories, protein_g, carbs_g, fat_g, start_date, end_date")
      .eq("athlete_id", viewer.athleteId).lte("start_date", today).or(`end_date.is.null,end_date.gte.${today}`).order("start_date", { ascending: false }).limit(1),
    supabase.from("athlete_food_preferences").select("diet_type, allergies, dislikes, cooking_minutes").eq("athlete_id", viewer.athleteId).maybeSingle(),
    supabase.from("athlete_intakes").select("status, answers").eq("athlete_id", viewer.athleteId).maybeSingle(),
  ]);
  for (const result of [scalings, targets, preferences, intake]) if (result.error) throw result.error;
  const ids = new Set(schedule.map((item) => item.workout.id));
  return { profile, today_wods: schedule, personal_scalings: (scalings.data ?? []).filter((row) => ids.has(row.workout_id))
    .flatMap((row) => { const scaling = effectiveScaling(row, today); return scaling ? [scaling] : []; }),
    current_macros: targets.data?.[0] ?? null, food_preferences: preferences.data, intake: intake.data, units: viewer.units };
}
