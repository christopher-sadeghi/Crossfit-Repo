"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/supabase/server";

export async function loadDemoData(_: FormState, formData: FormData): Promise<FormState> {
  const reset = formData.get("mode") === "reset";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("load_demo_data", { reset });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  const counts = data as { athletes: number; workouts: number; results: number };
  return {
    message: `Loaded ${counts.athletes} athletes, ${counts.workouts} workouts and ${counts.results} results.`,
  };
}
