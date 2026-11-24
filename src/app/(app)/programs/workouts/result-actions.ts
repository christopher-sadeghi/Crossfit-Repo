"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { checkTrainingLoad } from "@/lib/activity-training-warning";
import { failure, type FormState } from "@/lib/auth/form-state";
import { getCoach } from "@/lib/coach";
import {
  maxDoneSetLoad,
  submittedParts,
  syncResultLiftPrs,
} from "@/lib/result-part-prs";
import {
  partsForVersion,
  resultPartsSchema,
  hasSectionScoreEntry,
  sectionScoresSchema,
  type LiftPrSetLocation,
  type ResultPart,
  type SectionScore,
} from "@/lib/result-parts";
import { buildResultScore, scoreFields } from "@/lib/result-score";
import { createClient } from "@/lib/supabase/server";
import { fromKgPrecise } from "@/lib/units";
import { workoutVersion } from "@/lib/workout-version";
import { workoutSectionsSchema } from "@/lib/workout-sections";

const resultSchema = z.object({
  workout_id: z.string().uuid(),
  athlete_id: z.string().uuid("Choose an athlete."),
  performed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
  ...scoreFields,
  is_rx: z.enum(["rx", "scaled"], { message: "Choose Rx or Scaled." }),
  notes: z.string().trim().max(500).transform((v) => v || null),
  parts: z.string().default("[]"),
  section_scores: z.string().default("[]"),
});

export type CoachResultState = FormState & {
  savedParts?: ResultPart[];
  savedSectionScores?: SectionScore[];
  newPrSets?: LiftPrSetLocation[];
  prError?: boolean;
};

export async function logResult(_: FormState, formData: FormData): Promise<CoachResultState> {
  const parsed = resultSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(formData, parsed.error.issues[0]?.message ?? "Please check the form.");
  const r = parsed.data;

  const supabase = await createClient();
  const [{ data: workout }, coach, { data: athlete }] = await Promise.all([
    supabase
      .from("workouts")
      .select("id, title, workout_type, rounds, time_cap_seconds, sections, workout_movements(position, sets, reps, load_kg, distance_m, calories, duration_seconds, notes, section, movements(id, name))")
      .eq("id", r.workout_id)
      .order("position", { referencedTable: "workout_movements" })
      .maybeSingle(),
    getCoach(),
    supabase.from("athletes").select("id, coach_id").eq("id", r.athlete_id).maybeSingle(),
  ]);
  if (!workout) return failure(formData, "That WOD no longer exists.");
  if (!coach || !athlete || athlete.coach_id !== coach.gymId)
    return failure(formData, "Choose an athlete in your coaching scope.");
  const parsedSections = workoutSectionsSchema.safeParse(workout.sections);
  const sections = parsedSections.success ? parsedSections.data : [];

  const { data: scaling } = await supabase
    .from("athlete_workout_scalings")
    .select("id, athlete_id, modifications, details, coach_modifications, coach_details, athlete_adjusted_at, athlete_suggestion_id")
    .eq("workout_id", r.workout_id)
    .eq("athlete_id", r.athlete_id)
    .maybeSingle();
  const version = workoutVersion(
    {
      movements: workout.workout_movements.map(({ movements: movement, ...row }) => ({
        ...row,
        movement_id: movement?.id ?? "",
        name: movement?.name ?? "",
      })),
      rounds: workout.rounds,
      time_cap_seconds: workout.time_cap_seconds,
      sections,
    },
    scaling,
    r.performed_on,
  );
  const submitted = submittedParts(r.parts, coach.units);
  if ("error" in submitted && submitted.error)
    return failure(formData, submitted.error);
  const parsedParts = resultPartsSchema.safeParse(submitted.value);
  if (!parsedParts.success)
    return failure(formData, parsedParts.error.issues[0]?.message ?? "Check the part results.");
  const parts = partsForVersion(parsedParts.data, version);
  if (!parts) return failure(formData, "The workout parts changed. Refresh and try again.");
  let rawSectionScores: unknown;
  try {
    rawSectionScores = JSON.parse(r.section_scores);
  } catch {
    return failure(formData, "Check the section scores.");
  }
  const parsedSectionScores = sectionScoresSchema.safeParse(rawSectionScores);
  if (!parsedSectionScores.success)
    return failure(formData, parsedSectionScores.error.issues[0]?.message ?? "Check the section scores.");
  const sectionScores = parsedSectionScores.data.filter(
    (score) =>
      score.section < (version.sections?.length ?? 0) &&
      hasSectionScoreEntry(score),
  );

  const fallbackLoadKg = maxDoneSetLoad(parts);
  const scoreResult = buildResultScore(
    {
      ...r,
      load:
        r.load ??
        (fallbackLoadKg == null
          ? null
          : fromKgPrecise(fallbackLoadKg, coach.units)),
    },
    workout.workout_type,
    coach.units,
    Boolean(version.sections?.length),
    parts,
    sectionScores,
    fallbackLoadKg,
  );
  if ("error" in scoreResult) {
    return failure(formData, scoreResult.error);
  }
  const score = { ...scoreResult.score };
  if (r.load == null && fallbackLoadKg != null) score.load_kg = fallbackLoadKg;

  const { data: savedResult, error } = await supabase.from("workout_results").insert({
    workout_id: r.workout_id,
    athlete_id: r.athlete_id,
    performed_on: r.performed_on,
    parts,
    section_scores: sectionScores,
    ...score,
    is_rx: r.is_rx === "rx",
    notes: r.notes,
  }).select("id, athlete_id, coach_id, performed_on, created_at, is_rx, logged_by").maybeSingle();
  if (error || !savedResult) return failure(formData, "Couldn't save the result. Please try again.");

  const prSync = await syncResultLiftPrs(
    supabase,
    {
      ...savedResult,
      coach_id: savedResult.coach_id ?? coach.gymId,
    },
    parts,
    workout.title,
  );
  await checkTrainingLoad(supabase, r.athlete_id);
  revalidatePath(`/programs/workouts/${r.workout_id}`);
  revalidatePath(`/athletes/${r.athlete_id}`);
  revalidatePath(`/athletes/${r.athlete_id}/progress`);
  return {
    message: "Result logged.",
    savedParts: parts,
    newPrSets: prSync.candidates.map(({ position, set_index }) => ({
      position,
      set_index,
    })),
    savedSectionScores: sectionScores,
    prError: Boolean(prSync.error),
  };
}

export async function deleteResult(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("workout_results").delete().eq("id", id).select("workout_id, athlete_id").maybeSingle();
  if (data) {
    await checkTrainingLoad(supabase, data.athlete_id);
    revalidatePath(`/programs/workouts/${data.workout_id}`);
    revalidatePath(`/athletes/${data.athlete_id}`);
  }
}
