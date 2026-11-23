"use server";

import { z } from "zod";

import { inlineSuggestion } from "@/lib/ai/inline-suggestion";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export async function loadInlineSuggestion(id: string) {
  const viewer = await getViewer();
  if (viewer?.kind !== "coach" || !z.uuid().safeParse(id).success) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("ai_suggestions").select("*, athletes(first_name, last_name)")
    .eq("id", id).eq("coach_id", viewer.gymId).maybeSingle();
  if (!data) return null;
  return inlineSuggestion(data, data.athletes && `${data.athletes.first_name} ${data.athletes.last_name}`);
}
