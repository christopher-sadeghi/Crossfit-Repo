"use client";

import { Camera, LockKeyhole, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";

import { saveFormReview, type FormReviewResult } from "@/app/form-review-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  FORM_QUESTION_MAX, FORM_SET_LABEL_MAX, FORM_VIDEO_BUCKET, formVideoDurationError, formVideoFileError, formVideoPath, formVideoType,
} from "@/lib/form-reviews";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/units";

type Mode = "result" | "movement" | "question";
export type UploadResultOption = { id: string; performed_on: string; title: string };
export type UploadMovementOption = { id: string; name: string };

function readDuration(file: File) {
  return new Promise<number>((resolve) => {
    const url = URL.createObjectURL(file);
    const element = document.createElement("video");
    const done = (value: number) => { URL.revokeObjectURL(url); element.removeAttribute("src"); resolve(value); };
    const timer = window.setTimeout(() => done(Number.NaN), 15000);
    element.preload = "metadata";
    element.muted = true;
    element.onloadedmetadata = () => { window.clearTimeout(timer); done(element.duration); };
    element.onerror = () => { window.clearTimeout(timer); done(Number.NaN); };
    element.src = url;
  });
}

const selectClass = "h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm";

export function FormVideoUpload({ athleteId, coachId, today, results, movements, defaultResultId }: {
  athleteId: string; coachId: string; today: string; results: UploadResultOption[]; movements: UploadMovementOption[]; defaultResultId?: string;
}) {
  const router = useRouter();
  const id = useId();
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const initialResult = defaultResultId && results.some((result) => result.id === defaultResultId) ? defaultResultId : "";
  const [mode, setMode] = useState<Mode>(initialResult ? "result" : results.length ? "result" : "movement");
  const [file, setFile] = useState<{ file: File; duration: number } | null>(null);
  const [resultId, setResultId] = useState(initialResult);
  const [movementId, setMovementId] = useState("");
  const [setLabel, setSetLabel] = useState("");
  const [question, setQuestion] = useState("");
  const [recordedOn, setRecordedOn] = useState(today);
  const [status, setStatus] = useState<FormReviewResult & { busy?: string }>({});
  const [pending, startTransition] = useTransition();

  async function pick(picked: File | undefined) {
    if (camera.current) camera.current.value = "";
    if (gallery.current) gallery.current.value = "";
    if (!picked) return;
    setFile(null);
    const fileError = formVideoFileError(picked);
    if (fileError) { setStatus({ error: fileError }); return; }
    setStatus({ busy: "Checking video…" });
    const duration = await readDuration(picked);
    const durationError = formVideoDurationError(duration);
    if (durationError) { setStatus({ error: durationError }); return; }
    setFile({ file: picked, duration });
    setStatus({});
  }

  function submit() {
    if (!file) { setStatus({ error: "Record or choose a video first." }); return; }
    if (!recordedOn || recordedOn > today) { setStatus({ error: "Choose today or an earlier date." }); return; }
    if (mode === "result" && !resultId) { setStatus({ error: "Choose the workout result this video is from." }); return; }
    if (mode === "movement" && !movementId) { setStatus({ error: "Choose the movement in this video." }); return; }
    if (mode === "question" && !question.trim()) { setStatus({ error: "Write the question you'd like your coach to answer." }); return; }
    const type = formVideoType(file.file)!;
    startTransition(async () => {
      setStatus({ busy: "Uploading video… keep this page open." });
      const bucket = createClient().storage.from(FORM_VIDEO_BUCKET);
      const path = formVideoPath(coachId, athleteId, crypto.randomUUID(), type);
      let saving = false;
      try {
        const { error } = await bucket.upload(path, file.file, { contentType: type, upsert: false });
        if (error) throw new Error("Couldn't upload the video. Check your connection and try again.");
        saving = true;
        setStatus({ busy: "Sending to your coach…" });
        const saved = await saveFormReview({
          path, sizeBytes: file.file.size, durationSeconds: file.duration, recordedOn,
          resultId: mode === "result" ? resultId : null,
          movementId: mode === "movement" ? movementId : null,
          setLabel: mode === "movement" ? setLabel : "",
          question,
        });
        if (!saved.saved || !saved.id) {
          const { error: cleanupError } = await bucket.remove([path]);
          setStatus({ error: `${saved.error ?? "Couldn't save your form check."}${cleanupError ? " The uploaded file also couldn't be removed; please contact your coach." : ""}` });
          return;
        }
        router.push(`/athlete/form-checks/${saved.id}`);
      } catch (error) {
        if (saving) { setStatus({ error: "Couldn't confirm whether your video was sent. Refresh the page before trying again." }); return; }
        const cleanupFailed = !!(await bucket.remove([path]).catch(() => ({ error: true }))).error;
        setStatus({ error: `${error instanceof Error ? error.message : "Couldn't upload the video."}${cleanupFailed ? " The uploaded file couldn't be removed; please contact your coach." : ""}` });
      }
    });
  }

  const modes: { value: Mode; label: string; disabled?: boolean }[] = [
    { value: "result", label: "A logged workout", disabled: !results.length },
    { value: "movement", label: "A movement / set", disabled: !movements.length },
    { value: "question", label: "Just a question" },
  ];
  const busy = pending || !!status.busy;

  return <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); submit(); }}>
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><LockKeyhole className="size-3.5 shrink-0" />Private · only you and your coach can watch. Up to 60 seconds and 100 MB.</p>
    <div className="grid gap-2 sm:grid-cols-2">
      <Button type="button" size="lg" onClick={() => camera.current?.click()} disabled={busy}><Camera />Record video</Button>
      <Button type="button" size="lg" variant="outline" onClick={() => gallery.current?.click()} disabled={busy}><Upload />Choose from gallery</Button>
      <input ref={camera} type="file" accept="video/*" capture="environment" className="sr-only" tabIndex={-1} aria-label="Record video" onChange={(event) => void pick(event.target.files?.[0])} />
      <input ref={gallery} type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" className="sr-only" tabIndex={-1} aria-label="Choose video file" data-testid="form-video-file" onChange={(event) => void pick(event.target.files?.[0])} />
    </div>
    {file && <p className="rounded-md bg-muted/50 p-3 text-sm">Ready: <span className="font-medium">{file.file.name}</span> · {Math.round(file.duration)} s · {(file.file.size / 1024 / 1024).toFixed(1)} MB</p>}

    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">What is this video for?</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {modes.map((option) => <label key={option.value} className={`flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm ${mode === option.value ? "border-primary bg-primary/5" : ""} ${option.disabled ? "opacity-50" : "cursor-pointer"}`}>
          <input type="radio" name={`${id}-mode`} value={option.value} checked={mode === option.value} disabled={option.disabled} onChange={() => setMode(option.value)} />{option.label}
        </label>)}
      </div>
    </fieldset>

    {mode === "result" && <label className="grid gap-1.5 text-sm font-medium">Workout result
      <select value={resultId} onChange={(event) => setResultId(event.target.value)} className={selectClass}>
        <option value="">Choose a result</option>
        {results.map((result) => <option key={result.id} value={result.id}>{formatDate(result.performed_on)} · {result.title}</option>)}
      </select>
    </label>}
    {mode === "movement" && <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1.5 text-sm font-medium">Movement
        <select value={movementId} onChange={(event) => setMovementId(event.target.value)} className={selectClass}>
          <option value="">Choose a movement</option>
          {movements.map((movement) => <option key={movement.id} value={movement.id}>{movement.name}</option>)}
        </select>
      </label>
      <label className="grid gap-1.5 text-sm font-medium">Set (optional)
        <input value={setLabel} maxLength={FORM_SET_LABEL_MAX} onChange={(event) => setSetLabel(event.target.value)} placeholder="e.g. Set 3 · 225 lb × 5" className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm font-normal" />
      </label>
    </div>}
    <label className="grid gap-1.5 text-sm font-medium">{mode === "question" ? "Your question" : "Question or note for your coach (optional)"}
      <Textarea value={question} maxLength={FORM_QUESTION_MAX} onChange={(event) => setQuestion(event.target.value)} placeholder="e.g. My lower back feels it at the bottom. Am I losing position?" className="font-normal" />
    </label>
    <label className="grid max-w-xs gap-1.5 text-sm font-medium">Date recorded
      <input type="date" required max={today} value={recordedOn} onChange={(event) => setRecordedOn(event.target.value)} className="h-10 min-w-0 rounded-md border bg-background px-3 font-normal" />
    </label>

    <div aria-live="polite" className="text-sm">
      {status.busy && <p className="text-muted-foreground">{status.busy}</p>}
      {status.error && <p role="alert" className="text-destructive">{status.error}</p>}
    </div>
    <Button type="submit" size="lg" className="w-full sm:w-fit" disabled={busy || !file}>Send to coach</Button>
  </form>;
}
