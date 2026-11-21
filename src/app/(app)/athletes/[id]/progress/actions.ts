"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { failure, type FormState } from "@/lib/auth/form-state";
import { getCoach } from "@/lib/coach";
import { GOAL_TYPES, TRACKING } from "@/lib/progress";
import { createClient } from "@/lib/supabase/server";
import { toKg } from "@/lib/units";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.");
const optionalDate = z.literal("").transform(() => null).or(date);
const optionalNumber = (message: string, ok: (n: number) => boolean) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v == null || (Number.isFinite(v) && ok(v)), message);

function revalidateAthlete(athleteId: string) {
  revalidatePath(`/athletes/${athleteId}`);
  revalidatePath(`/athletes/${athleteId}/progress`);
}

const metricSchema = z
  .object({
    athlete_id: z.string().uuid(),
    measured_on: date,
    weight: optionalNumber("Weight must be a positive number.", (n) => n > 0 && n < 1000),
    body_fat_pct: optionalNumber("Body fat must be between 1 and 75%.", (n) => n >= 1 && n <= 75),
    notes: z.string().trim().max(500).transform((v) => v || null),
  })
  .refine((m) => m.weight != null || m.body_fat_pct != null, "Enter a weight, a body fat %, or both.");

export async function logMetric(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = metricSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(formData, parsed.error.issues[0]?.message ?? "Please check the form.");
  const { weight, ...m } = parsed.data;
  const coach = await getCoach();
  const supabase = await createClient();

  const { error } = await supabase.from("body_metrics").insert({
    ...m,
    weight_kg: weight == null ? null : toKg(weight, coach?.units ?? "lb"),
  });
  if (error) return failure(formData, "Couldn't save the measurement. Please try again.");

  revalidateAthlete(m.athlete_id);
  return { message: "Measurement logged." };
}

export async function deleteMetric(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("body_metrics").delete().eq("id", id).select("athlete_id").maybeSingle();
  if (data) revalidateAthlete(data.athlete_id);
}

const goalSchema = z
  .object({
    id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
    athlete_id: z.string().uuid(),
    title: z.string().trim().min(1, "Give the goal a name.").max(120),
    goal_type: z.enum(GOAL_TYPES, { message: "Choose a goal type." }),
    tracking: z.enum(TRACKING, { message: "Choose how progress is measured." }),
    movement_id: z.string().optional().transform((v) => v || null),
    metric: z.string().trim().max(60).optional().transform((v) => v || null),
    unit: z.string().trim().max(20).optional().transform((v) => v || null),
    start_value: optionalNumber("Starting value must be a number of 0 or more.", (n) => n >= 0 && n < 100_000),
    target_value: optionalNumber("Target must be a number of 0 or more.", (n) => n >= 0 && n < 100_000),
    target_date: optionalDate,
  })
  .refine((g) => !["max_load", "max_reps"].includes(g.tracking) || g.movement_id, {
    message: "Choose the movement to track.",
  })
  .refine((g) => g.movement_id == null || z.string().uuid().safeParse(g.movement_id).success, { message: "Choose a movement." })
  .refine((g) => g.tracking === "manual" || g.target_value != null, { message: "Enter a target so progress can be measured." });

export async function saveGoal(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = goalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(formData, parsed.error.issues[0]?.message ?? "Please check the form.");
  const { id, tracking, ...g } = parsed.data;
  const coach = await getCoach();
  const units = coach?.units ?? "lb";
  const kg = (v: number | null) => (v == null ? null : toKg(v, units));

  type Fields = Partial<{ metric: string | null; unit: string | null; movement_id: string | null; start_value: number | null; target_value: number | null }>;
  const fields = (
    {
    body_weight: { metric: "body weight", unit: "kg", movement_id: null, start_value: kg(g.start_value), target_value: kg(g.target_value) },
    body_fat: { metric: "body fat", unit: "%", movement_id: null },
    max_load: { metric: g.metric ?? "best load", unit: "kg", start_value: kg(g.start_value), target_value: kg(g.target_value) },
    max_reps: { metric: g.metric ?? "max reps", unit: "reps" },
    // Avoid matching an automatic rule by accident.
    manual: { movement_id: null, unit: g.unit === "kg" || g.unit === "%" ? null : g.unit, metric: g.metric === "body weight" || g.metric === "body fat" ? null : g.metric },
    } satisfies Record<(typeof TRACKING)[number], Fields>
  )[tracking] as Fields;
  const goal = { ...g, ...fields };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("goals").update(goal).eq("id", id).select("id").single()
    : await supabase.from("goals").insert(goal);
  if (error) return failure(formData, "Couldn't save the goal. Please try again.");

  revalidateAthlete(g.athlete_id);
  return { message: id ? "Goal updated." : "Goal added." };
}

export async function setGoalStatus(id: string, status: "active" | "achieved" | "abandoned") {
  const supabase = await createClient();
  const { data } = await supabase
    .from("goals")
    .update({ status, achieved_at: status === "achieved" ? new Date().toISOString() : null })
    .eq("id", id)
    .select("athlete_id")
    .maybeSingle();
  if (data) revalidateAthlete(data.athlete_id);
}

export async function deleteGoal(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("goals").delete().eq("id", id).select("athlete_id").maybeSingle();
  if (data) revalidateAthlete(data.athlete_id);
}
