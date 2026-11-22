import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FORM_VIDEO_MAX_BYTES, clampTime, formReviewLabel, formVideoDurationError, formVideoFileError, formVideoPath, formVideoType,
  formVideoTypeForPath, formatTimestamp, isFormVideoPath, markerPercent, sortReviewQueue, stepFrame, threadComments,
} from "./form-reviews";

const coach = "11111111-1111-4111-8111-111111111111";
const athlete = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333";

test("video type detection, file and duration limits", () => {
  assert.equal(formVideoType({ type: "video/quicktime", name: "a.mov" }), "video/quicktime");
  assert.equal(formVideoType({ type: "", name: "IMG_1.MOV" }), "video/quicktime");
  assert.equal(formVideoType({ type: "application/octet-stream", name: "clip.webm" }), "video/webm");
  assert.equal(formVideoType({ type: "video/x-msvideo", name: "a.avi" }), null);
  assert.equal(formVideoType({ type: "image/jpeg", name: "a.mp4" }), null);
  assert.equal(formVideoFileError({ type: "video/mp4", name: "a.mp4", size: FORM_VIDEO_MAX_BYTES }), null);
  assert.match(formVideoFileError({ type: "video/mp4", name: "a.mp4", size: FORM_VIDEO_MAX_BYTES + 1 }) ?? "", /100 MB/);
  assert.match(formVideoFileError({ type: "video/mp4", name: "a.mp4", size: 0 }) ?? "", /empty/);
  assert.match(formVideoFileError({ type: "text/plain", name: "a.txt", size: 10 }) ?? "", /MP4, MOV or WebM/);
  assert.equal(formVideoDurationError(60), null);
  assert.equal(formVideoDurationError(12.4), null);
  assert.match(formVideoDurationError(60.01) ?? "", /60 seconds/);
  assert.match(formVideoDurationError(Number.NaN) ?? "", /couldn't be read/);
  assert.match(formVideoDurationError(Infinity) ?? "", /couldn't be read/);
});

test("storage paths are scoped to coach and athlete folders", () => {
  const path = formVideoPath(coach, athlete, id, "video/quicktime");
  assert.equal(path, `${coach}/${athlete}/${id}.mov`);
  assert.equal(isFormVideoPath(path, coach, athlete), true);
  assert.equal(isFormVideoPath(path, athlete, coach), false);
  assert.equal(isFormVideoPath(`${coach}/${athlete}/../${id}.mov`, coach, athlete), false);
  assert.equal(isFormVideoPath(`${coach}/${athlete}/${id}.exe`, coach, athlete), false);
  assert.equal(formVideoTypeForPath(path), "video/quicktime");
  assert.equal(formVideoTypeForPath(`${coach}/${athlete}/${id}.webm`), "video/webm");
  assert.equal(formVideoTypeForPath("x.avi"), null);
});

test("time helpers clamp, frame-step, format and place markers", () => {
  assert.equal(clampTime(-2, 30), 0);
  assert.equal(clampTime(45, 30), 30);
  assert.equal(clampTime(Number.NaN, 30), 0);
  assert.equal(clampTime(5, Number.NaN), 5);
  assert.equal(stepFrame(1, 1, 30), 1.033);
  assert.equal(stepFrame(1, -1, 30), 0.967);
  assert.equal(stepFrame(0, -1, 30), 0);
  assert.equal(stepFrame(30, 1, 30), 30);
  assert.equal(formatTimestamp(0), "0:00.0");
  assert.equal(formatTimestamp(4.37), "0:04.3");
  assert.equal(formatTimestamp(60), "1:00.0");
  assert.equal(formatTimestamp(-1), "0:00.0");
  assert.equal(markerPercent(15, 60), 25);
  assert.equal(markerPercent(80, 60), 100);
  assert.equal(markerPercent(5, 0), 0);
});

test("comments thread under pinned timestamps in time order", () => {
  const rows = [
    { id: "c2", parent_id: null, at_seconds: 20, created_at: "2026-11-21T10:00:00Z" },
    { id: "r1", parent_id: "c1", at_seconds: null, created_at: "2026-11-21T12:00:00Z" },
    { id: "c1", parent_id: null, at_seconds: 5, created_at: "2026-11-21T11:00:00Z" },
    { id: "r0", parent_id: "c1", at_seconds: null, created_at: "2026-11-21T11:30:00Z" },
  ];
  const threads = threadComments(rows);
  assert.deepEqual(threads.map((thread) => thread.id), ["c1", "c2"]);
  assert.deepEqual(threads[0].replies.map((reply) => reply.id), ["r0", "r1"]);
  assert.deepEqual(threads[1].replies, []);
});

test("queue puts oldest unreviewed first, then newest reviewed", () => {
  const sorted = sortReviewQueue([
    { id: "r-old", status: "reviewed" as const, created_at: "2026-11-01" },
    { id: "a-new", status: "awaiting_review" as const, created_at: "2026-11-20" },
    { id: "r-new", status: "reviewed" as const, created_at: "2026-11-19" },
    { id: "a-old", status: "awaiting_review" as const, created_at: "2026-11-10" },
  ]);
  assert.deepEqual(sorted.map((review) => review.id), ["a-old", "a-new", "r-new", "r-old"]);
});

test("labels prefer movement, then workout, with set label", () => {
  assert.equal(formReviewLabel({ movement: { name: "Back squat" }, set_label: "Set 3" }), "Back squat · Set 3");
  assert.equal(formReviewLabel({ result: { workouts: { title: "Fran" } } }), "Fran");
  assert.equal(formReviewLabel({ question: "Is my bar path ok?" }), "Form check");
});
