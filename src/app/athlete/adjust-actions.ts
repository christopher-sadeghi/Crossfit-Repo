"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { effectiveScaling } from "@/lib/ai/athlete-adjust-schema";
import { athleteAdjustFeelingSchema, buildAthleteAdjustRequest, runAthleteAdjustment } from "@/lib/ai/athlete-adjust";
import { loadAthleteSchedule } from "@/lib/athlete-schedule";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/time-zone";
import { getViewer } from "@/lib/viewer";

export type AdjustState = {
  error?: string;
  message?: string;
  checkWithCoach?: boolean;
  feeling?: string;
};

export async function adjustTodaysWorkout(_: AdjustState, formData: FormData): Promise<AdjustState> {
  const rawFeeling = formData.get("feeling");
  const feelingText = typeof rawFeeling === "string" ? rawFeeling : "";
  const workoutId = z.string().uuid().safeParse(formData.get("workout_id"));
  const feeling = athleteAdjustFeelingSchema.safeParse(feelingText);
  if (!workoutId.success) return { error: "This WOD could not be found.", feeling: feelingText };
  if (!feeling.success)
    return { error: "Tell us how you feel in 3–300 characters.", feeling: feelingText };

  const viewer = await getViewer();
  if (viewer?.kind !== "athlete") return { error: "Sign in as an athlete to adjust a WOD." };
  const supabase = await createClient();
  const currentDate = await getToday();

  const [schedule, { data: scaling, error: scalingError }] = await Promise.all([
    loadAthleteSchedule(supabase, viewer.athleteId, { from: currentDate, to: currentDate }, "id, source_workout_id, title, week_number, day_number"),
    supabase
      .from("athlete_workout_scalings")
      .select("updated_at, modifications, details, athlete_adjusted_at, coach_modifications, coach_details")
      .eq("athlete_id", viewer.athleteId)
      .eq("workout_id", workoutId.data)
      .maybeSingle(),
  ]);
  if (!schedule.some((item) => item.date === currentDate && item.workout.id === workoutId.data))
    return { error: "You can only adjust today's WOD.", feeling: feeling.data };
  if (scalingError) return { error: "Couldn't load your WOD. Please try again.", feeling: feeling.data };

  let result: Awaited<ReturnType<typeof runAthleteAdjustment>>;
  try {
    const request = await buildAthleteAdjustRequest(supabase, {
      athleteId: viewer.athleteId,
      workoutId: workoutId.data,
      scheduledOn: currentDate,
      feeling: feeling.data,
      units: viewer.units,
      scaling: scaling && {
        updated_at: scaling.updated_at,
        modifications: effectiveScaling(scaling, currentDate)?.modifications ?? null,
        details: effectiveScaling(scaling, currentDate)?.details ?? null,
      },
    });
    result = await runAthleteAdjustment(supabase, request);
  } catch (error) {
    console.error("Athlete adjustment failed:", error);
    return { error: "The AI couldn't adjust your WOD right now. Please try again in a minute.", feeling: feeling.data };
  }
  if (!result.ok) return { error: result.error, checkWithCoach: result.checkWithCoach, feeling: feeling.data };

  revalidatePath("/athlete");
  revalidatePath(`/programs/workouts/${workoutId.data}`);
  revalidatePath(`/athletes/${viewer.athleteId}`);
  revalidatePath("/suggestions");
  return { message: "Your WOD is adjusted. Your coach has been told and may follow up.", checkWithCoach: result.checkWithCoach };
}
