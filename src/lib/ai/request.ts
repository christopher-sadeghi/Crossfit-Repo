import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Enums } from "@/lib/supabase/database.types";

import { runSuggestionWithClient } from "./service-core";
import { SUGGESTION_REGISTRY, type SuggestionParams } from "./suggestions";

export async function requestRegisteredSuggestion(
  supabase: SupabaseClient<Database>,
  type: Enums<"suggestion_type">,
  params: SuggestionParams,
) {
  const entry = SUGGESTION_REGISTRY[type];
  if (!entry.buildRequest) return { error: "This suggestion type isn't ready yet." };
  try {
    const { schema: generationSchema, ...context } = await entry.buildRequest(supabase, params);
    return await runSuggestionWithClient(supabase, {
      type,
      athleteId: params.athleteId,
      ...context,
      schema: entry.proposalSchema,
      generationSchema,
      validate: entry.validate,
    });
  } catch (error) {
    console.error("Couldn't prepare AI suggestion:", error);
    return { error: "The AI couldn't make a suggestion right now. Please try again in a minute." };
  }
}
