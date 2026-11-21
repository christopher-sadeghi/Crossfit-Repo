import { z } from "zod";
import { ApprovalError } from "./errors";
import { foodAverages, trainingVolume, weightTrend } from "./athlete-context";
import { movementGuideEntry } from "./movement-guides";
import { progressSummaryEntry } from "./progress-summary";
import type { SupabaseClient } from "@supabase/supabase-js";

import { addDays } from "@/lib/nutrition";
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

export { ApprovalError };

type SuggestionRequest = { input: Json; system: string; prompt: string };
type AppliedTarget = { target_table: string; target_id: string };
type SuggestionParams = { athleteId: string | null; workoutId?: string | null; request?: string | null };
export type SuggestionApplyOptions = { saveAs?: "update" | "new" };

type SuggestionEntry = {
  label: string;
  proposalSchema: z.ZodType;
  buildRequest?: (supabase: SupabaseClient<Database>, params: SuggestionParams) => Promise<SuggestionRequest>;
  validate?: (proposal: unknown, input: Json) => void;
  apply?: (
    supabase: SupabaseClient<Database>,
    suggestion: Tables<"ai_suggestions">,
    final: unknown,
    options?: SuggestionApplyOptions,
  ) => Promise<AppliedTarget>;
};

export const MACRO_DISCLAIMER =
  "AI suggestions are general fitness guidance, not medical or dietetic advice. Check with a doctor or registered dietitian for athletes with medical conditions, eating disorders, pregnancy, or other health concerns.";

const ADJUST_MACROS_SYSTEM = `You help a CrossFit coach set daily macro targets for one athlete. The coach reviews every suggestion before anything changes.
Rules:
- Use only the data provided. Do not invent measurements.
- Consider the athlete's goals, body weight trend, recent food intake, and training volume together.
- Base protein on body weight: 1.6–2.2 g per kg unless the data clearly calls for something else.
- Keep calories consistent with the macros: protein×4 + carbs×4 + fat×9 must be within 5% of calories.
- If there is a current target, change calories by no more than 15% from it.
- More or harder training generally supports more carbohydrate; fewer sessions supports less.
- If the food log shows the athlete is far from their current target, say so. The fix may be adherence, not new numbers.
- If data is thin (few weigh-ins or food days), say so and keep changes small.
- This is general fitness guidance, not medical advice. Never diagnose or give medical or clinical nutrition advice.
- Write the rationale for the coach in 2–4 short, plain-English sentences, citing the numbers you relied on (goal, weight trend, intake, training).`;

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
    training,
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
      .select("title, goal_type, metric, unit, start_value, target_value, target_date")
      .eq("athlete_id", athleteId)
      .eq("status", "active"),
    trainingVolume(supabase, athleteId, asOf),
  ]);

  if (athleteError || !athlete) throw athleteError ?? new Error("Athlete not found.");
  if (targetError) throw targetError;
  if (foodError) throw foodError;
  if (weightsError) throw weightsError;
  if (goalsError) throw goalsError;

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
    food_log_last_14_days: foodAverages(food ?? []),
    body_weight_trend_last_8_weeks: weightTrend(weights ?? []),
    body_weight_kg_last_8_weeks: (weights ?? []).map((row) => ({ date: row.measured_on, kg: row.weight_kg })),
    training_last_4_weeks: training,
    active_goals: goals ?? [],
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

export const SUGGESTION_REGISTRY: Record<Enums<"suggestion_type">, SuggestionEntry> = {
  movement_guide: movementGuideEntry,
  write_workout: {
    label: SUGGESTION_LABELS.write_workout,
    proposalSchema: writeWorkoutSchema,
    buildRequest: buildWorkoutRequest,
    validate: validateWorkoutProposal,
    apply: applyWorkoutSuggestion,
  },
  scale_workout: { label: SUGGESTION_LABELS.scale_workout, proposalSchema: z.unknown() },
  adjust_macros: {
    label: SUGGESTION_LABELS.adjust_macros,
    proposalSchema: adjustMacrosSchema,
    buildRequest: buildMacroRequest,
    apply: applyMacroSuggestion,
  },
  progress_summary: progressSummaryEntry,
};
