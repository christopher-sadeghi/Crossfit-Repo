"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { approveSuggestionWithClient, rejectSuggestionWithClient } from "@/lib/ai/decisions";
import { movementGuideEntry, movementGuideSchema } from "@/lib/ai/movement-guides";
import { runSuggestion } from "@/lib/ai/service";
import { failure, type FormState } from "@/lib/auth/form-state";
import { editedGuideSchema, hasGuideText, readGuideText, videoUrlSchema } from "@/lib/movement-guides";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

const uuid = z.string().uuid();

function refresh(id: string) {
  revalidatePath(`/programs/movements/${id}`);
  revalidatePath(`/athlete/movements/${id}`);
  revalidatePath("/suggestions");
}

export async function requestMovementGuide(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await getViewer();
  const id = uuid.safeParse(form.get("movement_id"));
  if (viewer?.kind !== "coach" || !id.success) return { error: "Movement not found." };
  const supabase = await createClient();
  const [guide, pending] = await Promise.all([
    supabase.from("movement_guides").select("*").eq("coach_id", viewer.id).eq("movement_id", id.data).maybeSingle(),
    supabase.from("ai_suggestions").select("id").eq("coach_id", viewer.id)
      .eq("suggestion_type", "movement_guide").eq("status", "pending").eq("input->>movement_id", id.data).limit(1),
  ]);
  if (guide.error || pending.error) return { error: "Couldn't check existing how-to suggestions. Please try again." };
  if (hasGuideText(guide.data) || pending.data?.length) return { error: "This movement already has a how-to or a pending suggestion. Review or edit it below." };
  try {
    const request = await movementGuideEntry.buildRequest(supabase, id.data);
    const result = await runSuggestion({ type: "movement_guide", athleteId: null, ...request, schema: movementGuideSchema });
    if ("error" in result) return { error: result.error };
    refresh(id.data);
    return { message: "How-to suggested. Review and approve it below before it is published." };
  } catch {
    return { error: "Couldn't write a how-to right now. Please try again." };
  }
}

export async function saveMovementGuide(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await getViewer();
  const id = uuid.safeParse(form.get("movement_id"));
  if (viewer?.kind !== "coach" || !id.success) return failure(form, "Movement not found.");
  const rawVideo = String(form.get("video_url") ?? "").trim();
  const video = rawVideo ? videoUrlSchema.safeParse(rawVideo) : null;
  const text = editedGuideSchema.safeParse(readGuideText(form));
  if (video && !video.success) return failure(form, "Use a valid https video URL (up to 2048 characters).");
  if (!text.success) return failure(form, "Use up to 20 items per section, each up to 200 characters.");
  const supabase = await createClient();
  const { error } = await supabase.from("movement_guides").upsert({
    coach_id: viewer.id, movement_id: id.data, video_url: video?.success ? video.data : null, ...text.data,
  }, { onConflict: "coach_id,movement_id" });
  if (error) return failure(form, "Couldn't save this how-to. Please try again.");
  refresh(id.data);
  return { message: "How-to saved. Athletes can now see your changes." };
}

export async function decideMovementGuide(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await getViewer();
  const id = uuid.safeParse(form.get("suggestion_id"));
  const movementId = uuid.safeParse(form.get("movement_id"));
  if (viewer?.kind !== "coach" || !id.success || !movementId.success) return failure(form, "Suggestion not found.");
  const supabase = await createClient();
  const { data: suggestion, error } = await supabase.from("ai_suggestions").select("*")
    .eq("id", id.data).eq("coach_id", viewer.id).eq("suggestion_type", "movement_guide")
    .eq("input->>movement_id", movementId.data).eq("status", "pending").maybeSingle();
  if (error || !suggestion) return failure(form, "This suggestion was already decided or could not be found.");
  if (form.get("decision") === "reject") {
    const result = await rejectSuggestionWithClient(supabase, id.data);
    if ("error" in result) return failure(form, result.error);
  } else {
    const text = movementGuideSchema.safeParse(readGuideText(form));
    if (!text.success) return failure(form, text.error.issues[0]?.message ?? "Please check the how-to.");
    const result = await approveSuggestionWithClient(supabase, suggestion, text.data);
    if ("error" in result) return failure(form, result.error);
  }
  refresh(movementId.data);
  revalidatePath(`/suggestions/${id.data}`);
  return { message: form.get("decision") === "reject" ? "Suggestion rejected. Nothing was changed." : "How-to approved and published." };
}
