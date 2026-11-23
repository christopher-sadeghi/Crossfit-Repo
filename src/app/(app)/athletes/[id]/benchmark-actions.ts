"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { failure, type FormState } from "@/lib/auth/form-state";
import { loadAthleteBenchmarks } from "@/lib/benchmarks";
import { buildScore, scoreFields } from "@/lib/result-score";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/time-zone";
import { getViewer } from "@/lib/viewer";

const resultSchema = z.object({
  ...scoreFields,
  athlete_id: z.uuid(),
  benchmark_id: z.uuid(),
  performed_on: z.iso.date(),
  rep_max: z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number().int().min(1).max(20).nullable(),
  ),
  notes: z.string().trim().max(2000),
});
function refresh(athleteId?: string) {
  revalidatePath("/benchmarks");
  revalidatePath("/athlete/prs");
  revalidatePath("/athletes", "layout");
  if (athleteId) {
    revalidatePath(`/athletes/${athleteId}`);
    revalidatePath(`/athletes/${athleteId}/progress`);
  }
}

export async function saveBenchmarkResult(
  _: FormState,
  data: FormData,
): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer || viewer.kind === "none")
    return failure(data, "Sign in to log a benchmark.");
  const parsed = resultSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return failure(data, parsed.error.issues[0].message);
  const input = parsed.data;
  if (viewer.kind === "athlete" && input.athlete_id !== viewer.athleteId)
    return failure(data, "You can only log your own results.");
  const today = await getToday();
  if (input.performed_on > today)
    return failure(data, "The attempt date cannot be in the future.");
  const supabase = await createClient();
  const [{ data: athlete }, { data: benchmark }] = await Promise.all([
    supabase
      .from("athletes")
      .select("coach_id")
      .eq("id", input.athlete_id)
      .single(),
    supabase
      .from("benchmarks")
      .select("kind, workout_type, coach_id")
      .eq("id", input.benchmark_id)
      .single(),
  ]);
  if (
    !athlete ||
    !benchmark ||
    (viewer.kind === "coach" && athlete.coach_id !== viewer.gymId) ||
    (benchmark.coach_id != null && benchmark.coach_id !== athlete.coach_id)
  )
    return failure(data, "Athlete or benchmark not available.");
  if (benchmark.kind === "lift" && input.rep_max == null)
    return failure(data, "Enter reps in the set (1–20).");
  const built = buildScore(input, benchmark.workout_type, viewer.units);
  if ("error" in built) return failure(data, built.error);
  const { data: saved, error } = await supabase
    .from("benchmark_results")
    .insert({
      ...built.score,
      athlete_id: input.athlete_id,
      coach_id: athlete.coach_id,
      benchmark_id: input.benchmark_id,
      performed_on: input.performed_on,
      rep_max: benchmark.kind === "lift" ? input.rep_max : null,
      is_rx: data.get("is_rx") === "on",
      notes: input.notes || null,
    })
    .select("id")
    .single();
  if (error)
    return failure(data, "Could not save the result. Please try again.");
  refresh(input.athlete_id);
  try {
    const history = await loadAthleteBenchmarks(
      supabase,
      input.athlete_id,
      today,
    );
    const isPr = history
      .find((b) => b.id === input.benchmark_id)
      ?.attempts.find((a) => a.source === "direct" && a.id === saved.id)?.isPr;
    return { message: isPr ? "Result saved. New PR!" : "Result saved." };
  } catch {
    return { message: "Result saved. Refresh to see your updated history." };
  }
}

export async function deleteBenchmarkResult(
  _: FormState,
  data: FormData,
): Promise<FormState> {
  const id = z.uuid().safeParse(data.get("id"));
  if (!id.success) return failure(data, "Invalid result.");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return failure(data, "Sign in to delete a result.");
  const { data: deleted, error } = await supabase
    .from("benchmark_results")
    .delete()
    .eq("id", id.data)
    .eq("logged_by", auth.user.id)
    .select("athlete_id")
    .maybeSingle();
  if (error || !deleted)
    return failure(data, "You can only delete entries you logged.");
  refresh(deleted.athlete_id);
  return { message: "Result deleted." };
}

const customSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(4000),
  workout_type: z.enum(["for_time", "amrap", "emom", "strength", "other"]),
  movement_id: z.preprocess((v) => (v === "" ? null : v), z.uuid().nullable()),
  id: z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.uuid().nullable(),
  ),
});
export async function saveCustomBenchmark(
  _: FormState,
  data: FormData,
): Promise<FormState> {
  const viewer = await getViewer();
  if (viewer?.kind !== "coach" || viewer.role !== "owner")
    return failure(data, "Only the gym owner can manage benchmarks.");
  const parsed = customSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return failure(data, parsed.error.issues[0].message);
  const { id, ...input } = parsed.data;
  if (input.movement_id && input.workout_type !== "strength")
    return failure(data, "Lift benchmarks must use Strength.");
  const supabase = await createClient();
  if (input.movement_id) {
    const { data: movement } = await supabase
      .from("movements")
      .select("id")
      .eq("id", input.movement_id)
      .maybeSingle();
    if (!movement) return failure(data, "Movement not available.");
  }
  const row = {
    ...input,
    description: input.description || null,
    kind: input.movement_id ? ("lift" as const) : ("custom" as const),
  };
  const result = id
    ? await supabase
        .from("benchmarks")
        .update(row)
        .eq("id", id)
        .eq("coach_id", viewer.gymId)
        .select("id")
        .maybeSingle()
    : await supabase.from("benchmarks").insert({ ...row, coach_id: viewer.gymId }).select("id").single();
  if (result.error || !result.data)
    return failure(data, "Could not save benchmark. Check the name is unique.");
  refresh();
  return { message: "Benchmark saved." };
}
export async function deleteCustomBenchmark(
  _: FormState,
  data: FormData,
): Promise<FormState> {
  const viewer = await getViewer();
  const id = z.uuid().safeParse(data.get("id"));
  if (viewer?.kind !== "coach" || viewer.role !== "owner" || !id.success)
    return failure(data, "Invalid benchmark.");
  const supabase = await createClient();
  const { data: deleted, error } = await supabase
    .from("benchmarks")
    .delete()
    .eq("id", id.data)
    .eq("coach_id", viewer.gymId)
    .select("id")
    .maybeSingle();
  if (error || !deleted)
    return failure(data, "Could not delete your benchmark.");
  refresh();
  return { message: "Benchmark and its direct results deleted." };
}
export async function saveRetestInterval(
  _: FormState,
  data: FormData,
): Promise<FormState> {
  const viewer = await getViewer();
  if (viewer?.kind !== "coach" || viewer.role !== "owner")
    return failure(data, "Only the gym owner can manage retest intervals.");
  const parsed = z
    .object({
      benchmark_id: z.uuid(),
      retest_weeks: z.preprocess(
        (v) => (v === "" ? null : Number(v)),
        z.number().int().min(1).max(104).nullable(),
      ),
    })
    .safeParse(Object.fromEntries(data));
  if (!parsed.success)
    return failure(data, "Choose an interval from 1–104 weeks, or clear it.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("benchmark_settings")
    .upsert({ ...parsed.data, coach_id: viewer.gymId });
  if (error) return failure(data, "Could not save retest interval.");
  refresh();
  return { message: "Retest interval saved." };
}
