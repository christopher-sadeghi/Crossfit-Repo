import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Tables } from "@/lib/supabase/database.types";

import { SUGGESTION_REGISTRY } from "./suggestions";

export async function approveSuggestionWithClient(
  supabase: SupabaseClient<Database>,
  suggestion: Tables<"ai_suggestions">,
  finalInput: unknown,
): Promise<{ status: "approved" | "edited" } | { error: string }> {
  const entry = SUGGESTION_REGISTRY[suggestion.suggestion_type];
  if (!entry.apply) return { error: "This suggestion type isn't ready to approve yet." };

  const finalResult = entry.proposalSchema.safeParse(finalInput);
  const proposalResult = entry.proposalSchema.safeParse(suggestion.proposal);
  if (!finalResult.success || !proposalResult.success)
    return { error: "Couldn't approve this suggestion. Please check the values and try again." };

  const status = JSON.stringify(finalResult.data) === JSON.stringify(proposalResult.data) ? "approved" : "edited";
  const { data: claimed, error: claimError } = await supabase
    .from("ai_suggestions")
    .update({ status, final: finalResult.data as import("@/lib/supabase/database.types").Json, decided_at: new Date().toISOString() })
    .eq("id", suggestion.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (claimError || !claimed) return { error: "This suggestion was already decided." };

  try {
    const target = await entry.apply(supabase, claimed, finalResult.data);
    const { error: targetError } = await supabase
      .from("ai_suggestions")
      .update({ target_table: target.target_table, target_id: target.target_id })
      .eq("id", suggestion.id);
    if (targetError) throw targetError;
  } catch {
    await supabase
      .from("ai_suggestions")
      .update({ status: "pending", final: null, decided_at: null })
      .eq("id", suggestion.id);
    return { error: "Couldn't approve this suggestion. Please try again." };
  }

  return { status };
}

export async function rejectSuggestionWithClient(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<{ ok: true } | { error: string }> {
  const { data, error } = await supabase
    .from("ai_suggestions")
    .update({ status: "rejected", decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) return { error: "Couldn't reject this suggestion. Please try again." };
  if (!data) return { error: "This suggestion was already decided." };
  return { ok: true };
}
