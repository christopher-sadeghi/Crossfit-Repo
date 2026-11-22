"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/lib/auth/form-state";
import { loadDemoDataWithClipCleanup } from "@/lib/reset-demo-data.mjs";
import { createClient } from "@/lib/supabase/server";

export async function loadDemoData(_: FormState, formData: FormData): Promise<FormState> {
  const reset = formData.get("mode") === "reset";
  const supabase = await createClient();
  const { data, error, clipError } = await loadDemoDataWithClipCleanup(supabase, reset);
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  const counts = data as { athletes: number; workouts: number; results: number };
  return {
    message: `Loaded ${counts.athletes} athletes, ${counts.workouts} workouts and ${counts.results} results.`,
    ...(clipError && { error: "The demo was reset, but some uploaded movement clips couldn't be removed." }),
  };
}
