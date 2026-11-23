"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { failure, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/supabase/server";
import { getCoach } from "@/lib/coach";

export async function publishWaiver(_previousState: FormState, formData: FormData): Promise<FormState> {
  const coach = await getCoach();
  if (coach?.role !== "owner") return failure(formData, "Only the owner can publish a waiver.");
  const parsedBody = z.string().trim().min(50).max(20_000).safeParse(formData.get("body"));
  if (!parsedBody.success) return failure(formData, "Waiver text must be between 50 and 20,000 characters.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_coach_waiver", {
    p_body: parsedBody.data,
    p_require_resign: formData.get("requires_resign") === "on",
  });
  if (error) return failure(formData, "Couldn't publish the waiver. Please try again.");

  revalidatePath("/settings");
  revalidatePath("/athlete");
  revalidatePath("/athlete/waiver");
  revalidatePath("/athletes");
  revalidatePath("/athletes/[id]", "page");
  return { message: "Waiver published." };
}
