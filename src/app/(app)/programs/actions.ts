"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { failure, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/supabase/server";

const programSchema = z.object({
  name: z.string().trim().min(1, "Give the program a name.").max(80),
  description: z.string().trim().max(1000).transform((v) => v || null),
  weeks: z.coerce.number().int("Weeks must be a whole number.").min(1, "Weeks must be 1–52.").max(52, "Weeks must be 1–52."),
});

export async function saveProgram(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = programSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(formData, parsed.error.issues[0]?.message ?? "Please check the form.");

  const id = formData.get("id");
  const supabase = await createClient();
  let programId: string;

  if (typeof id === "string" && id) {
    const { data: last } = await supabase
      .from("workouts")
      .select("week_number")
      .eq("program_id", id)
      .order("week_number", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (last?.week_number && last.week_number > parsed.data.weeks) {
      return failure(formData, `Week ${last.week_number} has WODs. Remove them before shortening the program.`);
    }
    const { error } = await supabase
      .from("programs")
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .single();
    if (error) return failure(formData, "Couldn't save the program. Please try again.");
    programId = id;
  } else {
    const { data, error } = await supabase.from("programs").insert(parsed.data).select("id").single();
    if (error) return failure(formData, "Couldn't save the program. Please try again.");
    programId = data.id;
  }

  revalidatePath("/programs");
  redirect(`/programs/${programId}`);
}

export async function deleteProgram(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("programs").delete().eq("id", id);
  if (error) throw new Error("Couldn't delete the program.");

  revalidatePath("/programs");
  revalidatePath("/programs/workouts");
  redirect("/programs");
}

const placeSchema = z.object({
  program_id: z.string().uuid(),
  workout_id: z.string().uuid("Choose a WOD."),
  week_number: z.coerce.number().int().min(1),
  day_number: z.coerce.number().int().min(1).max(7),
});

export async function placeWorkout(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = placeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(formData, parsed.error.issues[0]?.message ?? "Choose a WOD, week and day.");
  const { workout_id, ...placement } = parsed.data;

  const supabase = await createClient();
  const { data: program } = await supabase.from("programs").select("weeks").eq("id", placement.program_id).maybeSingle();
  if (!program) return failure(formData, "Program not found.");
  if (placement.week_number > program.weeks) return failure(formData, `This program only has ${program.weeks} weeks.`);
  const { data: workout } = await supabase
    .from("workouts")
    .select("athlete_id, program_id, title, workout_type, time_cap_seconds, rounds, description, notes, workout_movements(movement_id, position, sets, reps, load_kg, distance_m, calories, duration_seconds, notes)")
    .eq("id", workout_id)
    .maybeSingle();
  if (!workout || workout.athlete_id) return failure(formData, "One-off WODs can't be added to a program.");

  if (workout.program_id) {
    const { data: copy, error: copyError } = await supabase
      .from("workouts")
      .insert({
        title: workout.title,
        workout_type: workout.workout_type,
        time_cap_seconds: workout.time_cap_seconds,
        rounds: workout.rounds,
        description: workout.description,
        notes: workout.notes,
        program_id: placement.program_id,
        week_number: placement.week_number,
        day_number: placement.day_number,
        athlete_id: null,
        scheduled_on: null,
        source_workout_id: null,
      })
      .select("id")
      .single();
    if (copyError || !copy) return failure(formData, "Couldn't add that WOD. Please try again.");

    const movements = workout.workout_movements ?? [];
    if (movements.length) {
      const { error: movementError } = await supabase
        .from("workout_movements")
        .insert(movements.map((movement) => ({ ...movement, workout_id: copy.id })));
      if (movementError) {
        await supabase.from("workouts").delete().eq("id", copy.id);
        return failure(formData, "Couldn't copy that WOD's movements. Please try again.");
      }
    }

    revalidatePath(`/programs/${placement.program_id}`);
    revalidatePath("/programs/workouts");
    return { message: "WOD copied to the calendar." };
  }

  const { count, error } = await supabase
    .from("workouts")
    .update({ ...placement, scheduled_on: null, updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", workout_id)
    .is("athlete_id", null)
    .is("program_id", null);
  if (error || !count) return failure(formData, "Couldn't add that WOD. It may already be in a program.");

  revalidatePath(`/programs/${placement.program_id}`);
  revalidatePath("/programs/workouts");
  return { message: "WOD added to the calendar." };
}

export async function unplaceWorkout(programId: string, workoutId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("workouts")
    .update({ program_id: null, week_number: null, day_number: null, scheduled_on: null, updated_at: new Date().toISOString() })
    .eq("id", workoutId)
    .eq("program_id", programId);
  if (error) throw new Error("Couldn't remove the WOD from the program.");

  revalidatePath(`/programs/${programId}`);
  revalidatePath("/programs/workouts");
}

const assignSchema = z.object({
  program_id: z.string().uuid(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a start date."),
  athlete_ids: z.array(z.string().uuid()).min(1, "Choose at least one athlete."),
});

export async function assignProgram(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = assignSchema.safeParse({
    program_id: formData.get("program_id"),
    start_date: formData.get("start_date"),
    athlete_ids: formData.getAll("athlete_ids"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const { program_id, start_date, athlete_ids } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("program_assignments")
    .upsert(athlete_ids.map((athlete_id) => ({ program_id, athlete_id, start_date })), { onConflict: "program_id,athlete_id" });
  if (error) return { error: "Couldn't assign the program. Please try again." };

  revalidatePath(`/programs/${program_id}`);
  revalidatePath("/programs");
  const n = athlete_ids.length;
  return { message: `Assigned to ${n} athlete${n === 1 ? "" : "s"}.` };
}

export async function unassignProgram(programId: string, assignmentId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("program_assignments").delete().eq("id", assignmentId);
  if (error) throw new Error("Couldn't remove the assignment.");

  revalidatePath(`/programs/${programId}`);
  revalidatePath("/programs");
}
