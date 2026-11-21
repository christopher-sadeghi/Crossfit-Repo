import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { WORKOUT_TYPES } from "@/app/(app)/programs/options";
import { formatScore, fromKgPrecise, toKg, type Units } from "@/lib/units";
import type { Database, Json, Tables } from "@/lib/supabase/database.types";
import { today } from "@/lib/program-dates";

import { ApprovalError } from "./errors";
import { ageOn, loadWorkoutContext } from "./workout-context";
import { movementIdSchema } from "./movement-schema";

const scaleWorkoutChangeSchema = z.object({
  original_movement_id: z.string(),
  movement_id: z.string(),
  sets: z.number().int().min(1).max(100).nullable(),
  reps: z.number().int().min(1).max(1000).nullable(),
  load: z.number().min(0).max(2000).nullable(),
  distance_m: z.number().min(1).max(100_000).nullable(),
  calories: z.number().int().min(1).max(1000).nullable(),
  duration_seconds: z.number().int().min(1).max(7200).nullable(),
  reason: z.string().min(1).max(200),
});

export const scaleWorkoutSchema = z.object({
  summary: z.string().min(1).max(300),
  changes: z.array(scaleWorkoutChangeSchema).min(1).max(30),
  rationale: z.string().min(1).max(1000),
});

export const scaleWorkoutInputSchema = z.object({
  workout_id: z.string().uuid(),
  workout_updated_at: z.string(),
  units: z.enum(["lb", "kg"]),
  note: z.string().nullable(),
  athlete: z.object({
    id: z.string().uuid(),
    first_name: z.string(),
    experience_level: z.string(),
    injuries: z.string().nullable(),
    notes: z.string().nullable(),
    sex: z.string().nullable(),
    birth_date: z.string().nullable(),
    age: z.number().int().nullable(),
  }),
  workout: z.object({
    title: z.string(),
    workout_type: z.enum(WORKOUT_TYPES),
    time_cap_seconds: z.number().nullable(),
    rounds: z.number().nullable(),
    description: z.string().nullable(),
    notes: z.string().nullable(),
    movements: z.array(
      z.object({
        movement_id: z.string(),
        name: z.string(),
        sets: z.number().nullable(),
        reps: z.number().nullable(),
        load: z.number().nullable(),
        distance_m: z.number().nullable(),
        calories: z.number().nullable(),
        duration_seconds: z.number().nullable(),
        notes: z.string().nullable(),
      }),
    ),
  }),
  library: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      category: z.string(),
      measure: z.string(),
    }),
  ),
  recent_results: z.array(
    z.object({
      performed_on: z.string(),
      workout_title: z.string(),
      workout_type: z.string(),
      score: z.string(),
      is_rx: z.boolean(),
      rpe: z.number().nullable(),
      pain_notes: z.string().nullable(),
    }),
  ),
});

export const scaleWorkoutDetailsSchema = z.object({
  source: z.literal("ai"),
  suggestion_id: z.string().uuid(),
  movements: z.array(
    z.object({
      original_movement_id: z.string(),
      movement_id: z.string(),
      movement_name: z.string(),
      sets: z.number().nullable(),
      reps: z.number().nullable(),
      load_kg: z.number().nullable(),
      distance_m: z.number().nullable(),
      calories: z.number().nullable(),
      duration_seconds: z.number().nullable(),
      reason: z.string(),
    }),
  ),
});

const SCALE_WORKOUT_SYSTEM = `You help a CrossFit coach scale a WOD for one athlete. The coach reviews every suggestion before anything changes.
Rules:
- Keep the WOD's stimulus and format.
- Return exactly one change for each original movement, in the same order. Copy its original_movement_id exactly.
- Use only movement IDs from the provided library. Keep the original movement by using the same movement_id; substitute only with a library movement.
- Never make the workout harder than the original. When keeping a movement, its load, reps, distance, calories, and duration must be no greater than the original. Substitutions must be easier or equal in demand.
- Scale loads and reps realistically for the athlete's experience level and recent RPE.
- Never program into a reported injury or recent pain; substitute instead. If pain is recent, include the exact phrase "check with your coach" in the athlete-facing summary.
- Give each change one short reason sentence.
- The summary is for the athlete: plain English, no more than 300 characters.`;

export async function buildScaleRequest(
  supabase: SupabaseClient<Database>,
  params: { athleteId: string | null; workoutId?: string | null; request?: string | null },
): Promise<{ input: Json; system: string; prompt: string; schema: z.ZodType }> {
  if (!params.athleteId || !params.workoutId) throw new Error("An athlete and WOD are required.");

  const [{ units, library }, { data: athlete, error: athleteError }, { data: workout, error: workoutError }, { data: resultRows, error: resultsError }] =
    await Promise.all([
      loadWorkoutContext(supabase),
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
        .select("performed_on, time_seconds, rounds, reps, load_kg, is_rx, rpe, pain_notes, workouts(title, workout_type)")
        .eq("athlete_id", params.athleteId)
        .order("performed_on", { ascending: false })
        .limit(10),
    ]);

  if (athleteError || !athlete) throw athleteError ?? new Error("Athlete not found.");
  if (workoutError || !workout) throw workoutError ?? new Error("Workout not found.");
  if (resultsError) throw resultsError;

  const asOf = today();
  const athleteContext = {
    id: athlete.id,
    first_name: athlete.first_name,
    experience_level: athlete.experience_level,
    injuries: athlete.injuries,
    notes: athlete.notes,
    sex: athlete.sex,
    birth_date: athlete.birth_date,
    age: athlete.birth_date ? ageOn(athlete.birth_date, asOf) : null,
  };
  const workoutContext = {
    title: workout.title,
    workout_type: workout.workout_type,
    time_cap_seconds: workout.time_cap_seconds,
    rounds: workout.rounds,
    description: workout.description,
    notes: workout.notes,
    movements: workout.workout_movements.map(({ movements: movement, load_kg, ...item }) => ({
      ...item,
      name: movement?.name ?? "",
      load: load_kg == null ? null : fromKgPrecise(load_kg, units),
    })),
  };
  const recentResults = (resultRows ?? []).map((result) => ({
    performed_on: result.performed_on,
    workout_title: result.workouts?.title ?? "Workout",
    workout_type: result.workouts?.workout_type ?? "other",
    score: formatScore(result, units),
    is_rx: result.is_rx,
    rpe: result.rpe,
    pain_notes: result.pain_notes,
  }));
  const note = params.request?.trim() || null;
  const input = {
    workout_id: workout.id,
    workout_updated_at: workout.updated_at,
    units,
    note,
    athlete: athleteContext,
    workout: workoutContext,
    library,
    recent_results: recentResults,
  } satisfies Json;

  return {
    input,
    system: SCALE_WORKOUT_SYSTEM,
    prompt: `Athlete, WOD, and recent result context (JSON):\n${JSON.stringify(input, null, 2)}\n\nReturn a complete scaled WOD proposal.`,
    schema: scaleWorkoutSchema.extend({
      changes: z
        .array(
          scaleWorkoutChangeSchema.extend({
            original_movement_id: movementIdSchema(library.map(({ id }) => id)),
            movement_id: movementIdSchema(library.map(({ id }) => id)),
          }),
        )
        .min(1)
        .max(30),
    }),
  };
}

export function validateScaleProposal(proposal: unknown, input: Json) {
  const parsedProposal = scaleWorkoutSchema.parse(proposal);
  const parsedInput = scaleWorkoutInputSchema.parse(input);
  const originalMovements = parsedInput.workout.movements;
  if (parsedProposal.changes.length !== originalMovements.length)
    throw new Error("scaled movement count mismatch");

  const allowedMovementIds = new Set(parsedInput.library.map(({ id }) => id));
  parsedProposal.changes.forEach((change, index) => {
    const original = originalMovements[index];
    if (!original || change.original_movement_id !== original.movement_id)
      throw new Error("original movement id mismatch");
    if (!allowedMovementIds.has(change.movement_id)) throw new Error("unknown movement id");
    if (change.movement_id !== original.movement_id) return;

    if (original.load != null && change.load != null && change.load > original.load + 0.5)
      throw new Error("scaled movement load exceeds original");
    for (const field of ["reps", "distance_m", "calories", "duration_seconds"] as const) {
      if (original[field] != null && change[field] != null && change[field]! > original[field]!)
        throw new Error(`scaled movement ${field} exceeds original`);
    }
  });
}

export async function applyScaleSuggestion(
  supabase: SupabaseClient<Database>,
  suggestion: Tables<"ai_suggestions">,
  final: unknown,
): Promise<{ target_table: string; target_id: string }> {
  const parsed = scaleWorkoutSchema.parse(final);
  const input = scaleWorkoutInputSchema.safeParse(suggestion.input);
  if (!input.success) throw new ApprovalError("This scaling suggestion is missing its WOD details. Ask again.");
  if (!suggestion.athlete_id || suggestion.athlete_id !== input.data.athlete.id)
    throw new ApprovalError("This scaling suggestion is missing its athlete. Ask again.");

  const { data: workout, error: workoutError } = await supabase
    .from("workouts")
    .select("updated_at")
    .eq("id", input.data.workout_id)
    .maybeSingle();
  if (workoutError) throw workoutError;
  if (!workout || workout.updated_at > input.data.workout_updated_at)
    throw new ApprovalError("This WOD was edited after the AI suggestion was made. Ask again.");

  const movementNames = new Map(input.data.library.map(({ id, name }) => [id, name]));
  const details = {
    source: "ai",
    suggestion_id: suggestion.id,
    movements: parsed.changes.map(({ load, ...movement }) => ({
      ...movement,
      movement_name: movementNames.get(movement.movement_id) ?? "",
      load_kg: load == null ? null : toKg(load, input.data.units as Units),
    })),
  } satisfies Json;
  const { data: scaling, error } = await supabase
    .from("athlete_workout_scalings")
    .upsert(
      {
        workout_id: input.data.workout_id,
        athlete_id: suggestion.athlete_id,
        modifications: parsed.summary,
        details,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workout_id,athlete_id" },
    )
    .select("id")
    .single();
  if (error) throw error;
  return { target_table: "athlete_workout_scalings", target_id: scaling.id };
}

export async function deleteWorkoutScalingWithClient(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<{ workout_id: string; athlete_id: string } | null> {
  const { data, error } = await supabase
    .from("athlete_workout_scalings")
    .delete()
    .eq("id", id)
    .select("workout_id, athlete_id")
    .maybeSingle();
  if (error) throw error;
  return data;
}
