"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { COACH_SESSION_ERROR } from "@/lib/ai/coach-session";
import {
  FORM_COMMENT_MAX, FORM_CUE_MAX, FORM_QUESTION_MAX, FORM_SET_LABEL_MAX, FORM_VIDEO_BUCKET, FORM_VIDEO_MAX_BYTES,
  FORM_VIDEO_MAX_SECONDS, formVideoTypeForPath, isFormVideoPath,
} from "@/lib/form-reviews";
import { notify } from "@/lib/notifications";
import { progressAccess } from "@/lib/progress-access";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/time-zone";
import { getViewer } from "@/lib/viewer";

export type FormReviewResult = { error?: string; message?: string; saved?: boolean; id?: string };

async function perform(work: () => Promise<FormReviewResult>): Promise<FormReviewResult> {
  try { return await work(); } catch (error) {
    return { error: error instanceof z.ZodError ? error.issues[0].message : error instanceof Error ? error.message : "Something went wrong. Please try again." };
  }
}

function refresh(athleteId: string, reviewId?: string) {
  revalidatePath("/form-checks");
  revalidatePath("/athlete/form-checks");
  revalidatePath(`/athletes/${athleteId}`);
  revalidatePath("/athlete/history");
  if (reviewId) {
    revalidatePath(`/form-checks/${reviewId}`);
    revalidatePath(`/athlete/form-checks/${reviewId}`);
  }
}

const optionalText = (max: number, label: string) => z.string().trim().max(max, `${label} must be ${max} characters or fewer.`).transform((value) => value || null);

const uploadSchema = z.object({
  path: z.string(),
  sizeBytes: z.number().int().positive().max(FORM_VIDEO_MAX_BYTES, "Videos must be 100 MB or smaller."),
  durationSeconds: z.number().positive().max(FORM_VIDEO_MAX_SECONDS, "Videos must be 60 seconds or shorter."),
  recordedOn: z.iso.date("Choose a valid date."),
  movementId: z.uuid().nullable(),
  resultId: z.uuid().nullable(),
  setLabel: optionalText(FORM_SET_LABEL_MAX, "Set"),
  question: optionalText(FORM_QUESTION_MAX, "Your question"),
});

async function reviewAccess(reviewId: string, coachOnly = false) {
  if (!z.uuid().safeParse(reviewId).success) throw new Error("Couldn't find that form check.");
  const viewer = await getViewer();
  if (!viewer || viewer.kind === "none") throw new Error("Please log in again.");
  if (coachOnly && viewer.kind !== "coach") throw new Error(COACH_SESSION_ERROR);
  const supabase = await createClient();
  const { data: review, error } = await supabase.from("form_reviews")
    .select("id, coach_id, athlete_id, storage_path, duration_seconds, movement_id, status").eq("id", reviewId).maybeSingle();
  if (error || !review) throw new Error("Couldn't find that form check. Refresh and try again.");
  if (viewer.kind === "coach" ? review.coach_id !== viewer.id : review.athlete_id !== viewer.athleteId) throw new Error("You can't access this form check.");
  return { supabase, viewer, review: { ...review, duration_seconds: Number(review.duration_seconds) } };
}

export async function saveFormReview(input: z.input<typeof uploadSchema>) {
  return perform(async () => {
    const viewer = await getViewer();
    if (viewer?.kind !== "athlete") throw new Error("Only athletes can upload form videos.");
    const { supabase, athlete } = await progressAccess(viewer.athleteId);
    const values = uploadSchema.parse(input);
    if (values.recordedOn > await getToday()) throw new Error("Choose today or an earlier date.");
    if (!values.movementId && !values.resultId && !values.question) throw new Error("Pick a workout result or movement, or ask your coach a question.");
    if (!isFormVideoPath(values.path, athlete.coach_id, athlete.id)) throw new Error("Invalid video path.");
    const contentType = formVideoTypeForPath(values.path)!;
    const { data: object, error: objectError } = await supabase.storage.from(FORM_VIDEO_BUCKET).info(values.path);
    if (objectError || !object) throw new Error("Upload the video before saving.");
    if (object.contentType !== contentType || (object.size ?? 0) > FORM_VIDEO_MAX_BYTES) throw new Error("This video doesn't match its upload. Please try again.");
    const { data: review, error } = await supabase.from("form_reviews").insert({
      coach_id: athlete.coach_id, athlete_id: athlete.id, storage_path: values.path, content_type: contentType,
      size_bytes: object.size ?? values.sizeBytes, duration_seconds: Math.round(values.durationSeconds * 100) / 100,
      recorded_on: values.recordedOn, movement_id: values.movementId, workout_result_id: values.resultId,
      set_label: values.setLabel, question: values.question,
    }).select("id").single();
    if (error) throw new Error("Couldn't save your form check. Check the workout or movement and try again.");
    await notify(supabase, {
      athleteId: athlete.id, kind: "form_check", title: "New form check video",
      body: values.question ? `Your athlete asked: ${values.question}` : "Your athlete uploaded a video for form review.",
      link: `/form-checks/${review.id}`, dedupeKey: `form-check:${review.id}`,
    });
    refresh(athlete.id);
    return { saved: true, id: review.id, message: "Video sent to your coach." };
  });
}

export async function addFormComment(reviewId: string, atSeconds: number, body: string) {
  return perform(async () => {
    const { supabase, review } = await reviewAccess(reviewId, true);
    const text = z.string().trim().min(1, "Write a comment first.").max(FORM_COMMENT_MAX, `Comments must be ${FORM_COMMENT_MAX} characters or fewer.`).parse(body);
    const at = z.number().min(0).finite().parse(atSeconds);
    const { error } = await supabase.from("form_review_comments").insert({
      review_id: review.id, coach_id: review.coach_id, athlete_id: review.athlete_id,
      at_seconds: Math.round(Math.min(at, review.duration_seconds) * 100) / 100, body: text,
    });
    if (error) throw new Error("Couldn't save your comment. Please try again.");
    refresh(review.athlete_id, review.id);
    return { message: "Comment pinned." };
  });
}

export async function replyToFormComment(reviewId: string, parentId: string, body: string) {
  return perform(async () => {
    const { supabase, viewer, review } = await reviewAccess(reviewId);
    if (viewer.kind !== "athlete") throw new Error("Only the athlete can reply to coach comments.");
    z.uuid().parse(parentId);
    const text = z.string().trim().min(1, "Write a reply first.").max(FORM_COMMENT_MAX, `Replies must be ${FORM_COMMENT_MAX} characters or fewer.`).parse(body);
    const { data: reply, error } = await supabase.from("form_review_comments").insert({
      review_id: review.id, coach_id: review.coach_id, athlete_id: review.athlete_id, parent_id: parentId, body: text,
    }).select("id").single();
    if (error) throw new Error("Couldn't send your reply. Please try again.");
    await notify(supabase, {
      athleteId: review.athlete_id, kind: "message", title: "Replied to form feedback", body: text.slice(0, 200),
      link: `/form-checks/${review.id}`, dedupeKey: `form-reply:${reply.id}`,
    });
    refresh(review.athlete_id, review.id);
    return { message: "Reply sent." };
  });
}

export async function deleteFormComment(reviewId: string, commentId: string) {
  return perform(async () => {
    const { supabase, review } = await reviewAccess(reviewId);
    z.uuid().parse(commentId);
    const { data, error } = await supabase.from("form_review_comments").delete().eq("review_id", review.id).eq("id", commentId).select("id");
    if (error || !data.length) throw new Error("Couldn't delete that comment.");
    refresh(review.athlete_id, review.id);
    return { message: "Comment deleted." };
  });
}

export async function markFormReviewed(reviewId: string, cue: string) {
  return perform(async () => {
    const { supabase, review } = await reviewAccess(reviewId, true);
    const cueText = z.string().trim().max(FORM_CUE_MAX, `Cues must be ${FORM_CUE_MAX} characters or fewer.`).parse(cue);
    if (cueText && review.movement_id) {
      const { error } = await supabase.from("athlete_movement_cues").upsert({
        athlete_id: review.athlete_id, movement_id: review.movement_id, coach_id: review.coach_id, cue: cueText,
      });
      if (error) throw new Error("Couldn't save the movement cue. Nothing was marked reviewed.");
    }
    if (review.status !== "reviewed") {
      const { error } = await supabase.from("form_reviews").update({ status: "reviewed" }).eq("id", review.id);
      if (error) throw new Error("Couldn't mark this video reviewed. Please try again.");
      await notify(supabase, {
        athleteId: review.athlete_id, kind: "form_reviewed", title: "Your coach reviewed your form video",
        body: "Open it to see comments pinned on the video.", link: `/athlete/form-checks/${review.id}`,
        dedupeKey: `form-reviewed:${review.id}`,
      });
    }
    refresh(review.athlete_id, review.id);
    return { message: review.status === "reviewed" ? "Cue saved." : "Marked reviewed. Your athlete has been notified." };
  });
}

export async function deleteFormReview(reviewId: string) {
  return perform(async () => {
    const { supabase, review } = await reviewAccess(reviewId);
    const bucket = supabase.storage.from(FORM_VIDEO_BUCKET);
    const { data: removed, error: storageError } = await bucket.remove([review.storage_path]);
    if (storageError || (!removed?.length && !(await bucket.info(review.storage_path)).error)) {
      throw new Error("Couldn't remove the video file. Nothing was deleted; please try again.");
    }
    const { error } = await supabase.from("form_reviews").delete().eq("id", review.id).eq("storage_path", review.storage_path);
    if (error) throw new Error("The video file was removed, but its entry couldn't be deleted. Please try deleting it again.");
    refresh(review.athlete_id);
    return { message: "Video and comments deleted." };
  });
}
