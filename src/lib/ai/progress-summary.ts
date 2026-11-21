import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { addDays } from "@/lib/nutrition";
import { today } from "@/lib/program-dates";
import { formatGoalValue, goalProgress, TRACKING_LABELS } from "@/lib/progress";
import type { Database, Json, Tables } from "@/lib/supabase/database.types";
import { formatDate } from "@/lib/units";

import { foodAverages, trainingVolume, weightTrend } from "./athlete-context";
import { ApprovalError } from "./errors";

export const NOTES_MAX = 2000;
export const GOAL_STATUSES = ["reached", "on_track", "behind", "no_data"] as const;
export const GOAL_STATUS_LABELS: Record<(typeof GOAL_STATUSES)[number], string> = {
  reached: "Reached",
  on_track: "On track",
  behind: "Behind",
  no_data: "Not enough data",
};

export const progressSummarySchema = z.object({
  summary: z.string().trim().min(1).max(800),
  goals: z
    .array(
      z.object({
        goal_id: z.string(),
        status: z.enum(GOAL_STATUSES),
        note: z.string().trim().min(1).max(240),
      }),
    )
    .max(20),
});
export type ProgressSummary = z.infer<typeof progressSummarySchema>;

export const progressSummaryInputSchema = z.object({
  as_of: z.string(),
  goals: z.array(z.object({ id: z.string(), title: z.string() })),
});

const SYSTEM = `You help a CrossFit coach write a short progress note about one athlete. The coach reviews the note before it is saved.
Rules:
- Use only the data provided. Do not invent numbers.
- Return one entry per goal in the goals list, using its id. Status: "reached" if achieved or the target is met; "on_track" if the current value and pace look likely to hit the target by its date; "behind" if not; "no_data" if there is no current value or start value to judge from.
- Each goal note is one plain-English sentence that cites the numbers (start, current, target, date) exactly as given.
- The summary is 2–4 short sentences for the coach about overall progress, including training consistency, body weight trend, and nutrition adherence when there is data. If there are no goals, say so and summarise the rest.
- Values are already formatted in the coach's units; repeat them as given.
- This is general fitness coaching, not medical advice. Never diagnose.`;

async function buildRequest(supabase: SupabaseClient<Database>, { athleteId }: { athleteId: string | null }) {
  if (!athleteId) throw new Error("Athlete not found.");
  const asOf = today();
  const [
    { data: coach, error: coachError },
    { data: athlete, error: athleteError },
    { data: goals, error: goalsError },
    { data: metrics, error: metricsError },
    { data: results, error: resultsError },
    { data: target, error: targetError },
    { data: food, error: foodError },
    training,
  ] = await Promise.all([
    supabase.from("coaches").select("units").maybeSingle(),
    supabase.from("athletes").select("first_name, experience_level").eq("id", athleteId).maybeSingle(),
    supabase
      .from("goals")
      .select("id, title, goal_type, movement_id, metric, unit, start_value, target_value, target_date, status, achieved_at, movements(name)")
      .eq("athlete_id", athleteId)
      .or(`status.eq.active,and(status.eq.achieved,achieved_at.gte.${addDays(asOf, -90)})`)
      .order("target_date", { nullsFirst: false }),
    supabase.from("body_metrics").select("measured_on, weight_kg, body_fat_pct").eq("athlete_id", athleteId).order("measured_on"),
    supabase
      .from("workout_results")
      .select("performed_on, load_kg, reps, rounds, workouts(workout_type, workout_movements(movement_id))")
      .eq("athlete_id", athleteId),
    supabase
      .from("nutrition_targets")
      .select("calories, protein_g, carbs_g, fat_g")
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
    trainingVolume(supabase, athleteId, asOf),
  ]);
  if (coachError || !coach) throw coachError ?? new Error("Coach not found.");
  if (athleteError || !athlete) throw athleteError ?? new Error("Athlete not found.");
  for (const error of [goalsError, metricsError, resultsError, targetError, foodError]) if (error) throw error;

  const units = coach.units;
  const allMetrics = metrics ?? [];
  const progressData = { metrics: allMetrics, results: results ?? [] };
  const goalInputs = (goals ?? []).map((goal) => {
    const progress = goalProgress(goal, progressData);
    const value = (v: number | null) => (v == null ? null : formatGoalValue(Number(v), goal.unit, units));
    return {
      id: goal.id,
      title: goal.title,
      type: goal.goal_type,
      movement: goal.movements?.name ?? null,
      status: goal.status,
      achieved_on: goal.achieved_at?.slice(0, 10) ?? null,
      tracked_from: TRACKING_LABELS[progress.tracking],
      start: value(goal.start_value),
      current: value(progress.current),
      target: value(goal.target_value),
      target_date: goal.target_date,
      percent_complete: progress.pct,
      target_met: progress.reached,
    };
  });
  const recentWeights = allMetrics
    .filter((row) => row.measured_on >= addDays(asOf, -55))
    .map((row) => ({ measured_on: row.measured_on, weight_kg: row.weight_kg == null ? null : Number(row.weight_kg) }));
  const trend = weightTrend(recentWeights);

  const promptData = {
    athlete: { first_name: athlete.first_name, experience_level: athlete.experience_level },
    as_of: asOf,
    units,
    goals: goalInputs,
    body_weight_last_8_weeks: trend && {
      first: `${formatGoalValue(trend.first.kg, "kg", units)} on ${trend.first.date}`,
      latest: `${formatGoalValue(trend.latest.kg, "kg", units)} on ${trend.latest.date}`,
      change_kg: trend.change_kg,
    },
    training_last_4_weeks: training,
    nutrition: { current_target: target, food_log_last_14_days: foodAverages(food ?? []) },
  } satisfies Json;

  return {
    input: { as_of: asOf, goals: goalInputs.map(({ id, title }) => ({ id, title })) } satisfies Json,
    system: SYSTEM,
    prompt: `Athlete data (JSON):\n${JSON.stringify(promptData, null, 2)}\n\nWrite the progress summary.`,
  };
}

function validate(proposal: unknown, input: Json) {
  const parsed = progressSummarySchema.parse(proposal);
  const { goals } = progressSummaryInputSchema.parse(input);
  const ids = new Set(goals.map(({ id }) => id));
  if (parsed.goals.some(({ goal_id }) => !ids.has(goal_id))) throw new Error("unknown goal id");
}

/** The text appended to the athlete's coach notes. */
export function progressNote(summary: ProgressSummary, input: Json) {
  const parsed = progressSummaryInputSchema.safeParse(input);
  const titles = new Map((parsed.success ? parsed.data.goals : []).map(({ id, title }) => [id, title]));
  const lines = [
    `Progress summary (${parsed.success ? formatDate(parsed.data.as_of) : "AI"}):`,
    summary.summary,
    ...summary.goals.map((goal) => `- ${titles.get(goal.goal_id) ?? "Goal"} — ${GOAL_STATUS_LABELS[goal.status]}: ${goal.note}`),
  ];
  return lines.join("\n");
}

async function apply(supabase: SupabaseClient<Database>, suggestion: Tables<"ai_suggestions">, final: unknown) {
  const summary = progressSummarySchema.parse(final);
  validate(summary, suggestion.input);
  if (!suggestion.athlete_id) throw new Error("This suggestion has no athlete.");
  const { data: athlete, error } = await supabase
    .from("athletes")
    .select("notes, updated_at")
    .eq("id", suggestion.athlete_id)
    .maybeSingle();
  if (error) throw error;
  if (!athlete) throw new ApprovalError("This athlete no longer exists.");

  const existing = athlete.notes?.trim() ?? "";
  const notes = existing ? `${existing}\n\n${progressNote(summary, suggestion.input)}` : progressNote(summary, suggestion.input);
  if (notes.length > NOTES_MAX)
    throw new ApprovalError(
      `The athlete's notes would be longer than ${NOTES_MAX} characters. Shorten the summary or trim the athlete's notes, then save again.`,
    );

  const { data: updated, error: updateError } = await supabase
    .from("athletes")
    .update({ notes })
    .eq("id", suggestion.athlete_id)
    .eq("updated_at", athlete.updated_at)
    .select("id")
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updated) throw new ApprovalError("The athlete's notes changed while saving. Please try again.");
  return { target_table: "athletes", target_id: updated.id };
}

export const progressSummaryEntry = {
  label: "Progress summary",
  proposalSchema: progressSummarySchema,
  buildRequest,
  validate,
  apply,
};
