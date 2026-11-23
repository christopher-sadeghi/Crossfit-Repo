"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { programmingStyleSchema } from "@/lib/programming-style";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

async function saveStyle(answers: unknown, status: "completed" | "skipped") {
  const viewer = await getViewer();
  if (viewer?.kind !== "coach") redirect("/login");
  const parsed = programmingStyleSchema.safeParse(answers);
  if (!parsed.success) throw new Error("Check your programming style answers.");
  const supabase = await createClient();
  const { error } = await supabase.from("coach_programming_styles").upsert({
    coach_id: viewer.id,
    status,
    answers: parsed.data,
    updated_at: new Date().toISOString(),
  }, { onConflict: "coach_id" });
  if (error) throw new Error("Couldn't save your programming style.");
  revalidatePath("/");
  revalidatePath("/settings");
  redirect("/");
}

export async function saveProgrammingStyle(answers: unknown) {
  return saveStyle(answers, "completed");
}

export async function skipProgrammingStyle(answers: unknown) {
  return saveStyle(answers, "skipped");
}
