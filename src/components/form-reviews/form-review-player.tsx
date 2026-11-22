"use client";

import { ChevronLeft, ChevronRight, MessageSquarePlus, Pause, Play, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  addFormComment, deleteFormComment, deleteFormReview, markFormReviewed, replyToFormComment, type FormReviewResult,
} from "@/app/form-review-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FORM_COMMENT_MAX, FORM_CUE_MAX, PLAYBACK_RATES, clampTime, formatTimestamp, markerPercent, stepFrame } from "@/lib/form-reviews";
import type { LoadedFormReview } from "@/lib/form-review-data";

type Thread = LoadedFormReview["comments"][number];

export function FormReviewPlayer({ data, role, userId, backHref }: {
  data: LoadedFormReview; role: "coach" | "athlete"; userId: string; backHref: string;
}) {
  const { review, comments, cue, videoUrl } = data;
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(review.duration_seconds);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [draftAt, setDraftAt] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [cueDraft, setCueDraft] = useState(cue ?? "");
  const [active, setActive] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [result, setResult] = useState<FormReviewResult>({});
  const [pending, startTransition] = useTransition();

  useEffect(() => { if (video.current) video.current.playbackRate = rate; }, [rate]);

  function run(work: () => Promise<FormReviewResult>, after?: () => void) {
    setResult({});
    startTransition(async () => {
      try {
        const next = await work();
        setResult(next);
        if (!next.error) { after?.(); router.refresh(); }
      } catch { setResult({ error: "Couldn't complete this request. Check your connection and try again." }); }
    });
  }

  function seek(seconds: number) {
    const element = video.current;
    if (!element) return;
    element.currentTime = clampTime(seconds, duration);
    setTime(element.currentTime);
  }

  function jump(comment: Thread) {
    video.current?.pause();
    seek(comment.at_seconds ?? 0);
    setActive(comment.id);
    document.getElementById(`comment-${comment.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function frame(direction: 1 | -1) {
    video.current?.pause();
    seek(stepFrame(video.current?.currentTime ?? time, direction, duration));
  }

  function toggle() {
    const element = video.current;
    if (!element) return;
    if (element.paused) void element.play().catch(() => setResult({ error: "Tap play again to start the video." }));
    else element.pause();
  }

  function commentHere() {
    video.current?.pause();
    setDraftAt(video.current?.currentTime ?? time);
    setDraft("");
  }

  const pinned = comments.filter((comment) => comment.at_seconds !== null);
  const cueUnchanged = !cueDraft.trim() || cueDraft.trim() === (cue ?? "");

  return <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
    <div className="grid min-w-0 content-start gap-3">
      <div className="overflow-hidden rounded-lg bg-black">
        {videoUrl && !failed ? <video
          ref={video} src={videoUrl} playsInline preload="metadata" aria-label="Form check video"
          className="mx-auto max-h-[70vh] w-full object-contain" onClick={toggle}
          onLoadedMetadata={(event) => { const d = event.currentTarget.duration; if (Number.isFinite(d) && d > 0) setDuration(d); event.currentTarget.playbackRate = rate; }}
          onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
          onSeeked={(event) => setTime(event.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
          onError={() => setFailed(true)}
        /> : <p className="p-10 text-center text-sm text-white/80">This video couldn&apos;t be loaded. Refresh the page to try again.</p>}
      </div>

      <div className="grid gap-2">
        <div className="relative h-8">
          <input
            type="range" aria-label="Video position" min={0} max={duration || 0} step={0.01} value={Math.min(time, duration)}
            onChange={(event) => seek(Number(event.target.value))} className="absolute inset-x-0 top-1/2 w-full -translate-y-1/2 accent-primary"
          />
          {pinned.map((comment, index) => <button
            key={comment.id} type="button" onClick={() => jump(comment)} data-testid="comment-marker"
            aria-label={`Jump to comment ${index + 1} at ${formatTimestamp(comment.at_seconds ?? 0)}`}
            style={{ left: `${markerPercent(comment.at_seconds ?? 0, duration)}%` }}
            className={`absolute top-0 z-10 flex size-5 -translate-x-1/2 items-center justify-center rounded-full border-2 border-background text-[10px] font-bold text-white shadow ${active === comment.id ? "bg-primary ring-2 ring-primary/40" : "bg-amber-500"}`}
          >{index + 1}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={toggle} disabled={!videoUrl || failed}>
            {playing ? <Pause /> : <Play />}{playing ? "Pause" : "Play"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => frame(-1)} aria-label="Back one frame"><ChevronLeft />Frame</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => frame(1)} aria-label="Forward one frame">Frame<ChevronRight /></Button>
          <div role="group" aria-label="Playback speed" className="flex rounded-md border">
            {PLAYBACK_RATES.map((option) => <button
              key={option} type="button" aria-pressed={rate === option} onClick={() => setRate(option)}
              className={`min-h-8 px-2.5 text-xs font-medium first:rounded-l-md last:rounded-r-md ${rate === option ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >{option}×</button>)}
          </div>
          <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground" data-testid="video-time">{formatTimestamp(time)} / {formatTimestamp(duration)}</span>
        </div>
        {role === "coach" && (draftAt === null
          ? <Button type="button" variant="secondary" className="w-full sm:w-fit" onClick={commentHere} disabled={pending || !videoUrl || failed}>
            <MessageSquarePlus />Comment here ({formatTimestamp(time)})
          </Button>
          : <form className="grid gap-2 rounded-lg border p-3" onSubmit={(event) => {
            event.preventDefault();
            const at = draftAt;
            run(() => addFormComment(review.id, at, draft), () => { setDraftAt(null); setDraft(""); });
          }}>
            <label className="text-sm font-medium" htmlFor="form-comment">Comment at {formatTimestamp(draftAt)}</label>
            <Textarea id="form-comment" autoFocus required maxLength={FORM_COMMENT_MAX} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="e.g. Hips rise before the chest. Keep your back angle as you leave the floor." />
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={pending || !draft.trim()}>Pin comment</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setDraftAt(null)}>Cancel</Button>
              <span className="ml-auto text-xs text-muted-foreground">{draft.length}/{FORM_COMMENT_MAX}</span>
            </div>
          </form>)}
      </div>
      <div aria-live="polite">
        {result.error && <p role="alert" className="text-sm text-destructive">{result.error}</p>}
        {result.message && <p className="text-sm text-emerald-700 dark:text-emerald-400">{result.message}</p>}
      </div>
    </div>

    <aside className="grid min-w-0 content-start gap-4">
      <div className="grid gap-2">
        <Badge className="w-fit" variant={review.status === "reviewed" ? "default" : "outline"}>{review.status === "reviewed" ? "Reviewed" : "Awaiting review"}</Badge>
        {review.question && <p className="whitespace-pre-line rounded-md bg-muted/50 p-3 text-sm"><span className="font-medium">Question: </span>{review.question}</p>}
      </div>
      {cue && role === "athlete" && <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
        <p className="font-medium">Your cue for {review.movement?.name ?? "this movement"}</p>
        <p className="mt-1 whitespace-pre-line">{cue}</p>
      </div>}

      <section aria-label="Coach comments" className="grid gap-2">
        <h2 className="text-sm font-semibold">Comments ({pinned.length})</h2>
        {!pinned.length && <p className="text-sm text-muted-foreground">{role === "coach" ? "Pause the video and tap \u201cComment here\u201d to pin feedback at that moment." : "Your coach hasn\u2019t left comments yet."}</p>}
        {pinned.map((comment, index) => <CommentCard
          key={comment.id} comment={comment} index={index} active={active === comment.id} role={role} userId={userId} pending={pending}
          onJump={() => jump(comment)}
          onReply={(body, done) => run(() => replyToFormComment(review.id, comment.id, body), done)}
          onDelete={(id) => { if (confirm("Delete this comment?")) run(() => deleteFormComment(review.id, id)); }}
        />)}
      </section>

      {role === "coach" && <section aria-label="Finish review" className="grid gap-2 rounded-lg border p-3">
        {review.movement_id && <>
          <label htmlFor="movement-cue" className="text-sm font-medium">Cue for {review.movement?.name ?? "this movement"} (optional)</label>
          <Textarea id="movement-cue" maxLength={FORM_CUE_MAX} value={cueDraft} onChange={(event) => setCueDraft(event.target.value)} placeholder="A short reminder this athlete sees on every video of this movement" />
        </>}
        <Button type="button" disabled={pending || (review.status === "reviewed" && cueUnchanged)} onClick={() => run(() => markFormReviewed(review.id, cueDraft))}>
          {review.status === "reviewed" ? "Save cue" : "Mark reviewed"}
        </Button>
      </section>}

      <Button type="button" variant="ghost" className="w-fit text-destructive" disabled={pending} onClick={() => {
        if (confirm("Permanently delete this video, its file and all comments?")) run(() => deleteFormReview(review.id), () => router.push(backHref));
      }}><Trash2 />Delete video</Button>
    </aside>
  </div>;
}

function CommentCard({ comment, index, active, role, userId, pending, onJump, onReply, onDelete }: {
  comment: Thread; index: number; active: boolean; role: "coach" | "athlete"; userId: string; pending: boolean;
  onJump: () => void; onReply: (body: string, done: () => void) => void; onDelete: (id: string) => void;
}) {
  const [reply, setReply] = useState("");
  const [open, setOpen] = useState(false);
  return <article id={`comment-${comment.id}`} className={`grid gap-2 rounded-lg border p-3 text-sm ${active ? "border-primary bg-primary/5" : ""}`}>
    <div className="flex items-center gap-2">
      <button type="button" onClick={onJump} className="rounded bg-amber-500 px-1.5 py-0.5 font-mono text-xs font-semibold text-white hover:bg-amber-600" aria-label={`Jump to ${formatTimestamp(comment.at_seconds ?? 0)}`}>
        {index + 1} · {formatTimestamp(comment.at_seconds ?? 0)}
      </button>
      {role === "coach" && <button type="button" disabled={pending} onClick={() => onDelete(comment.id)} className="ml-auto text-muted-foreground hover:text-destructive" aria-label="Delete comment"><Trash2 className="size-4" /></button>}
    </div>
    <p className="whitespace-pre-line">{comment.body}</p>
    {comment.replies.map((item) => <div key={item.id} className="ml-3 flex gap-2 border-l-2 pl-3 text-muted-foreground">
      <p className="min-w-0 flex-1 whitespace-pre-line"><span className="font-medium text-foreground">{item.author_id === userId ? "You" : role === "coach" ? "Athlete" : "Coach"}: </span>{item.body}</p>
      {(role === "coach" || item.author_id === userId) && <button type="button" disabled={pending} onClick={() => onDelete(item.id)} className="shrink-0 hover:text-destructive" aria-label="Delete reply"><Trash2 className="size-3.5" /></button>}
    </div>)}
    {role === "athlete" && (open
      ? <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); onReply(reply, () => { setReply(""); setOpen(false); }); }}>
        <Textarea aria-label="Reply to coach" required maxLength={FORM_COMMENT_MAX} value={reply} onChange={(event) => setReply(event.target.value)} />
        <div className="flex gap-2"><Button type="submit" size="sm" disabled={pending || !reply.trim()}>Send reply</Button><Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
      </form>
      : <button type="button" onClick={() => setOpen(true)} className="w-fit text-xs font-medium text-primary hover:underline">Reply</button>)}
  </article>;
}
