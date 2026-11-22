"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { intakeSchemas } from "@/lib/athlete-intake";
import { ftInToCm } from "@/lib/height";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { getToday } from "@/lib/time-zone";
import { toKg } from "@/lib/units";
import { getViewer } from "@/lib/viewer";

export async function saveIntakeStep(step: number, input: unknown): Promise<{ error: string } | undefined> {
  const viewer = await getViewer();
  if (viewer?.kind !== "athlete") return { error: "Please sign in as an athlete." };
  if (!Number.isInteger(step) || step < 1 || step > 7) return { error: "Invalid step." };
  const parsed = intakeSchemas[step - 1].safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your answers." };
  const today = await getToday();
  let payload: Record<string, unknown> = { ...parsed.data };
  const supabase = await createClient();
  if (step === 1) {
    const v = intakeSchemas[0].parse(input);
    if (v.birth_date >= today) return { error: "Birth date must be in the past." };
    payload = { birth_date: v.birth_date, sex: v.sex, height_cm: Math.max(100, Math.min(250, ftInToCm(v.height_ft, v.height_in))), weight_kg: toKg(v.weight, viewer.units) };
  }
  if (step === 2) {
    const v = intakeSchemas[1].parse(input);
    const library = await supabase.from("benchmarks").select("id, kind, workout_type");
    if (library.error) return { error: "Couldn't load benchmarks. Please try again." };
    const benchmarks = [];
    for (const b of v.benchmarks) {
      const definition = library.data.find((item) => item.id === b.benchmark_id);
      if (!definition) return { error: "Choose a benchmark from the library." };
      const lift = definition.kind === "lift";
      if (lift ? b.load == null || b.load <= 0 : definition.workout_type === "for_time" ? b.time_seconds == null : b.rounds == null && b.reps == null) return { error: "Enter a score for each selected benchmark." };
      benchmarks.push({ benchmark_id: b.benchmark_id, load_kg: lift ? toKg(b.load!, viewer.units) : null, rep_max: lift ? 1 : null, time_seconds: !lift && definition.workout_type === "for_time" ? b.time_seconds : null, rounds: !lift && definition.workout_type !== "for_time" ? b.rounds : null, reps: !lift && definition.workout_type !== "for_time" ? b.reps : null });
    }
    if (new Set(v.benchmarks.map((b) => b.benchmark_id)).size !== benchmarks.length) return { error: "Choose each benchmark once." };
    payload = { ...v, benchmarks };
  }
  if (step === 3) {
    const v = intakeSchemas[2].parse(input);
    payload = { goals: v.goals.map((g) => ({ title: `${g.category}${g.target ? `: ${g.target}` : ""}`, goal_type: g.category === "Body composition" ? "body_composition" : g.category === "Specific skill" ? "skill" : "performance", target_value: g.target_value, target_date: g.target_date || null })) };
  }
  const { error } = await supabase.rpc("save_athlete_intake_step", { p_athlete_id: viewer.athleteId, p_step: step, p_data: payload as Json, p_today: today });
  if (error) return { error: "Couldn't save your answers. Please try again." };
  revalidatePath("/athlete", "layout");
  revalidatePath(`/athletes/${viewer.athleteId}`);
  redirect(step === 7 ? "/athlete" : `/athlete/onboarding?step=${step + 1}`);
}
