import { generateText, Output, type LanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { loadRecentCheckIns } from "@/lib/check-in";
import { loadLiftMaxes } from "@/lib/benchmarks";
import { formatLiftMaxes, LIFT_LOAD_RULE } from "./lift-context";
import type { Database, Json } from "@/lib/supabase/database.types";
import { formatScore, fromKgPrecise, toKg, type Units } from "@/lib/units";

import { friendlySuggestionError } from "./service-core";
import { movementIdSchema } from "./movement-schema";
import { scaleWorkoutChangeSchema, scaleWorkoutDetailsSchema } from "./scale-workout";
import { ageOn } from "./workout-context";
import {
  athleteAdjustSchema,
  CHECK_WITH_COACH_MESSAGE,
  HarderChangeError,
  mentionsPain,
  NoChangeError,
  normalizeAthleteAdjustment,
  type AthleteAdjustInput,
} from "./athlete-adjust-schema";

const ATHLETE_ADJUST_SYSTEM = `You help a CrossFit athlete adjust today's WOD to how they feel. The change applies right away and their coach reviews it afterwards.
Rules:
- ${LIFT_LOAD_RULE}
- Use recent_check_ins: readiness, sleep, soreness areas, stress, energy and mood. Lower readiness or high soreness means scale down and avoid sore areas.
- You may only make the workout easier or safer: lighter loads, fewer reps, sets, or rounds, a longer time cap on a For Time WOD, a shorter AMRAP or EMOM, or easier substitutions. Never make anything harder.
- If the athlete asks to make it harder, heavier, longer, or to add work, set asked_for_harder to true and copy the current values unchanged.
- Start from "current" (what the athlete was given, which may already include the coach's scaling) and only make it easier from there. Keep the WOD's stimulus and format.
- Return exactly one change for each original movement, in the same order. Copy its original_movement_id exactly.
- Use only movement IDs from the provided library. Keep a movement by using its current movement_id; substitute only with an easier library movement that avoids the sore or painful area.
- Give every number for kept movements (loads in the athlete's units). rounds and time_cap_minutes are for the whole WOD; use null only when the WOD has none.
- Use the athlete's experience level, injuries, recent results and feedback (RPE, energy, sleep, soreness, pain notes), and journal.
- Never program into a reported injury or pain; substitute or remove load instead.
- Do not give medical advice: no diagnosis, no treatment, no medication, no rehab exercises. If the athlete mentions pain, include the exact phrase "check with your coach" in the summary.
- Give each change one short reason sentence written to the athlete.
- The summary is for the athlete: plain English, no more than 300 characters.`;

export const athleteAdjustFeelingSchema = z.string().trim().min(3).max(300);

type Scaling = {
  updated_at: string;
  modifications: string | null;
  details: Json | null;
} | null;

export async function buildAthleteAdjustRequest(
  supabase: SupabaseClient<Database>,
  params: { athleteId: string; workoutId: string; scheduledOn: string; feeling: string; units: Units; scaling: Scaling },
) {
  const [
    { data: library, error: libraryError },
    { data: athlete, error: athleteError },
    { data: workout, error: workoutError },
    { data: resultRows, error: resultsError },
    recentCheckIns,
  ] = await Promise.all([
    supabase.from("movements").select("id, name, category, measure").order("name"),
    supabase
      .from("athletes")
      .select("id, first_name, experience_level, injuries, notes, sex, birth_date")
      .eq("id", params.athleteId)
      .maybeSingle(),
    supabase
      .from("workouts")
      .select(
        "id, title, workout_type, time_cap_seconds, rounds, description, notes, updated_at, workout_movements(position, movement_id, sets, reps, load_kg, distance_m, calories, duration_seconds, notes, movements(name))",
      )
      .eq("id", params.workoutId)
      .order("position", { referencedTable: "workout_movements" })
      .maybeSingle(),
    supabase
      .from("workout_results")
      .select(
        "performed_on, time_seconds, rounds, reps, load_kg, is_rx, rpe, energy, sleep_hours, soreness, pain_notes, workouts(title, workout_type)",
      )
      .eq("athlete_id", params.athleteId)
      .order("performed_on", { ascending: false })
      .limit(10),
    loadRecentCheckIns(supabase, params.athleteId, params.scheduledOn, 7),
  ]);
  if (libraryError) throw libraryError;
  if (athleteError || !athlete) throw athleteError ?? new Error("Athlete not found.");
  if (workoutError || !workout) throw workoutError ?? new Error("Workout not found.");
  if (resultsError) throw resultsError;

  const units = params.units;
  const movements = workout.workout_movements.map(({ movements: movement, load_kg, ...item }) => ({
    ...item,
    name: movement?.name ?? "",
    load: load_kg == null ? null : fromKgPrecise(load_kg, units),
  }));
  const names = new Map((library ?? []).map(({ id, name }) => [id, name]));
  const scaled = params.scaling ? scaleWorkoutDetailsSchema.safeParse(params.scaling.details) : null;
  const scaledMovements = scaled?.success && scaled.data.movements.length === movements.length ? scaled.data : null;
  const current = {
    coach_note: params.scaling?.modifications ?? null,
    rounds: scaledMovements && scaledMovements.rounds !== undefined ? scaledMovements.rounds : workout.rounds,
    time_cap_seconds:
      scaledMovements && scaledMovements.time_cap_seconds !== undefined
        ? scaledMovements.time_cap_seconds
        : workout.time_cap_seconds,
    movements: scaledMovements
      ? scaledMovements.movements.map((movement) => ({
          movement_id: movement.movement_id,
          name: names.get(movement.movement_id) ?? movement.movement_name,
          sets: movement.sets,
          reps: movement.reps,
          load: movement.load_kg == null ? null : fromKgPrecise(movement.load_kg, units),
          distance_m: movement.distance_m,
          calories: movement.calories,
          duration_seconds: movement.duration_seconds,
        }))
      : movements.map(({ movement_id, name, sets, reps, load, distance_m, calories, duration_seconds }) => ({
          movement_id,
          name,
          sets,
          reps,
          load,
          distance_m,
          calories,
          duration_seconds,
        })),
  };

  const input = {
    workout_id: workout.id,
    workout_updated_at: workout.updated_at,
    scheduled_on: params.scheduledOn,
    scaling_updated_at: params.scaling?.updated_at ?? null,
    units,
    note: null,
    feeling: params.feeling,
    mentions_pain: mentionsPain(params.feeling),
    athlete: {
      lift_maxes: formatLiftMaxes(await loadLiftMaxes(supabase, athlete.id), units),
      id: athlete.id,
      first_name: athlete.first_name,
      experience_level: athlete.experience_level,
      injuries: athlete.injuries,
      notes: athlete.notes,
      sex: athlete.sex,
      birth_date: athlete.birth_date,
      age: athlete.birth_date ? ageOn(athlete.birth_date, params.scheduledOn) : null,
    },
    workout: {
      title: workout.title,
      workout_type: workout.workout_type,
      time_cap_seconds: workout.time_cap_seconds,
      rounds: workout.rounds,
      description: workout.description,
      notes: workout.notes,
      movements,
    },
    current,
    library: library ?? [],
    recent_results: (resultRows ?? []).map((result) => ({
      performed_on: result.performed_on,
      workout_title: result.workouts?.title ?? "Workout",
      workout_type: result.workouts?.workout_type ?? "other",
      score: formatScore(result, units),
      is_rx: result.is_rx,
      rpe: result.rpe,
      energy: result.energy,
      sleep_hours: result.sleep_hours,
      soreness: result.soreness,
      pain_notes: result.pain_notes,
    })),
    recent_check_ins: recentCheckIns,
  } satisfies Json;

  const ids = input.library.map(({ id }) => id);
  return {
    input,
    prompt: `How the athlete feels today: ${JSON.stringify(params.feeling)}\n\nAthlete, WOD, and recent context (JSON):\n${JSON.stringify(input, null, 2)}\n\nReturn the adjusted WOD.`,
    generationSchema: athleteAdjustSchema.extend({
      changes: z
        .array(
          scaleWorkoutChangeSchema.extend({
            original_movement_id: movementIdSchema(ids),
            movement_id: movementIdSchema(ids),
          }),
        )
        .min(1)
        .max(30),
    }),
  };
}

export type AthleteAdjustResult =
  | { ok: true; summary: string; checkWithCoach: boolean }
  | { ok: false; error: string; checkWithCoach: boolean };

const RPC_ERRORS: Record<string, string> = {
  daily_limit: "You've asked for 5 adjustments in the last day. Talk to your coach or try again tomorrow.",
  workout_changed: "Your coach just changed this WOD. Refresh the page and try again.",
  scaling_changed: "Your scaled version just changed. Refresh the page and try again.",
  workout_not_found: "This WOD isn't available any more.",
  not_today: "You can only adjust today's WOD.",
};

function rpcMessage(error: { message?: string } | null) {
  const code = error?.message ?? "";
  if (code.startsWith("harder_")) return "That change would have made the workout harder, so nothing was changed.";
  return RPC_ERRORS[code] ?? null;
}

/** Runs the AI and applies the adjustment for this athlete only. Every request is logged in ai_suggestions. */
export async function runAthleteAdjustment(
  supabase: SupabaseClient<Database>,
  request: Awaited<ReturnType<typeof buildAthleteAdjustRequest>>,
  modelOverride?: LanguageModel,
): Promise<AthleteAdjustResult> {
  const checkWithCoach = request.input.mentions_pain;
  const fail = (error: string) => ({ ok: false as const, error, checkWithCoach });
  if (!modelOverride && !process.env.OPENAI_API_KEY) return fail(friendlySuggestionError(null));
  const model = modelOverride ?? openai(process.env.OPENAI_MODEL ?? "gpt-5.4-mini");
  const modelName = typeof model === "string" ? model : model.modelId;

  const { data: suggestionId, error: startError } = await supabase.rpc("start_athlete_workout_adjustment", {
    p_workout_id: request.input.workout_id,
    p_input: request.input,
    p_model: modelName,
  });
  if (startError || !suggestionId) {
    if (startError) console.error("Could not start athlete adjustment:", startError);
    return fail(rpcMessage(startError) ?? friendlySuggestionError(null));
  }
  const record = async (error: string, proposal?: unknown) => {
    const { error: failError } = await supabase.rpc("fail_athlete_workout_adjustment", {
      p_suggestion_id: suggestionId,
      p_error: error,
      ...(proposal ? { p_proposal: proposal as Json } : {}),
    });
    if (failError) console.error("Could not record athlete adjustment failure:", failError);
  };

  let proposal: unknown;
  try {
    const { output } = await generateText({
      model,
      system: ATHLETE_ADJUST_SYSTEM,
      prompt: request.prompt,
      output: Output.object({ schema: request.generationSchema }),
      timeout: 45_000,
      maxRetries: 1,
      providerOptions: { openai: { reasoningEffort: "low" } },
    });
    proposal = output;
  } catch (error) {
    console.error("Athlete adjustment AI call failed:", error);
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    await record(message);
    return fail(friendlySuggestionError(message));
  }

  let final: ReturnType<typeof normalizeAthleteAdjustment>;
  try {
    final = normalizeAthleteAdjustment(proposal, request.input);
  } catch (error) {
    const known = error instanceof HarderChangeError || error instanceof NoChangeError;
    await record(known ? `${error.name}: ${error.message}` : String(error), proposal);
    return fail(known ? error.message : "The AI couldn't make a safe adjustment. Please try again.");
  }

  const input: AthleteAdjustInput = request.input;
  const summary =
    checkWithCoach && !/check with your coach/i.test(final.summary)
      ? `${final.summary} Please check with your coach.`.slice(0, 600)
      : final.summary;
  const names = new Map(input.library.map(({ id, name }) => [id, name]));
  const details = {
    rounds: final.rounds,
    time_cap_seconds: final.time_cap_minutes == null ? null : Math.round(final.time_cap_minutes * 60),
    check_with_coach: checkWithCoach,
    movements: final.changes.map(({ load, ...movement }) => ({
      ...movement,
      movement_name: names.get(movement.movement_id) ?? "",
      load_kg: load == null ? null : toKg(load, input.units as Units),
    })),
  } satisfies Json;

  const { error: applyError } = await supabase.rpc("apply_athlete_workout_adjustment", {
    p_suggestion_id: suggestionId,
    p_proposal: final as unknown as Json,
    p_modifications: summary,
    p_details: details,
  });
  if (applyError) {
    console.error("Could not apply athlete adjustment:", applyError);
    await record(`apply: ${applyError.message}`, final);
    return fail(rpcMessage(applyError) ?? "Couldn't save your adjusted WOD. Please try again.");
  }
  return { ok: true, summary, checkWithCoach };
}

export { CHECK_WITH_COACH_MESSAGE };
