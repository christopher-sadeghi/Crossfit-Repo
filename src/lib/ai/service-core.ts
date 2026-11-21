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
  generationSchema?: z.ZodType;
  system: string;
  prompt: string;
  validate?: (proposal: unknown, input: Json) => void;
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

async function failReservation(
  supabase: SupabaseClient<Database>,
  id: string,
  error: unknown,
) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
  console.error("AI suggestion failed:", error);
  const { error: updateError } = await supabase.from("ai_suggestions").update({ error: message }).eq("id", id);
  if (updateError) console.error("Could not update failed AI suggestion:", updateError);
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

  const { data: reservation, error: reservationError } = await supabase
    .from("ai_suggestions")
    .insert({
      suggestion_type: opts.type,
      athlete_id: opts.athleteId,
      input: opts.input as NonNullable<Json>,
      model: modelId(model),
      status: "failed",
      error: "in_progress",
    })
    .select("id")
    .single();
  if (reservationError || !reservation)
    return saveFailure(supabase, opts, reservationError ?? new Error("The suggestion could not be reserved."), model);

  const { count: reservedCount, error: reservationCountError } = await supabase
    .from("ai_suggestions")
    .select("id", { count: "exact", head: true })
    .gte("created_at", startOfToday);
  if (reservationCountError) return failReservation(supabase, reservation.id, reservationCountError);
  if ((reservedCount ?? 0) > limit) {
    const { error } = await supabase.from("ai_suggestions").update({ error: "daily_limit" }).eq("id", reservation.id);
    if (error) console.error("Could not update daily-limited AI suggestion:", error);
    return { error: `You've used today's ${limit} AI suggestions. You can ask for more tomorrow.` };
  }

  try {
    const { output } = await generateText({
      model,
      system: opts.system,
      prompt: opts.prompt,
      output: Output.object({ schema: opts.generationSchema ?? opts.schema }),
      timeout: 45_000,
      maxRetries: 1,
      providerOptions: { openai: { reasoningEffort: "low" } },
    });
    const proposal = opts.schema.parse(output);
    opts.validate?.(proposal, opts.input);
    const { error } = await supabase
      .from("ai_suggestions")
      .update({
        proposal: proposal as Json,
        status: "pending",
        error: null,
      })
      .eq("id", reservation.id);
    if (error) throw error;
    return { id: reservation.id };
  } catch (error) {
    return failReservation(supabase, reservation.id, error);
  }
}
