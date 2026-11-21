import "server-only";

import type { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { runSuggestionWithClient, type SuggestionOptions } from "./service-core";

export async function runSuggestion<S extends z.ZodType>(opts: SuggestionOptions<S>) {
  return runSuggestionWithClient(await createClient(), opts);
}
