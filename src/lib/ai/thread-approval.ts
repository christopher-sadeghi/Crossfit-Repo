import { sendMessage } from "@/app/messages-actions";
import { threadSourceMessageId } from "./thread-source";
import type { Tables } from "@/lib/supabase/database.types";

type Target = { target_table: string; target_id: string };
type Details = { workoutId?: string; title?: string; date?: string; summary?: string; macros?: {
  calories: number; protein_g: number; carbs_g: number; fat_g: number;
} };

export async function sendThreadApproval(suggestion: Tables<"ai_suggestions">, target: Target, details: Details) {
  if (!suggestion.athlete_id || !threadSourceMessageId(suggestion.input)) return "not_thread";
  let body: string;
  let workoutId: string | undefined;
  if (suggestion.suggestion_type === "write_workout" && target.target_table === "workouts") {
    workoutId = target.target_id;
    body = `I added ${details.title ? `“${details.title}”` : "a WOD"} to your schedule${details.date ? ` for ${details.date}` : ""}.`;
  } else if (suggestion.suggestion_type === "scale_workout") {
    workoutId = details.workoutId;
    body = `I scaled your WOD${details.title ? ` “${details.title}”` : ""}.${details.summary ? ` ${details.summary}` : ""}`;
  } else if (suggestion.suggestion_type === "adjust_macros" && details.macros) {
    const { calories, protein_g, carbs_g, fat_g } = details.macros;
    body = `I updated your daily nutrition targets: ${calories} kcal, ${protein_g} g protein, ${carbs_g} g carbs and ${fat_g} g fat.`;
  } else {
    return "not_thread";
  }

  const form = new FormData();
  form.set("body", body);
  if (workoutId) form.set("link", `workout:${workoutId}`);
  const result = await sendMessage(suggestion.athlete_id, {}, form);
  return result.sentId ? "sent" : "failed";
}
