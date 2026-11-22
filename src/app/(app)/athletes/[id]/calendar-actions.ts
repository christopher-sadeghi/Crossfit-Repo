"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { placeWorkout } from "@/app/(app)/programs/actions";
import { runSuggestion } from "@/lib/ai/service";
import { SUGGESTION_REGISTRY } from "@/lib/ai/suggestions";
import { loadAthleteSchedule, SCHEDULE_LABEL } from "@/lib/athlete-schedule";
import { failure, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/supabase/server";

import { addDays, monday } from "./calendar-dates";

const ids = z.object({ athleteId: z.string().uuid(), workoutId: z.string().uuid() });
const dateSchema = z.string().date("Choose a valid date.");

async function override(athleteId: string, workoutId: string, mode: "edit" | "remove") {
  if (!ids.safeParse({ athleteId, workoutId }).success) return { error: "Choose an athlete and WOD." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("override_workout_for_athlete", {
    p_athlete_id: athleteId, p_workout_id: workoutId, p_mode: mode,
  });
  if (error) return { error: error.message };
  revalidatePath(`/athletes/${athleteId}`);
  if (mode === "edit" && data) redirect(`/programs/workouts/${data}/edit`);
  return { message: "WOD removed for this athlete." };
}

export async function editWorkoutForAthlete(athleteId: string, workoutId: string): Promise<FormState> {
  return override(athleteId, workoutId, "edit");
}

export async function removeWorkoutForAthlete(athleteId: string, workoutId: string): Promise<FormState> {
  return override(athleteId, workoutId, "remove");
}

export async function restoreWorkoutForAthlete(athleteId: string, workoutId: string): Promise<FormState> {
  if (!ids.safeParse({ athleteId, workoutId }).success) return { error: "Choose an athlete and WOD." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("restore_workout_for_athlete", { p_athlete_id: athleteId, p_workout_id: workoutId });
  if (error) return { error: error.message };
  revalidatePath(`/athletes/${athleteId}`);
  return { message: "Program WOD restored." };
}

export async function moveAthleteWorkout(athleteId: string, workoutId: string, date: string): Promise<FormState> {
  if (!ids.safeParse({ athleteId, workoutId }).success || !dateSchema.safeParse(date).success) return { error: "Choose a WOD and valid date." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("workouts").update({ scheduled_on: date })
    .eq("id", workoutId).eq("athlete_id", athleteId).is("program_id", null).select("id").maybeSingle();
  if (error || !data) return { error: "Couldn't move that athlete's WOD." };
  revalidatePath(`/athletes/${athleteId}`);
  return { message: "WOD moved." };
}

export async function deleteAthleteWorkout(athleteId: string, workoutId: string): Promise<FormState> {
  if (!ids.safeParse({ athleteId, workoutId }).success) return { error: "Choose an athlete and WOD." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_athlete_workout", { p_workout_id: workoutId, p_athlete_id: athleteId });
  if (error) return { error: error.message };
  revalidatePath(`/athletes/${athleteId}`);
  return { message: "WOD deleted." };
}

const addSchema = z.object({ athlete_id: z.string().uuid(), workout_id: z.string().uuid(), date: dateSchema, destination: z.union([z.literal("athlete"), z.string().uuid()]) });

export async function addExistingWorkoutForAthlete(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = addSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(formData, parsed.error.issues[0]?.message ?? "Check the form.");
  const { athlete_id, workout_id, date, destination } = parsed.data;
  const supabase = await createClient();
  if (destination === "athlete") {
    const { error } = await supabase.rpc("copy_workout_for_athlete", { p_workout_id: workout_id, p_athlete_id: athlete_id, p_scheduled_on: date });
    if (error) return failure(formData, error.message);
  } else {
    const { data: assignment } = await supabase.from("program_assignments").select("start_date, programs(weeks, athlete_id)").eq("athlete_id", athlete_id).eq("program_id", destination).maybeSingle();
    if (!assignment?.programs) return failure(formData, "Choose one of this athlete's assigned programs.");
    const offset = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${assignment.start_date}T00:00:00Z`)) / 86400000);
    if (offset < 0 || offset >= assignment.programs.weeks * 7) return failure(formData, "Choose a date within this program.");
    const placement = new FormData();
    placement.set("program_id", destination);
    placement.set("workout_id", workout_id);
    placement.set("week_number", String(Math.floor(offset / 7) + 1));
    placement.set("day_number", String(offset % 7 + 1));
    const result = await placeWorkout({}, placement);
    if (result.error) return result;
    revalidatePath(`/athletes/${athlete_id}`);
    return { message: assignment.programs.athlete_id ? "WOD added to their personal program." : "WOD added to the group program. This affects everyone on that program." };
  }
  revalidatePath(`/athletes/${athlete_id}`);
  return { message: "WOD added just for this athlete." };
}

export async function requestAthleteDayWorkout(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.object({ athlete_id: z.string().uuid(), date: dateSchema, request: z.string().trim().max(500).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(formData, parsed.error.issues[0]?.message ?? "Check the form.");
  const { athlete_id, date, request } = parsed.data;
  const entry = SUGGESTION_REGISTRY.write_workout;
  const supabase = await createClient();
  let result: Awaited<ReturnType<typeof runSuggestion>>;
  try {
    const weekStart = monday(date);
    const weekEnd = addDays(weekStart, 6);
    const schedule = await loadAthleteSchedule(supabase, athlete_id, { from: weekStart, to: weekEnd },
      "id, source_workout_id, title, week_number, day_number, workout_type, time_cap_seconds, rounds, description, notes, workout_movements(position, sets, reps, load_kg, distance_m, calories, duration_seconds, notes, movements(name))");
    const week = schedule.map((item) => ({
      date: item.date,
      label: item.overrides ? `Edited from ${SCHEDULE_LABEL({ source: item.overrides.source, programName: item.overrides.programName })}` : SCHEDULE_LABEL(item),
      workout: item.workout,
    }));
    const { schema: generationSchema, ...context } = await entry.buildRequest!(supabase, {
      athleteId: athlete_id, workoutId: null, scheduledOn: date,
      request: `${request || `Write a WOD for this athlete on ${date} that fits their program week, goals and injuries.`}\n\nAthlete's scheduled WODs for ${weekStart} through ${weekEnd} (JSON; empty means no scheduled WODs):\n${JSON.stringify(week, null, 2)}\nPlan around these sessions to balance the week and avoid duplicating their movements or training stress.`,
    });
    result = await runSuggestion({ type: "write_workout", athleteId: athlete_id, ...context, schema: entry.proposalSchema, generationSchema, validate: entry.validate });
  } catch {
    return failure(formData, "The AI couldn't make a suggestion right now. Please try again in a minute.");
  }
  if ("error" in result) return failure(formData, result.error);
  revalidatePath(`/athletes/${athlete_id}`);
  redirect(`/suggestions/${result.id}`);
}
