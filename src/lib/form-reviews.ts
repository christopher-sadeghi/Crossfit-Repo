export const FORM_VIDEO_BUCKET = "form-videos";
export const FORM_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const FORM_VIDEO_MAX_SECONDS = 60;
export const FORM_COMMENT_MAX = 1000;
export const FORM_QUESTION_MAX = 1000;
export const FORM_CUE_MAX = 300;
export const FORM_SET_LABEL_MAX = 80;
export const FRAME_SECONDS = 1 / 30;
export const PLAYBACK_RATES = [0.25, 0.5, 1] as const;

const VIDEO_TYPES = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" } as const;
export type FormVideoType = keyof typeof VIDEO_TYPES;
const EXTENSION_TYPES: Record<string, FormVideoType> = { mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", qt: "video/quicktime", webm: "video/webm" };

export type FormReviewStatus = "awaiting_review" | "reviewed";

export function formVideoType(file: { type: string; name: string }): FormVideoType | null {
  if (file.type in VIDEO_TYPES) return file.type as FormVideoType;
  if (file.type && file.type !== "application/octet-stream") return null;
  return EXTENSION_TYPES[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}

export function formVideoExtension(type: FormVideoType) {
  return VIDEO_TYPES[type];
}

export function formVideoTypeForPath(path: string): FormVideoType | null {
  const extension = path.split(".").pop();
  return (Object.entries(VIDEO_TYPES).find(([, ext]) => ext === extension)?.[0] as FormVideoType | undefined) ?? null;
}

export function formVideoFileError(file: { type: string; name: string; size: number }): string | null {
  if (!formVideoType(file)) return "Choose an MP4, MOV or WebM video.";
  if (file.size <= 0) return "This video is empty. Try recording again.";
  if (file.size > FORM_VIDEO_MAX_BYTES) return "Videos must be 100 MB or smaller. Trim the clip or record a shorter one.";
  return null;
}

export function formVideoDurationError(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return "This video couldn't be read. Try another clip.";
  if (seconds > FORM_VIDEO_MAX_SECONDS) return "Videos must be 60 seconds or shorter. Trim the clip and try again.";
  return null;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export function formVideoPath(coachId: string, athleteId: string, id: string, type: FormVideoType) {
  return `${coachId}/${athleteId}/${id}.${formVideoExtension(type)}`;
}

export function isFormVideoPath(path: string, coachId: string, athleteId: string) {
  return new RegExp(`^${coachId}/${athleteId}/${UUID}\\.(mp4|mov|webm)$`).test(path);
}

export function clampTime(seconds: number, duration: number) {
  if (!Number.isFinite(seconds)) return 0;
  const max = Number.isFinite(duration) && duration > 0 ? duration : seconds;
  return Math.min(Math.max(0, seconds), Math.max(0, max));
}

export function stepFrame(current: number, direction: 1 | -1, duration: number) {
  return clampTime(Math.round((current + direction * FRAME_SECONDS) * 1000) / 1000, duration);
}

export function formatTimestamp(seconds: number) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const whole = Math.floor(safe);
  const tenths = Math.floor((safe - whole) * 10 + 1e-6);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}.${tenths}`;
}

export function markerPercent(seconds: number, duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(100, Math.max(0, (seconds / duration) * 100));
}

export type FormCommentLike = { id: string; parent_id: string | null; at_seconds: number | null; created_at: string };

export function threadComments<T extends FormCommentLike>(comments: T[]) {
  const replies = new Map<string, T[]>();
  for (const comment of comments) {
    if (comment.parent_id) replies.set(comment.parent_id, [...(replies.get(comment.parent_id) ?? []), comment]);
  }
  return comments
    .filter((comment) => !comment.parent_id)
    .sort((a, b) => (a.at_seconds ?? 0) - (b.at_seconds ?? 0) || a.created_at.localeCompare(b.created_at))
    .map((comment) => ({ ...comment, replies: (replies.get(comment.id) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at)) }));
}

export function sortReviewQueue<T extends { status: FormReviewStatus; created_at: string }>(reviews: T[]) {
  return [...reviews].sort((a, b) => {
    if (a.status !== b.status) return a.status === "awaiting_review" ? -1 : 1;
    return a.status === "awaiting_review" ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at);
  });
}

export function formReviewLabel(review: { movement?: { name: string } | null; result?: { workouts?: { title: string } | null } | null; set_label?: string | null; question?: string | null }) {
  const subject = review.movement?.name ?? review.result?.workouts?.title ?? "Form check";
  return review.set_label ? `${subject} · ${review.set_label}` : subject;
}
