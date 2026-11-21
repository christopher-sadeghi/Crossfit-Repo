import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { addDays, totals } from "@/lib/nutrition";
import { applyTarget } from "@/lib/nutrition-targets";
import type { Database, Enums, Json, Tables } from "@/lib/supabase/database.types";
import { getToday } from "@/lib/time-zone";

export const SUGGESTION_LABELS: Record<Enums<"suggestion_type">, string> = {
  write_workout: "Write workout",
  scale_workout: "Scale workout",
  adjust_macros: "Adjust macros",
  progress_summary: "Progress summary",
};

export const adjustMacrosSchema = z.object({
  calories: z.number().int().min(500).max(10_000),
  protein_g: z.number().int().min(0).max(2000),
  carbs_g: z.number().int().min(0).max(2000),
  fat_g: z.number().int().min(0).max(2000),
  rationale: z.string().min(1).max(1000),
});

type SuggestionRequest = { input: Json; system: string; prompt: string };
type AppliedTarget = { target_table: string; target_id: string };
export class ApprovalError extends Error {}

type SuggestionEntry = {
  label: string;
  proposalSchema: z.ZodType;
  buildRequest?: (supabase: SupabaseClient<Database>, athleteId: string) => Promise<SuggestionRequest>;
  apply?: (
    supabase: SupabaseClient<Database>,
    suggestion: Tables<"ai_suggestions">,
    final: unknown,
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

async function buildMacroRequest(supabase: SupabaseClient<Database>, athleteId: string): Promise<SuggestionRequest> {
  const asOf = await getToday();
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

async function applyMacroSuggestion(
  supabase: SupabaseClient<Database>,
  suggestion: Tables<"ai_suggestions">,
  final: unknown,
): Promise<AppliedTarget> {
  const parsed = adjustMacrosSchema.parse(final);
  if (!suggestion.athlete_id) throw new Error("This suggestion has no athlete.");
  const startDate = await getToday();
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
  write_workout: { label: SUGGESTION_LABELS.write_workout, proposalSchema: z.unknown() },
  scale_workout: { label: SUGGESTION_LABELS.scale_workout, proposalSchema: z.unknown() },
  adjust_macros: {
    label: SUGGESTION_LABELS.adjust_macros,
    proposalSchema: adjustMacrosSchema,
    buildRequest: buildMacroRequest,
    apply: applyMacroSuggestion,
  },
  progress_summary: { label: SUGGESTION_LABELS.progress_summary, proposalSchema: z.unknown() },
};
