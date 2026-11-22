import type { SupabaseClient } from "@supabase/supabase-js";

import { FORM_VIDEO_BUCKET, sortReviewQueue, threadComments, type FormReviewStatus } from "@/lib/form-reviews";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

export const FORM_REVIEW_COLUMNS = `id, coach_id, athlete_id, storage_path, duration_seconds, recorded_on, movement_id, workout_result_id, set_label, question, status, reviewed_at, created_at,
  athlete:athletes!form_reviews_athlete_id_fkey(first_name, last_name),
  movement:movements!form_reviews_movement_id_fkey(name),
  result:workout_results!form_reviews_workout_result_id_fkey(performed_on, workout_id, workouts(title))` as const;

export type FormReviewSummary = {
  id: string; coach_id: string; athlete_id: string; storage_path: string; duration_seconds: number; recorded_on: string;
  movement_id: string | null; workout_result_id: string | null; set_label: string | null; question: string | null;
  status: FormReviewStatus; reviewed_at: string | null; created_at: string;
  athlete: { first_name: string; last_name: string } | null;
  movement: { name: string } | null;
  result: { performed_on: string; workout_id: string; workouts: { title: string } | null } | null;
  comment_count: number;
};

export type FormReviewComment = { id: string; parent_id: string | null; author_id: string; at_seconds: number | null; body: string; created_at: string };

export async function loadFormReviews(supabase: Client, filter: { coachId?: string; athleteId?: string; resultIds?: string[] }): Promise<FormReviewSummary[]> {
  let query = supabase.from("form_reviews").select(`${FORM_REVIEW_COLUMNS}, comments:form_review_comments(count)`).order("created_at", { ascending: false }).limit(200);
  if (filter.coachId) query = query.eq("coach_id", filter.coachId);
  if (filter.athleteId) query = query.eq("athlete_id", filter.athleteId);
  if (filter.resultIds) {
    if (!filter.resultIds.length) return [];
    query = query.in("workout_result_id", filter.resultIds);
  }
  const { data, error } = await query;
  if (error) throw new Error("Couldn't load form checks.");
  return sortReviewQueue(data.map(({ comments, ...review }) => ({
    ...review,
    duration_seconds: Number(review.duration_seconds),
    status: review.status as FormReviewStatus,
    comment_count: (comments as unknown as { count: number }[])[0]?.count ?? 0,
  })));
}

export async function loadFormReview(supabase: Client, id: string) {
  const [{ data: review, error }, { data: comments, error: commentError }] = await Promise.all([
    supabase.from("form_reviews").select(`${FORM_REVIEW_COLUMNS}, content_type`).eq("id", id).maybeSingle(),
    supabase.from("form_review_comments").select("id, parent_id, author_id, at_seconds, body, created_at").eq("review_id", id).order("created_at"),
  ]);
  if (error || commentError) throw new Error("Couldn't load this form check.");
  if (!review) return null;
  const [{ data: signed }, { data: cue }] = await Promise.all([
    supabase.storage.from(FORM_VIDEO_BUCKET).createSignedUrl(review.storage_path, 3600),
    review.movement_id
      ? supabase.from("athlete_movement_cues").select("cue").eq("athlete_id", review.athlete_id).eq("movement_id", review.movement_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    review: { ...review, duration_seconds: Number(review.duration_seconds), status: review.status as FormReviewStatus },
    videoUrl: signed?.signedUrl ?? null,
    comments: threadComments((comments ?? []).map((comment) => ({ ...comment, at_seconds: comment.at_seconds === null ? null : Number(comment.at_seconds) }))),
    cue: cue?.cue ?? null,
  };
}

export type LoadedFormReview = NonNullable<Awaited<ReturnType<typeof loadFormReview>>>;

export async function countAwaitingFormReviews(supabase: Client, coachId: string) {
  const { count } = await supabase.from("form_reviews").select("id", { count: "exact", head: true }).eq("coach_id", coachId).eq("status", "awaiting_review");
  return count ?? 0;
}
