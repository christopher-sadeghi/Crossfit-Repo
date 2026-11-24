"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { failure, type FormState } from "@/lib/auth/form-state";
import { notifyScheduleChanged } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";
import { normalizeSections, workoutSectionsSchema, type WorkoutSection } from "@/lib/workout-sections";

import { WORKOUT_TYPES } from "../options";

const positiveInt = z.number().int().positive().nullable();

const movementSchema = z.object({
  movement_id: z.string().uuid("Choose a movement for every row."),
  sets: positiveInt,
  reps: positiveInt,
  load_kg: z.number().min(0).max(1000).nullable(),
  distance_m: z.number().positive().max(100000).nullable(),
  calories: positiveInt,
  duration_seconds: positiveInt,
  notes: z.string().trim().max(200).nullable(),
  section: z.number().int().min(0).max(9).nullable().optional(),
});

const optionalNumber = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().nullable());
const sectionsInputSchema = z.string().default("[]").transform((value, ctx) => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    ctx.addIssue({ code: "custom", message: "Invalid section list." });
    return z.NEVER;
  }
}).pipe(workoutSectionsSchema);

const workoutSchema = z.object({
  title: z.string().trim().min(1, "Give the WOD a name.").max(80),
  workout_type: z.enum(WORKOUT_TYPES, { message: "Choose a WOD type." }),
  time_cap_minutes: optionalNumber.refine((v) => v == null || (v >= 1 && v <= 180), "Time cap must be 1–180 minutes."),
  rounds: optionalNumber.refine((v) => v == null || (Number.isInteger(v) && v > 0 && v <= 100), "Rounds must be 1–100."),
  description: z.string().trim().max(1000).transform((v) => v || null),
  notes: z.string().trim().max(1000).transform((v) => v || null),
  movements: z
    .string()
    .transform((s, ctx) => {
      try {
        return JSON.parse(s) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid movement list." });
        return z.NEVER;
      }
    })
    .pipe(z.array(movementSchema).min(1, "Add at least one movement.").max(30)),
  sections: sectionsInputSchema,
});

const placementSchema = z.object({
  program_id: z.string().uuid(),
  week_number: z.coerce.number().int().min(1),
  day_number: z.coerce.number().int().min(1).max(7),
});

export async function saveWorkout(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = workoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const message =
      issue?.path[0] === "movements" && issue.path.length > 2
        ? `Movement ${Number(issue.path[1]) + 1}: ${issue.message.includes("movement") ? issue.message : "check the numbers."}`
        : issue?.message;
    return failure(formData, message ?? "Please check the form.");
  }

  const { movements: submittedMovements, sections: submittedSections, time_cap_minutes, ...fields } = parsed.data;
  let normalized: {
    sections: WorkoutSection[];
    movements: (typeof submittedMovements[number] & { section: number | null })[];
  };
  try {
    normalized = normalizeSections(submittedSections, submittedMovements);
  } catch (error) {
    return failure(formData, error instanceof Error ? error.message : "Check the workout sections.");
  }
  const movements = normalized.movements;
  const workout = {
    ...fields,
    sections: normalized.sections,
    time_cap_seconds: time_cap_minutes == null ? null : Math.round(time_cap_minutes * 60),
  };
  const id = formData.get("id");
  const supabase = await createClient();

  let workoutId: string;
  let oneOffAthleteId: string | null = null;
  if (typeof id === "string" && id) {
    const { data: existingWorkout, error: existingError } = await supabase
      .from("workouts")
      .select("athlete_id")
      .eq("id", id)
      .maybeSingle();
    if (existingError || !existingWorkout) return failure(formData, "Couldn't find this WOD. Please refresh and try again.");

    let scheduledOn: string | undefined;
    if (existingWorkout.athlete_id) {
      const date = z.string().date("Choose a date for this one-off WOD.").safeParse(formData.get("scheduled_on"));
      if (!date.success) return failure(formData, "Choose a valid date for this one-off WOD.");
      oneOffAthleteId = existingWorkout.athlete_id;
      scheduledOn = date.data;
    }

    const { data: old } = await supabase.from("workout_movements").select("*").eq("workout_id", id);
    const { error } = await supabase
      .from("workouts")
      .update({ ...workout, ...(scheduledOn ? { scheduled_on: scheduledOn } : {}), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .single();
    if (error) return failure(formData, "Couldn't save the WOD. Please try again.");

    await supabase.from("workout_movements").delete().eq("workout_id", id);
    const { error: insertError } = await supabase
      .from("workout_movements")
      .insert(movements.map((m, i) => ({ ...m, workout_id: id, position: i + 1 })));
    if (insertError) {
      if (old?.length) await supabase.from("workout_movements").insert(old);
      return failure(formData, "Couldn't save the movements. Please try again.");
    }
    workoutId = id;
  } else {
    const requestedAthleteId = formData.get("athlete_id");
    if (typeof requestedAthleteId !== "string" && requestedAthleteId !== null) {
      return failure(formData, "Couldn't find this athlete. Please refresh and try again.");
    }
    if (requestedAthleteId && formData.get("program_id")) {
      return failure(formData, "A one-off WOD can't be part of a group program.");
    }

    let scheduledOn: string | undefined;
    if (requestedAthleteId) {
      const date = z.string().date("Choose a date for this one-off WOD.").safeParse(formData.get("scheduled_on"));
      if (!date.success) return failure(formData, "Choose a valid date for this one-off WOD.");
      const { data: athlete } = await supabase.from("athletes").select("id").eq("id", requestedAthleteId).maybeSingle();
      if (!athlete) return failure(formData, "Couldn't find this athlete on your roster.");
      oneOffAthleteId = athlete.id;
      scheduledOn = date.data;
    }

    const placement = formData.get("program_id") ? placementSchema.safeParse(Object.fromEntries(formData)) : null;
    if (placement && !placement.success) return failure(formData, "Invalid program day.");
    if (placement) {
      const { data: program } = await supabase.from("programs").select("weeks").eq("id", placement.data.program_id).maybeSingle();
      if (!program || placement.data.week_number > program.weeks) return failure(formData, "That program day no longer exists.");
    }
    const { data, error } = await supabase
      .from("workouts")
      .insert({
        ...workout,
        ...placement?.data,
        ...(oneOffAthleteId ? { athlete_id: oneOffAthleteId, scheduled_on: scheduledOn } : {}),
      })
      .select("id")
      .single();
    if (error) return failure(formData, "Couldn't save the WOD. Please try again.");
    const { error: insertError } = await supabase
      .from("workout_movements")
      .insert(movements.map((m, i) => ({ ...m, workout_id: data.id, position: i + 1 })));
    if (insertError) {
      await supabase.from("workouts").delete().eq("id", data.id);
      return failure(formData, "Couldn't save the movements. Please try again.");
    }
    workoutId = data.id;
  }

  revalidatePath("/programs/workouts");
  if (oneOffAthleteId) {
    await notifyScheduleChanged(supabase, oneOffAthleteId, { action: id ? "updated" : "added", date: String(formData.get("scheduled_on")) });
    revalidatePath(`/athletes/${oneOffAthleteId}`);
    redirect(`/athletes/${oneOffAthleteId}?tab=workouts`);
  }
  const programId = formData.get("program_id");
  if (!id && typeof programId === "string" && programId) {
    revalidatePath(`/programs/${programId}`);
    redirect(`/programs/${programId}`);
  }
  redirect(`/programs/workouts/${workoutId}`);
}

export async function duplicateWorkout(id: string) {
  const supabase = await createClient();
  const { data: original } = await supabase
    .from("workouts")
    .select("title, workout_type, time_cap_seconds, rounds, description, notes, sections, workout_movements(movement_id, position, sets, reps, load_kg, distance_m, calories, duration_seconds, notes, section)")
    .eq("id", id)
    .single();
  if (!original) throw new Error("WOD not found.");

  const { workout_movements, ...fields } = original;
  const { data: copy, error } = await supabase
    .from("workouts")
    .insert({ ...fields, title: `${fields.title} (copy)`.slice(0, 80), program_id: null, athlete_id: null, scheduled_on: null })
    .select("id")
    .single();
  if (error) throw new Error("Couldn't duplicate the WOD.");
  if (workout_movements.length) {
    const { error: mError } = await supabase
      .from("workout_movements")
      .insert(workout_movements.map((m) => ({ ...m, workout_id: copy.id })));
    if (mError) {
      await supabase.from("workouts").delete().eq("id", copy.id);
      throw new Error("Couldn't duplicate the WOD.");
    }
  }

  revalidatePath("/programs/workouts");
  redirect(`/programs/workouts/${copy.id}/edit`);
}

export async function deleteWorkout(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("workouts").delete().eq("id", id);
  if (error) throw new Error("Couldn't delete the WOD.");

  revalidatePath("/programs/workouts");
  redirect("/programs/workouts");
}
