"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { failure, type FormState } from "@/lib/auth/form-state";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

const nameSchema = z.object({
  full_name: z.string().trim().min(1, "Enter your name.").max(100),
});

const gymSettingsSchema = z.object({
  gym_name: z.string().trim().max(100),
  units: z.enum(["lb", "kg"]),
  drift_days: z.coerce.number().int().min(1, "Choose between 1 and 60 days.").max(60, "Choose between 1 and 60 days."),
  load_warning_ratio: z.coerce.number().positive("Enter a positive training load ratio."),
});

export async function updateProfile(_: FormState, formData: FormData): Promise<FormState> {
  const parsedName = nameSchema.safeParse({ full_name: formData.get("full_name") });
  if (!parsedName.success) return failure(formData, parsedName.error.issues[0]?.message ?? "Please check the form.");
  const viewer = await getViewer();
  if (viewer?.kind !== "coach") return failure(formData, "Please log in again.");
  const supabase = await createClient();
  const update: Database["public"]["Tables"]["coaches"]["Update"] = { full_name: parsedName.data.full_name };
  if (viewer.role === "owner") {
    const parsedSettings = gymSettingsSchema.safeParse(Object.fromEntries(formData));
    if (!parsedSettings.success) return failure(formData, parsedSettings.error.issues[0]?.message ?? "Please check your settings.");
    update.gym_name = parsedSettings.data.gym_name || null;
    update.units = parsedSettings.data.units;
    update.drift_days = parsedSettings.data.drift_days;
    update.load_warning_ratio = parsedSettings.data.load_warning_ratio;
  }

  const { error } = await supabase
    .from("coaches")
    .update(update)
    .eq("id", viewer.id);
  if (error) return failure(formData, "Couldn't save your settings. Please try again.");

  revalidatePath("/", "layout");
  return { message: "Settings saved." };
}
