import { loadRecentCheckIns } from "@/lib/check-in";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { addDays } from "@/lib/nutrition";
import { getToday } from "@/lib/time-zone";
import { formatGoalValue } from "@/lib/progress";
import type { Database, Json, Tables } from "@/lib/supabase/database.types";
import { formatDate } from "@/lib/units";

import { consistencyContext, foodAverages, trainingVolume, weightTrend } from "./athlete-context";
import { ApprovalError } from "./errors";
import { joinProgressNote } from "./progress-note";
import { averageCheckIns, loadProgressData } from "./progress-data";

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
- Use consistency to mention low completion or drifting and keep recommendations realistic; missing rates mean unknown, not zero.
- Mention recovery trends from recent_check_ins and check-in averages: readiness, sleep, soreness, stress, energy and mood. Cite only the available data.
- Use only the data provided. Do not invent numbers.
- Use measurement_trends when present to describe body measurement changes in the supplied units; do not infer appearance or health.
- Return one entry per goal in the goals list, using its id. Status: "reached" if achieved or the target is met; "on_track" if the current value and pace look likely to hit the target by its date; "behind" if not; "no_data" if there is no current value or start value to judge from.
- Each goal note is one plain-English sentence that cites the numbers (start, current, target, date) exactly as given. If a value is null, say "not logged"; never write "null".
- The summary is 2–4 short sentences for the coach about overall progress, including training consistency, body weight trend, and nutrition adherence when there is data. If there are no goals, say so and summarise the rest.
- Values are already formatted in the coach's units; repeat them as given.
- Keep the whole note (summary plus all goal notes) under 1,500 characters; with many goals, keep each goal note very short.
- This is general fitness coaching, not medical advice. Never diagnose.`;

async function buildRequest(supabase: SupabaseClient<Database>, { athleteId }: { athleteId: string | null }) {
  if (!athleteId) throw new Error("Athlete not found.");
  const asOf = await getToday();
  const [
    { athlete, units, goals: goalInputs, metrics, measurementTrends },
    { data: target, error: targetError },
    { data: food, error: foodError },
    training,
    consistency,
    recentCheckIns,
  ] = await Promise.all([
    loadProgressData(supabase, athleteId, asOf),
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
    consistencyContext(supabase, athleteId, asOf),
    loadRecentCheckIns(supabase, athleteId, asOf, 28),
  ]);
  for (const error of [targetError, foodError]) if (error) throw error;

  const recentWeights = [...metrics].reverse()
    .filter((row) => row.measured_on >= addDays(asOf, -55))
    .map((row) => ({ measured_on: row.measured_on, weight_kg: row.weight_kg == null ? null : Number(row.weight_kg) }));
  const trend = weightTrend(recentWeights);

  const promptData = {
    ...(measurementTrends.length ? { measurement_trends: measurementTrends } : {}),
    recent_check_ins: recentCheckIns.filter((entry) => entry.date >= addDays(asOf, -6)),
    check_in_averages_last_28_days: averageCheckIns(recentCheckIns),
    athlete: { first_name: athlete.first_name, experience_level: athlete.experience_level },
    as_of: asOf,
    units,
    goals: goalInputs,
    body_weight_trend: trend && {
      weeks_between_first_and_latest: trend.weeks_between,
      first: `${formatGoalValue(trend.first.kg, "kg", units)} on ${trend.first.date}`,
      latest: `${formatGoalValue(trend.latest.kg, "kg", units)} on ${trend.latest.date}`,
      change_kg: trend.change_kg,
    },
    training_last_4_weeks: training,
    consistency,
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
  if (new Set(parsed.goals.map(({ goal_id }) => goal_id)).size !== ids.size || parsed.goals.length !== ids.size)
    throw new Error("summary must cover each goal exactly once");
}

/** Rejects AI output that could never fit in the athlete's notes, so the coach is never left with an unsaveable draft. */
function validateGenerated(proposal: unknown, input: Json) {
  validate(proposal, input);
  if (progressNote(progressSummarySchema.parse(proposal), input).length > NOTES_MAX)
    throw new Error(`progress note is longer than ${NOTES_MAX} characters`);
}

/** Header and goal lines that wrap the summary in the athlete's coach notes. */
export function progressNoteParts(summary: ProgressSummary, input: Json) {
  const parsed = progressSummaryInputSchema.safeParse(input);
  const titles = new Map((parsed.success ? parsed.data.goals : []).map(({ id, title }) => [id, title]));
  return {
    header: `Progress summary (${parsed.success ? formatDate(parsed.data.as_of) : "AI"}):`,
    goalLines: summary.goals.map((goal) => `- ${titles.get(goal.goal_id) ?? "Goal"} — ${GOAL_STATUS_LABELS[goal.status]}: ${goal.note}`),
  };
}

/** The text appended to the athlete's coach notes. */
export function progressNote(summary: ProgressSummary, input: Json) {
  const { header, goalLines } = progressNoteParts(summary, input);
  return joinProgressNote(header, summary.summary, goalLines);
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
  validate: validateGenerated,
  apply,
};
