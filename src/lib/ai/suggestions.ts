import { z } from "zod";
import { movementGuideEntry } from "./movement-guides";
import type { SupabaseClient } from "@supabase/supabase-js";

import { addDays, totals } from "@/lib/nutrition";
import { applyTarget } from "@/lib/nutrition-targets";
import { today } from "@/lib/program-dates";
import { WORKOUT_TYPES } from "@/app/(app)/programs/options";
import { fromKgPrecise, toKg } from "@/lib/units";
import type { Database, Enums, Json, Tables } from "@/lib/supabase/database.types";

export const SUGGESTION_LABELS: Record<Enums<"suggestion_type">, string> = {
  write_workout: "Write workout",
  scale_workout: "Scale workout",
  adjust_macros: "Adjust macros",
  progress_summary: "Progress summary",
  movement_guide: "Movement how-to",
};

export const adjustMacrosSchema = z.object({
  calories: z.number().int().min(500).max(10_000),
  protein_g: z.number().int().min(0).max(2000),
  carbs_g: z.number().int().min(0).max(2000),
  fat_g: z.number().int().min(0).max(2000),
  rationale: z.string().min(1).max(1000),
});

export const writeWorkoutSchema = z.object({
  title: z.string().min(1).max(80),
  workout_type: z.enum(WORKOUT_TYPES),
  time_cap_minutes: z.number().int().min(1).max(180).nullable(),
  rounds: z.number().int().min(1).max(100).nullable(),
  description: z.string().max(1000).nullable(),
  notes: z.string().max(1000).nullable(),
  movements: z
    .array(
      z.object({
        movement_id: z.string(),
        sets: z.number().int().min(1).max(100).nullable(),
        reps: z.number().int().min(1).max(1000).nullable(),
        load: z.number().min(0).max(2000).nullable(),
        distance_m: z.number().min(1).max(100_000).nullable(),
        calories: z.number().int().min(1).max(1000).nullable(),
        duration_seconds: z.number().int().min(1).max(7200).nullable(),
        notes: z.string().max(200).nullable(),
      }),
    )
    .min(1)
    .max(15),
  rationale: z.string().min(1).max(1000),
});

export const writeWorkoutInputSchema = z.object({
  mode: z.enum(["write", "adjust"]),
  request: z.string(),
  units: z.enum(["lb", "kg"]),
  library: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      category: z.string(),
      measure: z.string(),
    }),
  ),
  workout_id: z.string().uuid().optional(),
  workout_updated_at: z.string().optional(),
  current_workout: z
    .object({
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
    })
    .optional(),
});

export const scaleWorkoutSchema = writeWorkoutSchema.extend({
  movements: z
    .array(writeWorkoutSchema.shape.movements.element.extend({ movement_name: z.string().max(200) }))
    .min(1)
    .max(15),
  changes: z
    .array(
      z.object({
        change: z.string().min(1).max(200),
        reason: z.string().min(1).max(300),
      }),
    )
    .max(15),
});

const workoutSnapshotSchema = z.object({
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
});

export const scaleWorkoutInputSchema = z.object({
  workout_id: z.string().uuid(),
  scheduled_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  request: z.string().nullable(),
  units: z.enum(["lb", "kg"]),
  library: writeWorkoutInputSchema.shape.library,
  current_workout: workoutSnapshotSchema,
});

type SuggestionRequest = { input: Json; system: string; prompt: string };
type AppliedTarget = { target_table: string; target_id: string };
type SuggestionParams = {
  athleteId: string | null;
  workoutId?: string | null;
  request?: string | null;
  scheduledOn?: string | null;
};
export type SuggestionApplyOptions = { saveAs?: "update" | "new" };
export class ApprovalError extends Error {}

type SuggestionEntry = {
  label: string;
  proposalSchema: z.ZodType;
  buildRequest?: (supabase: SupabaseClient<Database>, params: SuggestionParams) => Promise<SuggestionRequest>;
  validate?: (proposal: unknown, input: Json) => void;
  normalize?: (proposal: unknown, input: Json) => unknown;
  apply?: (
    supabase: SupabaseClient<Database>,
    suggestion: Tables<"ai_suggestions">,
    final: unknown,
    options?: SuggestionApplyOptions,
  ) => Promise<AppliedTarget>;
};

const ADJUST_MACROS_SYSTEM = `You help a CrossFit coach set daily macro targets for one athlete. The coach reviews every suggestion before anything changes.
Rules:
- Use only the data provided. Do not invent measurements.
- Base protein on body weight: 1.6–2.2 g per kg unless the data clearly calls for something else.
- Keep calories consistent with the macros: protein×4 + carbs×4 + fat×9 must be within 5% of calories.
- If there is a current target, change calories by no more than 15% from it.
- If the food log shows the athlete is far from their current target, say so. The fix may be adherence, not new numbers.
- Write the rationale for the coach in 2–4 short, plain-English sentences, citing the numbers you relied on.`;

function ageOn(birthDate: string, asOf: string) {
  const birth = new Date(`${birthDate}T00:00:00Z`);
  const date = new Date(`${asOf}T00:00:00Z`);
  let age = date.getUTCFullYear() - birth.getUTCFullYear();
  if (
    date.getUTCMonth() < birth.getUTCMonth() ||
    (date.getUTCMonth() === birth.getUTCMonth() && date.getUTCDate() < birth.getUTCDate())
  )
    age -= 1;
  return age;
}

async function buildMacroRequest(supabase: SupabaseClient<Database>, params: SuggestionParams): Promise<SuggestionRequest> {
  const { athleteId } = params;
  if (!athleteId) throw new Error("Athlete not found.");
  const asOf = today();
  const [
    { data: athlete, error: athleteError },
    { data: target, error: targetError },
    { data: food, error: foodError },
    { data: weights, error: weightsError },
    { data: goals, error: goalsError },
  ] = await Promise.all([
    supabase
      .from("athletes")
      .select("first_name, birth_date, sex, height_cm, experience_level, injuries")
      .eq("id", athleteId)
      .maybeSingle(),
    supabase
      .from("nutrition_targets")
      .select("calories, protein_g, carbs_g, fat_g, start_date, end_date")
      .eq("athlete_id", athleteId)
      .lte("start_date", asOf)
      .or(`end_date.is.null,end_date.gte.${asOf}`)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("food_logs")
      .select("logged_on, calories, protein_g, carbs_g, fat_g")
      .eq("athlete_id", athleteId)
      .gte("logged_on", addDays(asOf, -13))
      .lte("logged_on", asOf),
    supabase
      .from("body_metrics")
      .select("measured_on, weight_kg")
      .eq("athlete_id", athleteId)
      .gte("measured_on", addDays(asOf, -55))
      .not("weight_kg", "is", null)
      .order("measured_on", { ascending: true }),
    supabase
      .from("goals")
      .select("title, metric, unit, start_value, target_value, target_date")
      .eq("athlete_id", athleteId)
      .eq("goal_type", "body_composition")
      .eq("status", "active"),
  ]);

  if (athleteError || !athlete) throw athleteError ?? new Error("Athlete not found.");
  if (targetError) throw targetError;
  if (foodError) throw foodError;
  if (weightsError) throw weightsError;
  if (goalsError) throw goalsError;

  const loggedDays = new Map<string, typeof food>();
  for (const row of food ?? []) {
    const day = loggedDays.get(row.logged_on) ?? [];
    day.push(row);
    loggedDays.set(row.logged_on, day);
  }
  const dailyTotals = [...loggedDays.values()].map((rows) => totals(rows));
  const total = dailyTotals.reduce(
    (sum, day) => ({
      calories: sum.calories + day.calories,
      protein: sum.protein + day.protein,
      carbs: sum.carbs + day.carbs,
      fat: sum.fat + day.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const daysLogged = dailyTotals.length;
  const input = {
    athlete: {
      first_name: athlete.first_name,
      sex: athlete.sex,
      age: athlete.birth_date ? ageOn(athlete.birth_date, asOf) : null,
      height_cm: athlete.height_cm,
      experience_level: athlete.experience_level,
      injuries: athlete.injuries,
    },
    current_target: target,
    food_log_last_14_days: {
      days_logged: daysLogged,
      avg_calories: daysLogged ? Math.round(total.calories / daysLogged) : null,
      avg_protein_g: daysLogged ? Math.round(total.protein / daysLogged) : null,
      avg_carbs_g: daysLogged ? Math.round(total.carbs / daysLogged) : null,
      avg_fat_g: daysLogged ? Math.round(total.fat / daysLogged) : null,
    },
    body_weight_kg_last_8_weeks: (weights ?? []).map((row) => ({ date: row.measured_on, kg: row.weight_kg })),
    active_body_composition_goals: goals ?? [],
  } satisfies Json;

  return {
    input,
    system: ADJUST_MACROS_SYSTEM,
    prompt: `Athlete data (JSON):\n${JSON.stringify(input, null, 2)}\n\nPropose new daily macro targets.`,
  };
}

const WRITE_WORKOUT_SYSTEM = `You help a CrossFit coach program WODs. The coach reviews every suggestion before anything changes.
Rules:
- Use ONLY movements from the provided library list, referenced by movement_id. Never invent movements.
- Loads are in the coach's preferred units (<units>). Use realistic barbell, dumbbell, and kettlebell numbers (Rx loads for an intermediate athlete unless the request says otherwise).
- Set fields that do not apply to null.
- Match workout_type to the format: for_time (usually with a time cap), amrap (time_cap_minutes is the AMRAP length), emom (time_cap_minutes is total minutes; rounds optional), strength (sets and reps with load), or other.
- For adjust mode, keep the WOD's intent and structure unless requested otherwise; change only what is needed. A title suffix such as "(harder)" may be used only when saving as a new WOD.
- Write the rationale for the coach in 2–4 short, plain-English sentences.`;

async function buildWorkoutRequest(
  supabase: SupabaseClient<Database>,
  params: SuggestionParams,
): Promise<SuggestionRequest> {
  const request = params.request?.trim();
  if (!request) throw new Error("A workout request is required.");

  const [{ data: coach, error: coachError }, { data: library, error: libraryError }] = await Promise.all([
    supabase.from("coaches").select("units").maybeSingle(),
    supabase.from("movements").select("id, name, category, measure").order("name"),
  ]);
  if (coachError || !coach) throw coachError ?? new Error("Coach not found.");
  if (libraryError) throw libraryError;

  const units = coach.units;
  let workoutId: string | null = null;
  let workoutUpdatedAt: string | null = null;
  let currentWorkout: Json | null = null;

  if (params.workoutId) {
    const { data: workout, error: workoutError } = await supabase
      .from("workouts")
      .select(
        "id, title, workout_type, time_cap_seconds, rounds, description, notes, updated_at, workout_movements(position, movement_id, sets, reps, load_kg, distance_m, calories, duration_seconds, notes, movements(name))",
      )
      .eq("id", params.workoutId)
      .order("position", { referencedTable: "workout_movements" })
      .maybeSingle();
    if (workoutError || !workout) throw workoutError ?? new Error("Workout not found.");

    workoutId = workout.id;
    workoutUpdatedAt = workout.updated_at;
    currentWorkout = {
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
    } satisfies Json;
  }

  const input = {
    mode: workoutId ? "adjust" : "write",
    request,
    units,
    library: library ?? [],
    ...(workoutId && workoutUpdatedAt && currentWorkout
      ? { workout_id: workoutId, workout_updated_at: workoutUpdatedAt, current_workout: currentWorkout }
      : {}),
  } satisfies Json;
  return {
    input,
    system: WRITE_WORKOUT_SYSTEM.replace("<units>", units),
    prompt: `Request: ${request}\n\nProgram context (JSON):\n${JSON.stringify(input, null, 2)}\n\nReturn a complete WOD proposal.`,
  };
}

function validateWorkoutProposal(proposal: unknown, input: Json) {
  const parsedProposal = writeWorkoutSchema.parse(proposal);
  const parsedInput = writeWorkoutInputSchema.parse(input);
  const allowedMovementIds = new Set(parsedInput.library.map(({ id }) => id));
  if (parsedProposal.movements.some(({ movement_id }) => !allowedMovementIds.has(movement_id)))
    throw new Error("unknown movement id");
}

async function applyWorkoutSuggestion(
  supabase: SupabaseClient<Database>,
  suggestion: Tables<"ai_suggestions">,
  final: unknown,
  options?: SuggestionApplyOptions,
): Promise<AppliedTarget> {
  const parsed = writeWorkoutSchema.parse(final);
  validateWorkoutProposal(parsed, suggestion.input);
  const input = writeWorkoutInputSchema.safeParse(suggestion.input);
  if (!input.success) throw new ApprovalError("This suggestion is missing its workout details. Ask again.");

  let workoutId: string | null = null;
  let expectedUpdatedAt: string | null = null;
  if (input.data.mode === "adjust") {
    if (!input.data.workout_id || !input.data.workout_updated_at)
      throw new ApprovalError("This WOD no longer exists. Ask for a new suggestion.");
    const { data: currentWorkout, error } = await supabase
      .from("workouts")
      .select("updated_at")
      .eq("id", input.data.workout_id)
      .maybeSingle();
    if (error) throw error;
    if (!currentWorkout) throw new ApprovalError("This WOD no longer exists. Ask for a new suggestion.");
    if (
      options?.saveAs !== "new" &&
      currentWorkout.updated_at > input.data.workout_updated_at
    )
      throw new ApprovalError("This WOD was edited after the AI suggestion was made. Ask again or save as a new WOD.");
    if (options?.saveAs !== "new") {
      workoutId = input.data.workout_id;
      expectedUpdatedAt = input.data.workout_updated_at;
    }
  }

  const workout = {
    title: parsed.title,
    workout_type: parsed.workout_type,
    time_cap_seconds: parsed.time_cap_minutes == null ? null : parsed.time_cap_minutes * 60,
    rounds: parsed.rounds,
    description: parsed.description,
    notes: parsed.notes,
  } satisfies Json;
  const movements = parsed.movements.map(({ load, ...movement }) => ({
    ...movement,
    load_kg: load == null ? null : toKg(load, input.data.units),
  })) satisfies Json;
  const { data: targetId, error } = await supabase.rpc("save_ai_workout", {
    p_workout_id: workoutId,
    p_workout: workout,
    p_movements: movements,
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) {
    if (error.message.includes("workout_changed"))
      throw new ApprovalError("This WOD was edited after the AI suggestion was made. Ask again or save as a new WOD.");
    if (error.message.includes("workout_not_found"))
      throw new ApprovalError("This WOD no longer exists. Ask for a new suggestion.");
    throw error;
  }
  if (!targetId) throw new Error("The WOD could not be saved.");
  return { target_table: "workouts", target_id: targetId };
}

async function applyMacroSuggestion(
  supabase: SupabaseClient<Database>,
  suggestion: Tables<"ai_suggestions">,
  final: unknown,
): Promise<AppliedTarget> {
  const parsed = adjustMacrosSchema.parse(final);
  if (!suggestion.athlete_id) throw new Error("This suggestion has no athlete.");
  const startDate = today();
  const { data: openTarget, error: targetError } = await supabase
    .from("nutrition_targets")
    .select("start_date")
    .eq("athlete_id", suggestion.athlete_id)
    .is("end_date", null)
    .maybeSingle();
  if (targetError) throw targetError;
  if (openTarget && openTarget.start_date > startDate)
    throw new ApprovalError(
      `This athlete already has a target scheduled to start on ${openTarget.start_date}. Change that target on the nutrition page first, then approve.`,
    );

  const result = await applyTarget(supabase, {
    athlete_id: suggestion.athlete_id,
    calories: parsed.calories,
    protein_g: parsed.protein_g,
    carbs_g: parsed.carbs_g,
    fat_g: parsed.fat_g,
    start_date: startDate,
    notes: `AI suggestion: ${parsed.rationale}`.slice(0, 500),
  });
  if ("error" in result) throw new Error(result.error);
  return { target_table: "nutrition_targets", target_id: result.id };
}

const SCALE_WORKOUT_SYSTEM = `You help a CrossFit coach scale one WOD for one athlete. The coach reviews every suggestion before anything changes.
Rules:
- Use ONLY movements from the provided library list. Copy each movement_id exactly from the library and set movement_name to that library entry's exact name. Never invent movements.
- Keep the WOD's intent, format and time domain. Change only what this athlete needs.
- Base loads on the athlete's recent results and experience level. Loads are in the coach's preferred units (<units>).
- Work around injuries: substitute movements that load an injured area, and never make the WOD harder because of an injury.
- If the athlete has no recent results, scale conservatively for their experience level.
- List every change you made in "changes" (one short line each, e.g. "Box jumps → box step-ups") with a short reason that cites the athlete data. If nothing needs to change, return the WOD as is with an empty list.
- Do not add "(scaled)" or the athlete's name to the title.
- Write the overall rationale for the coach in 2–4 short, plain-English sentences.`;

async function buildScaleRequest(supabase: SupabaseClient<Database>, params: SuggestionParams): Promise<SuggestionRequest> {
  const { athleteId, workoutId, scheduledOn } = params;
  if (!athleteId) throw new Error("Athlete not found.");
  if (!workoutId) throw new Error("Workout not found.");
  if (!scheduledOn) throw new Error("A date is required.");

  const [
    { data: coach, error: coachError },
    { data: library, error: libraryError },
    { data: athlete, error: athleteError },
    { data: workout, error: workoutError },
    { data: results, error: resultsError },
  ] = await Promise.all([
    supabase.from("coaches").select("units").maybeSingle(),
    supabase.from("movements").select("id, name, category, measure").order("name"),
    supabase
      .from("athletes")
      .select("first_name, sex, birth_date, experience_level, injuries, notes")
      .eq("id", athleteId)
      .maybeSingle(),
    supabase
      .from("workouts")
      .select(
        "id, title, workout_type, time_cap_seconds, rounds, description, notes, workout_movements(position, movement_id, sets, reps, load_kg, distance_m, calories, duration_seconds, notes, movements(name))",
      )
      .eq("id", workoutId)
      .order("position", { referencedTable: "workout_movements" })
      .maybeSingle(),
    supabase
      .from("workout_results")
      .select("performed_on, time_seconds, rounds, reps, load_kg, is_rx, rpe, soreness, pain_notes, notes, workouts(title, workout_type)")
      .eq("athlete_id", athleteId)
      .order("performed_on", { ascending: false })
      .limit(15),
  ]);
  if (coachError || !coach) throw coachError ?? new Error("Coach not found.");
  if (libraryError) throw libraryError;
  if (athleteError || !athlete) throw athleteError ?? new Error("Athlete not found.");
  if (workoutError || !workout) throw workoutError ?? new Error("Workout not found.");
  if (resultsError) throw resultsError;

  const units = coach.units;
  const input = {
    workout_id: workout.id,
    scheduled_on: scheduledOn,
    request: params.request?.trim() || null,
    units,
    library: library ?? [],
    current_workout: {
      title: workout.title,
      workout_type: workout.workout_type,
      time_cap_seconds: workout.time_cap_seconds,
      rounds: workout.rounds,
      description: workout.description,
      notes: workout.notes,
      movements: workout.workout_movements.map((item) => ({
        movement_id: item.movement_id,
        name: item.movements?.name ?? "",
        sets: item.sets,
        reps: item.reps,
        load: item.load_kg == null ? null : fromKgPrecise(item.load_kg, units),
        distance_m: item.distance_m,
        calories: item.calories,
        duration_seconds: item.duration_seconds,
        notes: item.notes,
      })),
    },
  } satisfies Json;
  const athleteContext = {
    first_name: athlete.first_name,
    sex: athlete.sex,
    age: athlete.birth_date ? ageOn(athlete.birth_date, scheduledOn) : null,
    experience_level: athlete.experience_level,
    injuries: athlete.injuries,
    coach_notes: athlete.notes,
    recent_results: (results ?? []).map(({ workouts: resultWorkout, load_kg, ...result }) => ({
      ...result,
      workout: resultWorkout?.title ?? null,
      workout_type: resultWorkout?.workout_type ?? null,
      load: load_kg == null ? null : fromKgPrecise(load_kg, units),
    })),
  };

  return {
    input,
    system: SCALE_WORKOUT_SYSTEM.replace("<units>", units),
    prompt: `Athlete (JSON):\n${JSON.stringify(athleteContext, null, 2)}\n\nWOD and movement library (JSON):\n${JSON.stringify(input, null, 2)}\n\n${input.request ? `Coach note: ${input.request}\n\n` : ""}Return the scaled WOD for this athlete.`,
  };
}

function normalizeScaleProposal(proposal: unknown, input: Json) {
  const parsedProposal = scaleWorkoutSchema.parse(proposal);
  const { library } = scaleWorkoutInputSchema.parse(input);
  const ids = new Set(library.map(({ id }) => id));
  const idsByName = new Map(library.map(({ id, name }) => [name.trim().toLowerCase(), id]));
  return {
    ...parsedProposal,
    movements: parsedProposal.movements.map((movement) =>
      ids.has(movement.movement_id)
        ? movement
        : { ...movement, movement_id: idsByName.get(movement.movement_name.trim().toLowerCase()) ?? movement.movement_id },
    ),
  };
}

function validateScaleProposal(proposal: unknown, input: Json) {
  const parsedProposal = scaleWorkoutSchema.parse(proposal);
  const parsedInput = scaleWorkoutInputSchema.parse(input);
  const allowedMovementIds = new Set(parsedInput.library.map(({ id }) => id));
  if (parsedProposal.movements.some(({ movement_id }) => !allowedMovementIds.has(movement_id)))
    throw new Error("unknown movement id");
}

async function applyScaleSuggestion(
  supabase: SupabaseClient<Database>,
  suggestion: Tables<"ai_suggestions">,
  final: unknown,
): Promise<AppliedTarget> {
  const parsed = scaleWorkoutSchema.parse(final);
  validateScaleProposal(parsed, suggestion.input);
  const input = scaleWorkoutInputSchema.safeParse(suggestion.input);
  if (!input.success || !suggestion.athlete_id)
    throw new ApprovalError("This suggestion is missing its workout details. Ask again.");

  const { data: targetId, error } = await supabase.rpc("save_scaled_workout", {
    p_source_workout_id: input.data.workout_id,
    p_athlete_id: suggestion.athlete_id,
    p_scheduled_on: input.data.scheduled_on,
    p_workout: {
      title: parsed.title,
      workout_type: parsed.workout_type,
      time_cap_seconds: parsed.time_cap_minutes == null ? null : parsed.time_cap_minutes * 60,
      rounds: parsed.rounds,
      description: parsed.description,
      notes: parsed.notes,
    },
    p_movements: parsed.movements.map((movement) => ({
      movement_id: movement.movement_id,
      sets: movement.sets,
      reps: movement.reps,
      load_kg: movement.load == null ? null : toKg(movement.load, input.data.units),
      distance_m: movement.distance_m,
      calories: movement.calories,
      duration_seconds: movement.duration_seconds,
      notes: movement.notes,
    })),
  });
  if (error) {
    if (error.message.includes("workout_not_found"))
      throw new ApprovalError("The original WOD no longer exists. Ask for a new suggestion.");
    if (error.message.includes("athlete_not_found"))
      throw new ApprovalError("This athlete is no longer on your roster.");
    throw error;
  }
  if (!targetId) throw new Error("The scaled WOD could not be saved.");
  return { target_table: "workouts", target_id: targetId };
}

export const SUGGESTION_REGISTRY: Record<Enums<"suggestion_type">, SuggestionEntry> = {
  movement_guide: movementGuideEntry,
  write_workout: {
    label: SUGGESTION_LABELS.write_workout,
    proposalSchema: writeWorkoutSchema,
    buildRequest: buildWorkoutRequest,
    validate: validateWorkoutProposal,
    apply: applyWorkoutSuggestion,
  },
  scale_workout: {
    label: SUGGESTION_LABELS.scale_workout,
    proposalSchema: scaleWorkoutSchema,
    buildRequest: buildScaleRequest,
    validate: validateScaleProposal,
    normalize: normalizeScaleProposal,
    apply: applyScaleSuggestion,
  },
  adjust_macros: {
    label: SUGGESTION_LABELS.adjust_macros,
    proposalSchema: adjustMacrosSchema,
    buildRequest: buildMacroRequest,
    apply: applyMacroSuggestion,
  },
  progress_summary: { label: SUGGESTION_LABELS.progress_summary, proposalSchema: z.unknown() },
};
