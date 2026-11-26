"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { approveSuggestionWithClient, rejectSuggestionWithClient } from "@/lib/ai/decisions";
import { movementGuideEntry, movementGuideSchema, newMovementGuideSchema } from "@/lib/ai/movement-guides";
import { runSuggestion } from "@/lib/ai/service";
import { failure, type FormState } from "@/lib/auth/form-state";
import { lookupCrossfitVideo } from "@/lib/crossfit-lookup";
import { loadMovementDemoSource } from "@/lib/movement-demos";
import { canSaveDemoCues, demoEmbedUrl, editedGuideSchema, hasGuideText, MOVEMENT_DEMO_BUCKET, readGuideText } from "@/lib/movement-guides";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

const uuid = z.string().uuid();

function refresh(id: string) {
  revalidatePath(`/programs/movements/${id}`);
  revalidatePath(`/athlete/movements/${id}`);
  revalidatePath("/settings/ai-history");
}

export async function requestMovementGuide(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await getViewer();
  const id = uuid.safeParse(form.get("movement_id"));
  if (viewer?.kind !== "coach" || !id.success) return { error: "Movement not found." };
  const supabase = await createClient();
  const [guide, pending] = await Promise.all([
    supabase.from("movement_guides").select("*").eq("coach_id", viewer.gymId).eq("movement_id", id.data).maybeSingle(),
    supabase.from("ai_suggestions").select("id").eq("coach_id", viewer.gymId)
      .eq("suggestion_type", "movement_guide").eq("status", "pending").eq("input->>movement_id", id.data).limit(1),
  ]);
  if (guide.error || pending.error) return { error: "Couldn't check existing how-to suggestions. Please try again." };
  if (hasGuideText(guide.data) || pending.data?.length) return { error: "This movement already has a how-to or a pending suggestion. Review or edit it below." };
  try {
    const request = await movementGuideEntry.buildRequest(supabase, { athleteId: null, movementId: id.data });
    const result = await runSuggestion({ type: "movement_guide", athleteId: null, ...request, schema: newMovementGuideSchema });
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
  const text = editedGuideSchema.safeParse(readGuideText(form));
  if (!text.success) return failure(form, "Use up to 20 items per section, each up to 200 characters.");
  const easier = uuid.nullable().safeParse(form.get("easier_movement_id") || null);
  const harder = uuid.nullable().safeParse(form.get("harder_movement_id") || null);
  if (!easier.success || !harder.success) return failure(form, "Choose a movement from your library.");
  const supabase = await createClient();
  const source = await loadMovementDemoSource(supabase, id.data, viewer.gymId).catch(() => null);
  if (!source) return failure(form, "Couldn't find this movement.");
  const { movement, guide } = source;
  if (!canSaveDemoCues(text.data.cues, guide?.cues)) return failure(form, "Enter 3–5 coaching cues or leave your existing cues unchanged.");
  const easierId = easier.data ?? movement.easier_movement_id;
  const harderId = harder.data ?? movement.harder_movement_id;
  if (easierId === id.data || harderId === id.data || (easierId && easierId === harderId)) {
    return failure(form, "Choose different movements for the easier and harder variations.");
  }
  if (rawVideo && rawVideo !== guide?.video_url && !demoEmbedUrl(rawVideo)) {
    return failure(form, "Enter a YouTube or Vimeo video link.");
  }
  const currentClip = guide?.clip_path ?? null;
  const uploaded = String(form.get("uploaded_clip") ?? "");
  const keepClip = form.get("remove_clip") !== "on";
  if (rawVideo && (uploaded || (currentClip && keepClip))) {
    return failure(form, "Choose an uploaded clip or a video link, not both.");
  }
  const storage = supabase.storage.from(MOVEMENT_DEMO_BUCKET);
  if (uploaded) {
    const prefix = `${viewer.gymId}/${id.data}/`;
    if (!uploaded.startsWith(prefix) || !/^[a-f0-9-]+\.(mp4|webm)$/.test(uploaded.slice(prefix.length)) ||
      (await storage.info(uploaded)).error) return failure(form, "Couldn't find the uploaded clip. Upload it again.");
  }
  const clipPath = uploaded || (keepClip ? currentClip : null);
  const { error } = await supabase.from("movement_guides").upsert({
    coach_id: viewer.gymId, movement_id: id.data, video_url: rawVideo || null, clip_path: clipPath,
    easier_movement_id: easier.data, harder_movement_id: harder.data, ...text.data,
  }, { onConflict: "coach_id,movement_id" });
  if (error?.code === "23514" || error?.code === "23503") return failure(form, "Choose variations that are in your library.");
  if (error) return failure(form, "Couldn't save this how-to. Please try again.");
  if (currentClip && currentClip !== clipPath) await storage.remove([currentClip]);
  refresh(id.data);
  return { message: "How-to saved. Athletes can now see your changes." };
}

export async function suggestCrossfitVideo(movementId: string): Promise<{
  suggestion: { crossfitUrl: string; videoUrl: string } | null;
  error?: string;
}> {
  const viewer = await getViewer();
  const id = uuid.safeParse(movementId);
  if (viewer?.kind !== "coach" || !id.success) return { suggestion: null, error: "Movement not found." };

  const supabase = await createClient();
  const source = await loadMovementDemoSource(supabase, id.data, viewer.gymId).catch(() => null);
  if (!source) return { suggestion: null, error: "Couldn't find this movement." };
  if (source.movement.demo_video_url || source.guide?.video_url || source.guide?.clip_path) {
    return { suggestion: null };
  }

  return { suggestion: await lookupCrossfitVideo(source.movement.name) };
}

export async function applyCrossfitVideo(movementId: string): Promise<{ error?: string }> {
  const viewer = await getViewer();
  const id = uuid.safeParse(movementId);
  if (viewer?.kind !== "coach" || !id.success) return { error: "Movement not found." };

  const supabase = await createClient();
  const source = await loadMovementDemoSource(supabase, id.data, viewer.gymId).catch(() => null);
  if (!source) return { error: "Couldn't find this movement." };
  const { movement, guide } = source;
  if (movement.demo_video_url || guide?.video_url || guide?.clip_path) {
    return { error: "This movement already has a demo video." };
  }

  const suggestion = await lookupCrossfitVideo(movement.name);
  if (!suggestion) return { error: "No CrossFit video found." };

  if (movement.coach_id === viewer.gymId) {
    const { data, error } = await supabase.from("movements")
      .update({ demo_video_url: suggestion.videoUrl, crossfit_url: suggestion.crossfitUrl })
      .eq("id", id.data)
      .eq("coach_id", viewer.gymId)
      .select("id")
      .maybeSingle();
    if (error || !data) return { error: "Couldn't save this CrossFit video. Please try again." };
  } else if (movement.coach_id === null) {
    const { error } = await supabase.from("movement_guides").upsert({
      coach_id: viewer.gymId,
      movement_id: id.data,
      video_url: suggestion.videoUrl,
    }, { onConflict: "coach_id,movement_id" });
    if (error) return { error: "Couldn't save this CrossFit video. Please try again." };
  } else {
    return { error: "Movement not found." };
  }

  refresh(id.data);
  revalidatePath("/programs/movements");
  return {};
}

export async function decideMovementGuide(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await getViewer();
  const id = uuid.safeParse(form.get("suggestion_id"));
  const movementId = uuid.safeParse(form.get("movement_id"));
  if (viewer?.kind !== "coach" || !id.success || !movementId.success) return failure(form, "Suggestion not found.");
  const supabase = await createClient();
  const { data: suggestion, error } = await supabase.from("ai_suggestions").select("*")
    .eq("id", id.data).eq("coach_id", viewer.gymId).eq("suggestion_type", "movement_guide")
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
