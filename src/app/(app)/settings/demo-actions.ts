"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/lib/auth/form-state";
import { LIVE_MEMBERSHIP_STATUSES } from "@/lib/payments/athlete-core";
import { loadDemoDataWithClipCleanup } from "@/lib/reset-demo-data.mjs";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export async function loadDemoData(_: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (viewer?.kind !== "coach" || viewer.role !== "owner") return { error: "Only the gym owner can manage demo data." };
  const reset = formData.get("mode") === "reset";
  const supabase = await createClient();
  if (reset) {
    const { data: membership, error: membershipError } = await supabase.from("athlete_memberships")
      .select("id")
      .eq("coach_id", viewer.gymId)
      .in("status", [...LIVE_MEMBERSHIP_STATUSES])
      .limit(1)
      .maybeSingle();
    if (membershipError) return { error: "Couldn't check memberships before resetting demo data. Please try again." };
    if (membership) {
      return { error: "Some athletes have active memberships. Cancel them in your Stripe dashboard before resetting demo data." };
    }
  }
  const { data, error, clipError } = await loadDemoDataWithClipCleanup(supabase, reset);
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  const counts = data as { athletes: number; workouts: number; results: number };
  return {
    message: `Loaded ${counts.athletes} athletes, ${counts.workouts} workouts and ${counts.results} results.`,
    ...(clipError && { error: "The demo was reset, but some uploaded movement clips couldn't be removed." }),
  };
}
