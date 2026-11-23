"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { failure, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

const inputSchema = z.object({
  athlete_id: z.string().uuid(),
  assigned_coach_id: z.union([z.literal(""), z.string().uuid()]),
});

export async function saveAssignedCoach(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = inputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(formData, "Choose a valid coach.");
  const viewer = await getViewer();
  if (viewer?.kind !== "coach") return failure(formData, "Please log in again.");
  const supabase = await createClient();
  const { data: athlete } = await supabase.from("athletes").select("id")
    .eq("id", parsed.data.athlete_id).eq("coach_id", viewer.gymId).maybeSingle();
  if (!athlete) return failure(formData, "Couldn't find this athlete in your gym.");

  const assignedCoachId = parsed.data.assigned_coach_id || null;
  if (assignedCoachId) {
    const { data: coach } = await supabase.from("coaches").select("id")
      .eq("id", assignedCoachId).eq("gym_id", viewer.gymId).maybeSingle();
    if (!coach) return failure(formData, "Choose a coach from your gym.");
  }
  const { error } = await supabase.from("athletes").update({ assigned_coach_id: assignedCoachId })
    .eq("id", athlete.id).eq("coach_id", viewer.gymId);
  if (error) return failure(formData, "Couldn't update the assigned coach.");
  revalidatePath(`/athletes/${athlete.id}`);
  revalidatePath("/athletes");
  return { message: "Assigned coach updated." };
}
