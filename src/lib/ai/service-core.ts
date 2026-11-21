import { generateText, Output, type LanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Json } from "@/lib/supabase/database.types";
import type { Database, Enums } from "@/lib/supabase/database.types";

export type SuggestionOptions<S extends z.ZodType> = {
  type: Enums<"suggestion_type">;
  athleteId: string | null;
  input: Json;
  schema: S;
  system: string;
  prompt: string;
  model?: LanguageModel;
};

const DEFAULT_ERROR = "The AI couldn't make a suggestion right now. Please try again in a minute.";
const TIMEOUT_ERROR = "The AI took too long to answer. Please try again.";

function modelId(model: LanguageModel | undefined) {
  return typeof model === "string" ? model : model?.modelId ?? null;
}

export function friendlySuggestionError(error: string | null | undefined) {
  if (!error) return DEFAULT_ERROR;
  return /timeout|timed out|abort/i.test(error) ? TIMEOUT_ERROR : DEFAULT_ERROR;
}

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "";
  return friendlySuggestionError(/^(AbortError|TimeoutError)$/.test(name) ? name : message);
}

async function saveFailure<S extends z.ZodType>(
  supabase: SupabaseClient<Database>,
  opts: SuggestionOptions<S>,
  error: unknown,
  model: LanguageModel | undefined,
) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
  console.error("AI suggestion failed:", error);
  const { error: insertError } = await supabase.from("ai_suggestions").insert({
    suggestion_type: opts.type,
    athlete_id: opts.athleteId,
    input: opts.input as NonNullable<Json>,
    model: modelId(model),
    status: "failed",
    error: message,
  });
  if (insertError) console.error("Could not save failed AI suggestion:", insertError);
  return { error: friendlyError(error) };
}

export async function runSuggestionWithClient<S extends z.ZodType>(
  supabase: SupabaseClient<Database>,
  opts: SuggestionOptions<S>,
): Promise<{ id: string } | { error: string }> {
  const limit = Number(process.env.AI_DAILY_LIMIT ?? 25);
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const { count, error: countError } = await supabase
    .from("ai_suggestions")
    .select("id", { count: "exact", head: true })
    .gte("created_at", startOfToday);

  if (countError) return saveFailure(supabase, opts, countError, opts.model);
  if ((count ?? 0) >= limit) return { error: `You've used today's ${limit} AI suggestions. You can ask for more tomorrow.` };

  let model = opts.model;
  if (!model) {
    if (!process.env.OPENAI_API_KEY) return saveFailure(supabase, opts, new Error("OPENAI_API_KEY is missing."), undefined);
    model = openai(process.env.OPENAI_MODEL ?? "gpt-5.4-mini");
  }

  try {
    const { output } = await generateText({
      model,
      system: opts.system,
      prompt: opts.prompt,
      output: Output.object({ schema: opts.schema }),
      timeout: 45_000,
      maxRetries: 1,
      providerOptions: { openai: { reasoningEffort: "low" } },
    });
    const proposal = opts.schema.parse(output);
    const { data, error } = await supabase
      .from("ai_suggestions")
      .insert({
        suggestion_type: opts.type,
        athlete_id: opts.athleteId,
        input: opts.input as NonNullable<Json>,
        proposal: proposal as Json,
        model: modelId(model),
        status: "pending",
      })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("The suggestion could not be saved.");
    return { id: data.id };
  } catch (error) {
    return saveFailure(supabase, opts, error, model);
  }
}
