"use server";

import { revalidatePath } from "next/cache";
import { sendMessage } from "@/app/messages-actions";
import { assistantSafety } from "@/lib/ai/assistant-safety";
import { coachMessageDraftSchema } from "@/lib/ai/assistant-schema";
import { runSuggestionWithClient } from "@/lib/ai/service-core";
import { SUGGESTION_REGISTRY } from "@/lib/ai/suggestions";
import { DEFAULT_DRIFT_DAYS } from "@/lib/consistency";
import { validateMessageLink } from "@/lib/messages";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { loadAssistantCard, type AssistantCardIdentity } from "@/lib/ai/assistant-card-actions";
import { saveActivity } from "@/lib/activity-actions";
import type { FormState } from "@/lib/auth/form-state";

export async function sendAssistantCoachMessage(input: unknown, identity: AssistantCardIdentity): Promise<{ error?: string; sentId?: string; suggestionId?: string; warning?: string }> {
  const viewer = await getViewer();
  if (viewer?.kind !== "athlete") return { error: "Sign in as an athlete to send a message." };
  const parsed = coachMessageDraftSchema.safeParse(input);
  if (!parsed.success) return { error: "Check your message and requested change." };
  const supabase = await createClient();
  const { body } = parsed.data;
  try {
    const card = await loadAssistantCard(supabase, viewer, identity);
    if (card?.kind !== "coach_message") return { error: "This message draft could not be found." };
    const change = card.change;
    const { data: settings, error: settingsError } = await supabase.rpc("athlete_assistant_settings");
    if (settingsError || !settings?.[0]) return { error: "Your active athlete profile could not be found." };
    if (change && (assistantSafety(body).flagged || assistantSafety(change.note).flagged))
      return { error: "For a safety concern, send a plain message to your coach without a change request." };
    if (change && !(change.type === "adjust_macros" ? settings[0].assistant_nutrition : settings[0].assistant_training))
      return { error: "Ask your coach about this topic by sending a plain message without a change request." };
    if (change?.workoutId && !await validateMessageLink(supabase, viewer.athleteId, { type: "workout", id: change.workoutId }, false))
      return { error: "Choose a WOD on your own schedule." };
    const form = new FormData();
    form.set("body", body);
    if (change?.workoutId) form.set("link", `workout:${change.workoutId}`);
    const sent = await sendMessage(viewer.athleteId, {}, form, identity);
    if (sent.alreadyCompleted) return { sentId: sent.sentId, warning: "Already sent to your coach." };
    if (!sent.sentId || !change) return sent;
    try {
      const { data: claims, error: claimsError } = await supabase.auth.getClaims();
      const requestedBy = claims?.claims?.sub;
      if (claimsError || typeof requestedBy !== "string") throw new Error("Session expired.");
      const entry = SUGGESTION_REGISTRY[change.type];
      if (!entry.buildRequest) throw new Error("Suggestion unavailable.");
      const request = await entry.buildRequest(supabase, {
        athleteId: viewer.athleteId, workoutId: change.workoutId,
        scheduledOn: change.scheduledOn, request: change.note,
        session: { units: viewer.units, driftDays: DEFAULT_DRIFT_DAYS, athleteFacing: true },
      });
      if (!request.input || typeof request.input !== "object" || Array.isArray(request.input)) throw new Error("Invalid suggestion input.");
      const result = await runSuggestionWithClient(supabase, {
        ...request, type: change.type, athleteId: viewer.athleteId, coachId: viewer.coachId, requestedBy,
        input: { ...request.input, source_message_id: sent.sentId },
        prompt: change.type === "adjust_macros" ? `${request.prompt}\n\nAthlete request: ${change.note}` : request.prompt,
        schema: entry.proposalSchema, generationSchema: request.schema, validate: entry.validate,
      });
      revalidatePath(`/messages/${viewer.athleteId}`);
      return "error" in result ? { sentId: sent.sentId, warning: `Message sent, but the change card couldn't be created. ${result.error}` }
        : { sentId: sent.sentId, suggestionId: result.id };
    } catch {
      return { sentId: sent.sentId, warning: "Message sent, but the change card couldn't be created. Your coach can still read your request." };
    }
  } catch {
    return { error: "Couldn't send your message. Please try again." };
  }
}

export async function saveAssistantActivity(identity: AssistantCardIdentity, previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (viewer?.kind !== "athlete") return { error: "Sign in as an athlete to save an activity." };
  try {
    const supabase = await createClient();
    const card = await loadAssistantCard(supabase, viewer, identity);
    if (card?.kind !== "activity") return { error: "This activity draft could not be found." };
    formData.set("source", "ai");
    return await saveActivity(viewer.athleteId, null, previous, formData, identity);
  } catch {
    return { error: "Couldn't save the activity. Please try again." };
  }
}
