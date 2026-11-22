"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { failure, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/supabase/server";

const profileSchema = z.object({
  full_name: z.string().trim().min(1, "Enter your name.").max(100),
  gym_name: z.string().trim().max(100),
  units: z.enum(["lb", "kg"]),
  drift_days: z.coerce.number().int().min(1, "Choose between 1 and 60 days.").max(60, "Choose between 1 and 60 days."),
  load_warning_ratio: z.coerce.number().positive("Enter a positive training load ratio."),
});

export async function updateProfile(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return failure(formData, parsed.error.issues[0]?.message ?? "Please check the form.");
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return failure(formData, "Your session has expired. Please log in again.");

  const { error } = await supabase
    .from("coaches")
    .update({ ...parsed.data, gym_name: parsed.data.gym_name || null })
    .eq("id", userId);
  if (error) return failure(formData, "Couldn't save your settings. Please try again.");

  revalidatePath("/", "layout");
  return { message: "Settings saved." };
}
