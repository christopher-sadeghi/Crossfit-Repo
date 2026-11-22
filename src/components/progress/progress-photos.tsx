"use client";

import { Camera, ImagePlus, LockKeyhole, Upload } from "lucide-react";
import Image from "next/image";
import { useId, useState } from "react";

import { deleteProgressPhoto, saveProgressPhoto } from "@/app/progress-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PHOTO_POSES, PROGRESS_PHOTO_BUCKET, checkInDates, type Measurement, type ProgressPhoto } from "@/lib/measurements";
import { prepareProgressPhoto } from "@/lib/progress-photo-upload";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/units";

import { ActionFeedback, useProgressAction } from "./action-feedback";

function Photo({ photo, pose, date }: { photo?: ProgressPhoto; pose: string; date: string }) {
  const [failed, setFailed] = useState(false);
  return <div className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
    {photo?.url && !failed ? <Image src={photo.url} alt={`${pose} progress photo, ${formatDate(date)}`} fill unoptimized sizes="(max-width: 640px) 40vw, 300px" className="object-contain" onError={() => setFailed(true)} />
      : <div className="grid justify-items-center gap-2 p-3 text-center text-xs text-muted-foreground"><ImagePlus className="size-5" /><span>{photo ? "Photo unavailable. Try refreshing, or upload a replacement." : "No photo for this date"}</span></div>}
  </div>;
}

export function ProgressPhotos({ athleteId, coachId, today, photos, measurements }: {
  athleteId: string; coachId: string; today: string; photos: ProgressPhoto[]; measurements: Measurement[];
}) {
  const [uploadDate, setUploadDate] = useState(today);
  const [selectedFirst, setSelectedFirst] = useState("");
  const [selectedSecond, setSelectedSecond] = useState("");
  const [target, setTarget] = useState<"first" | "second">("second");
  const { result, pending, run } = useProgressAction();
  const inputId = useId();
  const dates = checkInDates(measurements, photos);
  const first = selectedFirst || dates[0] || today;
  const second = selectedSecond || dates.at(-1) || today;
  const find = (date: string, pose: string) => photos.find((photo) => photo.taken_on === date && photo.pose === pose);

  function upload(file: File | undefined, pose: string) {
    if (!file) return;
    if (!uploadDate || uploadDate > today) { run(async () => ({ error: "Choose today or an earlier date." })); return; }
    if (find(uploadDate, pose) && !confirm(`Replace the ${pose} photo for ${formatDate(uploadDate)}?`)) return;
    run(async () => {
      let path: string | null = null;
      let saving = false;
      const bucket = createClient().storage.from(PROGRESS_PHOTO_BUCKET);
      try {
        const jpeg = await prepareProgressPhoto(file);
        path = `${coachId}/${athleteId}/${crypto.randomUUID()}.jpg`;
        const { error } = await bucket.upload(path, jpeg, { contentType: "image/jpeg", upsert: false });
        if (error) throw new Error("Couldn't upload the photo. Check your connection and try again.");
        saving = true;
        const saved = await saveProgressPhoto(athleteId, uploadDate, pose, path);
        if (!saved.saved) {
          const { error: cleanupError } = await bucket.remove([path]);
          if (cleanupError) return { error: `${saved.error} The uploaded file also couldn't be removed; please contact your coach.` };
        }
        return saved;
      } catch (error) {
        if (saving) return { error: "Couldn't confirm whether your photo was saved. Refresh before trying again; the uploaded file has been kept safe." };
        let cleanupFailed = false;
        if (path) cleanupFailed = !!(await bucket.remove([path])).error;
        return { error: `${error instanceof Error ? error.message : "Couldn't upload this image."}${cleanupFailed ? " The uploaded file couldn't be removed; please contact your coach." : ""}` };
      }
    });
  }

  function remove(photo: ProgressPhoto) {
    if (confirm("Permanently delete this progress photo and its file?")) run(() => deleteProgressPhoto(athleteId, photo.id));
  }

  return <Card className="min-w-0">
    <CardHeader>
      <div className="flex items-center gap-2"><Camera className="size-5" /><CardTitle>Progress photos</CardTitle></div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><LockKeyhole className="size-3.5 shrink-0" />Private · only you and your coach can view these.</p>
    </CardHeader>
    <CardContent className="space-y-6">
      <div className="space-y-3">
        <label className="grid max-w-xs gap-1.5 text-sm font-medium">Photo date<input aria-label="Photo date" type="date" required max={today} value={uploadDate} onChange={(event) => setUploadDate(event.target.value)} className="h-10 min-w-0 rounded-md border bg-background px-3" /></label>
        <p className="text-xs text-muted-foreground">Use similar light, distance and clothing for each check-in. Photos are resized privately on your device.</p>
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          {PHOTO_POSES.map((pose) => {
            const photo = find(uploadDate, pose);
            return <div key={pose} className="min-w-0 space-y-2">
              <p className="text-center text-sm font-medium capitalize">{pose}</p>
              <Photo key={photo?.url ?? photo?.id ?? "empty"} photo={photo} pose={pose} date={uploadDate} />
              <label className={`flex min-h-10 cursor-pointer items-center justify-center gap-1 rounded-md border bg-background px-1 text-xs font-medium hover:bg-muted focus-within:ring-2 focus-within:ring-ring ${pending ? "pointer-events-none opacity-50" : ""}`}>
                <Upload className="size-3.5 shrink-0" />{photo ? "Replace" : "Upload"}
                <input id={`${inputId}-${pose}`} aria-label={`Upload ${pose} photo`} type="file" accept="image/*,.heic,.heif" disabled={pending} className="sr-only" onChange={(event) => { upload(event.target.files?.[0], pose); event.target.value = ""; }} />
              </label>
              <label className={`flex min-h-10 cursor-pointer items-center justify-center gap-1 rounded-md border px-1 text-xs hover:bg-muted focus-within:ring-2 focus-within:ring-ring ${pending ? "pointer-events-none opacity-50" : ""}`}>
                <Camera className="size-3.5 shrink-0" />Camera
                <input aria-label={`Take ${pose} photo`} type="file" accept="image/*" capture="environment" disabled={pending} className="sr-only" onChange={(event) => { upload(event.target.files?.[0], pose); event.target.value = ""; }} />
              </label>
              {photo && <button type="button" disabled={pending} className="min-h-10 w-full text-xs text-destructive disabled:opacity-50" onClick={() => remove(photo)} aria-label={`Delete ${pose} photo on ${uploadDate}`}>Delete</button>}
            </div>;
          })}
        </div>
        {pending && <p role="status" className="text-sm text-muted-foreground">Preparing and saving your photo…</p>}
        <ActionFeedback result={result} />
      </div>

      <section aria-label="Compare progress photos" className="space-y-4 border-t pt-5">
        <div><h3 className="font-semibold">See your progress</h3><p className="mt-1 text-sm text-muted-foreground">Compare two check-ins, one pose at a time.</p></div>
        {dates.length === 0 ? <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">Your timeline starts with your first photo or measurement. No pressure — start when you&apos;re ready.</p> : <>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid min-w-0 gap-1.5 text-xs font-medium">Earlier check-in<input type="date" aria-label="Earlier check-in" max={today} value={first} onFocus={() => setTarget("first")} onChange={(event) => setSelectedFirst(event.target.value)} className="h-10 min-w-0 w-full rounded-md border bg-background px-2 text-sm" /></label>
            <label className="grid min-w-0 gap-1.5 text-xs font-medium">Later check-in<input type="date" aria-label="Later check-in" max={today} value={second} onFocus={() => setTarget("second")} onChange={(event) => setSelectedSecond(event.target.value)} className="h-10 min-w-0 w-full rounded-md border bg-background px-2 text-sm" /></label>
          </div>
          <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <legend className="mb-2 font-medium">Timeline · choose a date for</legend>
            <label className="flex min-h-8 items-center gap-1.5"><input type="radio" name={inputId} checked={target === "first"} onChange={() => setTarget("first")} />Earlier check-in</label>
            <label className="flex min-h-8 items-center gap-1.5"><input type="radio" name={inputId} checked={target === "second"} onChange={() => setTarget("second")} />Later check-in</label>
          </fieldset>
          <div className="flex gap-2 overflow-x-auto pb-2" aria-label="Check-in timeline">
            {dates.map((date) => <button type="button" key={date} onClick={() => target === "first" ? setSelectedFirst(date) : setSelectedSecond(date)} aria-pressed={(target === "first" ? first : second) === date} className={`min-h-11 shrink-0 rounded-lg border px-3 text-left text-xs ${first === date || second === date ? "border-primary bg-primary/5" : "bg-background"}`}>
              <span className="block font-medium">{formatDate(date)}</span><span className="text-[10px] text-muted-foreground">{photos.some((photo) => photo.taken_on === date) ? "Photos" : ""}{photos.some((photo) => photo.taken_on === date) && measurements.some((row) => row.measured_on === date) ? " + " : ""}{measurements.some((row) => row.measured_on === date) ? "Measurements" : ""}</span>
            </button>)}
          </div>
          {dates.length === 1 && <p className="text-xs text-muted-foreground">One check-in so far. Add another date to compare your progress.</p>}
          {PHOTO_POSES.map((pose) => <div key={pose} className="space-y-2">
            <h4 className="text-sm font-medium capitalize">{pose}</h4>
            <div className="grid grid-cols-2 gap-3">
              {[first, second].map((date, index) => {
                const photo = find(date, pose);
                return <div key={index} className="min-w-0 space-y-1.5">
                  <Photo key={`${date}-${photo?.url ?? photo?.id}`} photo={photo} pose={pose} date={date} />
                  <p className="text-center text-xs text-muted-foreground">{formatDate(date)}</p>
                  {photo && <Button variant="ghost" size="sm" className="w-full text-xs text-destructive" disabled={pending} onClick={() => remove(photo)} aria-label={`Delete compared ${pose} photo on ${date}`}>Delete photo</Button>}
                </div>;
              })}
            </div>
          </div>)}
        </>}
      </section>
    </CardContent>
  </Card>;
}
