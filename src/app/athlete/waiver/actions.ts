"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { failure, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

const signSchema = z.object({
  waiver_id: z.string().uuid(),
  signed_name: z.string().trim().min(2).max(200),
  agreement: z.literal("on"),
});

export async function signWaiver(_previousState: FormState, formData: FormData): Promise<FormState> {
  const parsed = signSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(formData, "Enter your full name and agree to the waiver before signing.");
  const viewer = await getViewer();
  if (viewer?.kind !== "athlete") return failure(formData, "Please sign in as an athlete.");

  const requestHeaders = await headers();
  const userAgent = requestHeaders.get("user-agent")?.slice(0, 500) ?? "";
  const supabase = await createClient();
  const { error } = await supabase.rpc("sign_coach_waiver", {
    p_waiver_id: parsed.data.waiver_id,
    p_signed_name: parsed.data.signed_name,
    p_user_agent: userAgent,
  });
  if (error) return failure(formData, "Couldn't sign this waiver. Refresh the page and try again.");

  revalidatePath("/athlete/waiver");
  revalidatePath("/athlete");
  revalidatePath("/athletes");
  revalidatePath("/athletes/[id]", "page");
  return { message: "Waiver signed." };
}
