"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { checkTrainingLoad } from "@/lib/activity-training-warning";
import { failure, type FormState } from "@/lib/auth/form-state";
import { notifyResultLogged } from "@/lib/notifications";
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
import {
  buildResultScore,
  feedbackFields,
  scoreFields,
} from "@/lib/result-score";
import { createClient } from "@/lib/supabase/server";
import { fromKgPrecise } from "@/lib/units";
import { getViewer } from "@/lib/viewer";
import { workoutVersion } from "@/lib/workout-version";
import { workoutSectionsSchema } from "@/lib/workout-sections";

const resultSchema = z.object({
  result_id: z.preprocess((v) => (v == null || v === "" ? null : v), z.string().uuid().nullable()),
  workout_id: z.string().uuid(),
  performed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
  ...scoreFields,
  is_rx: z.enum(["rx", "scaled"], { message: "Choose Rx or Scaled." }),
  notes: z.string().trim().max(500).transform((v) => v || null),
  parts: z.string().default("[]"),
  section_scores: z.string().default("[]"),
  ...feedbackFields,
  return_to: z.enum(["/athlete", "/athlete/history"]).catch("/athlete/history"),
});

const uuidSchema = z.string().uuid();

export type AthleteResultState = FormState & {
  newPrSets?: LiftPrSetLocation[];
  savedParts?: ResultPart[];
  savedSectionScores?: SectionScore[];
  prError?: boolean;
  savedResultId?: string;
};

function revalidateResultPaths(workoutId: string, athleteId: string) {
  revalidatePath("/athlete");
  revalidatePath("/athlete/history");
  revalidatePath("/athlete/prs");
  revalidatePath(`/programs/workouts/${workoutId}`);
  revalidatePath(`/athletes/${athleteId}`);
  revalidatePath(`/athletes/${athleteId}/progress`);
  revalidatePath("/athletes");
}

async function getAthleteUserId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  return typeof userId === "string" ? userId : null;
}

export async function saveAthleteResult(_: FormState, formData: FormData): Promise<AthleteResultState> {
  const parsed = resultSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(formData, parsed.error.issues[0]?.message ?? "Please check the form.");

  const viewer = await getViewer();
  if (viewer?.kind !== "athlete") return failure(formData, "Only athletes can save results here.");

  const supabase = await createClient();
  const loggedBy = await getAthleteUserId();
  if (!loggedBy) return failure(formData, "Please log in again to save your result.");

  const r = parsed.data;
  const { data: canView } = await supabase.rpc("athlete_can_view_workout", { p_workout_id: r.workout_id });
  if (!canView) return failure(formData, "That WOD is no longer available.");
  const [{ data: workout }, { data: scaling }] = await Promise.all([
    supabase
    .from("workouts")
    .select("id, title, workout_type, rounds, time_cap_seconds, sections, workout_movements(position, sets, reps, load_kg, distance_m, calories, duration_seconds, notes, section, movements(id, name))")
    .eq("id", r.workout_id)
    .order("position", { referencedTable: "workout_movements" })
    .maybeSingle(),
    supabase
      .from("athlete_workout_scalings")
      .select("id, athlete_id, modifications, details, coach_modifications, coach_details, athlete_adjusted_at, athlete_suggestion_id")
      .eq("workout_id", r.workout_id)
      .eq("athlete_id", viewer.athleteId)
      .maybeSingle(),
  ]);
  if (!workout) return failure(formData, "That WOD is no longer available.");
  const parsedSections = workoutSectionsSchema.safeParse(workout.sections);
  const sections = parsedSections.success ? parsedSections.data : [];

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
  const submitted = submittedParts(r.parts, viewer.units);
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
          : fromKgPrecise(fallbackLoadKg, viewer.units)),
    },
    workout.workout_type,
    viewer.units,
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
  if (r.result_id && r.load != null && score.load_kg != null) {
    // Keep the stored load when the athlete didn't change the value the edit form showed.
    const { data: existing } = await supabase.from("workout_results").select("load_kg").eq("id", r.result_id).maybeSingle();
    const existingKg = existing?.load_kg == null ? null : Number(existing.load_kg);
    if (existingKg != null && Number(formData.get("load")) === fromKgPrecise(existingKg, viewer.units))
      score.load_kg = existingKg;
  }

  const values = {
    workout_id: r.workout_id,
    athlete_id: viewer.athleteId,
    coach_id: viewer.coachId,
    logged_by: loggedBy,
    performed_on: r.performed_on,
    parts,
    section_scores: sectionScores,
    ...score,
    is_rx: r.is_rx === "rx",
    notes: r.notes,
    rpe: r.rpe,
    energy: r.energy,
    soreness: r.soreness,
  };

  let savedResult: {
    id: string;
    workout_id: string;
    athlete_id: string;
    coach_id: string | null;
    performed_on: string;
    created_at: string;
    is_rx: boolean;
    logged_by: string | null;
  };
  if (r.result_id) {
    const { data, error } = await supabase
      .from("workout_results")
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq("id", r.result_id)
      .eq("logged_by", loggedBy)
      .select("id, workout_id, athlete_id, coach_id, performed_on, created_at, is_rx, logged_by")
      .maybeSingle();
    if (error || !data) return failure(formData, "Couldn't update the result. Please try again.");
    savedResult = data;
    await checkTrainingLoad(supabase, data.athlete_id);
    revalidateResultPaths(data.workout_id, data.athlete_id);
  } else {
    const { data, error } = await supabase
      .from("workout_results")
      .insert(values)
      .select("id, workout_id, athlete_id, coach_id, performed_on, created_at, is_rx, logged_by")
      .maybeSingle();
    if (error || !data) return failure(formData, "Couldn't save the result. Please try again.");
    savedResult = data;
    await Promise.all([notifyResultLogged(supabase, data.athlete_id, data.id), checkTrainingLoad(supabase, data.athlete_id)]);
    revalidateResultPaths(data.workout_id, data.athlete_id);
  }

  const prSync = await syncResultLiftPrs(
    supabase,
    {
      ...savedResult,
      coach_id: savedResult.coach_id ?? viewer.coachId,
    },
    parts,
    workout.title,
  );
  revalidateResultPaths(savedResult.workout_id, savedResult.athlete_id);
  const successState: AthleteResultState = {
    message: "Result saved.",
    savedParts: parts,
    savedResultId: savedResult.id,
    newPrSets: prSync.candidates.map(({ position, set_index }) => ({
      position,
      set_index,
    })),
    savedSectionScores: sectionScores,
    prError: Boolean(prSync.error),
  };
  if (r.return_to === "/athlete") return successState;

  const query = new URLSearchParams({ result: savedResult.id });
  if (prSync.error) query.set("pr_error", "1");
  redirect(`/athlete/history?${query.toString()}`);
}

export async function deleteAthleteResult(id: string): Promise<FormState> {
  const viewer = await getViewer();
  if (viewer?.kind !== "athlete") return { error: "Only athletes can delete results here." };

  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) return { error: "That result could not be found." };

  const supabase = await createClient();
  const loggedBy = await getAthleteUserId();
  if (!loggedBy) return { error: "Please log in again to delete your result." };

  const { data, error } = await supabase
    .from("workout_results")
    .delete()
    .eq("id", parsedId.data)
    .eq("logged_by", loggedBy)
    .select("workout_id, athlete_id")
    .maybeSingle();
  if (error || !data) return { error: "Couldn't delete the result. Please try again." };

  await checkTrainingLoad(supabase, data.athlete_id);
  revalidateResultPaths(data.workout_id, data.athlete_id);
  return { message: "Result deleted." };
}
