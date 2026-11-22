"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { failure, type FormState } from "@/lib/auth/form-state";
import { MOVEMENT_DEMO_BUCKET } from "@/lib/movement-guides";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

import { CATEGORIES, MEASURES } from "../options";

const movementSchema = z.object({
  name: z.string().trim().min(2, "Enter a movement name.").max(60),
  category: z.enum(CATEGORIES, { message: "Choose a category." }),
  measure: z.enum(MEASURES, { message: "Choose how it's measured." }),
});

export async function addMovement(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = movementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(formData, parsed.error.issues[0]?.message ?? "Please check the form.");

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("movements")
    .select("id")
    .ilike("name", parsed.data.name.replace(/[\\%_]/g, "\\$&"))
    .limit(1);
  if (existing?.length) return failure(formData, `“${parsed.data.name}” is already in your library.`);

  const { error } = await supabase.from("movements").insert(parsed.data);
  if (error) return failure(formData, "Couldn't add the movement. Please try again.");

  revalidatePath("/programs/movements");
  return { message: `Added ${parsed.data.name}.` };
}

export async function deleteMovement(id: string): Promise<{ error?: string }> {
  const viewer = await getViewer();
  if (viewer?.kind !== "coach" || !z.string().uuid().safeParse(id).success) return { error: "Couldn't delete the movement." };
  const supabase = await createClient();
  const { data: guide, error: guideError } = await supabase.from("movement_guides")
    .select("clip_path").eq("coach_id", viewer.id).eq("movement_id", id).maybeSingle();
  if (guideError) return { error: "Couldn't check for an uploaded demo. Please try again." };
  const { error, count } = await supabase
    .from("movements")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("coach_id", viewer.id);
  if (error?.code === "23503") return { error: "This movement is used in a WOD. Remove it from those WODs first." };
  if (error || !count) return { error: "Couldn't delete the movement." };

  revalidatePath("/programs/movements");
  if (guide?.clip_path) {
    const { error: clipError } = await supabase.storage.from(MOVEMENT_DEMO_BUCKET).remove([guide.clip_path]);
    if (clipError) return { error: "The movement was deleted, but its uploaded clip couldn't be removed." };
  }
  return {};
}
