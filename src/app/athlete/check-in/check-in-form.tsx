"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { CHECK_IN_SCALES, SORENESS_AREAS, readinessLabel, type CheckIn } from "@/lib/check-in";
import type { FormState } from "@/lib/auth/form-state";
import { saveCheckIn } from "./actions";

export function CheckInForm({ entry }: { entry: CheckIn | null }) {
  const [editing, setEditing] = useState(false);
  const [hours, setHours] = useState(entry?.sleep_hours == null ? "" : String(entry.sleep_hours));
  const [ratings, setRatings] = useState(() => Object.fromEntries(Object.keys(CHECK_IN_SCALES).map((key) => [key, entry?.[key as keyof typeof CHECK_IN_SCALES] ?? null])));
  const [areas, setAreas] = useState(entry?.soreness_areas ?? []);
  const [note, setNote] = useState(entry?.notes ?? "");
  const [state, action, pending] = useActionState<FormState, FormData>(async (previous, data) => {
    const result = await saveCheckIn(previous, data);
    if (!result.error) setEditing(false);
    return result;
  }, {});
  const complete = entry?.readiness != null;
  return <section className="grid gap-3 rounded-xl border p-4">
    <h2 className="text-lg font-semibold">Daily check-in</h2>
    {complete && !editing ? <>
      <p className="text-2xl font-semibold">{entry.readiness}/100 · {readinessLabel(entry.readiness)}</p>
      <p className="text-sm text-muted-foreground">Sleep {entry.sleep_hours}h · Quality {entry.sleep_quality}/5 · Soreness {entry.soreness}/5 · Stress {entry.stress}/5 · Energy {entry.energy}/5 · Mood {entry.mood}/5</p>
      {!!entry.soreness_areas.length && <p className="text-sm">{entry.soreness_areas.join(", ")}</p>}
      {entry.notes && <p className="text-sm whitespace-pre-wrap">{entry.notes}</p>}
      <Button variant="outline" onClick={() => setEditing(true)}>Edit today&apos;s check-in</Button>
    </> : <form action={action} className="grid gap-4">
      <label className="grid gap-1 text-sm font-medium">Hours slept<input className="min-h-11 rounded-md border px-3" type="number" name="sleep_hours" required min={0} max={24} step={0.1} value={hours} onChange={(e) => setHours(e.target.value)} /></label>
      {Object.entries(CHECK_IN_SCALES).map(([key, labels]) => <fieldset key={key}>
        <legend className="mb-2 text-sm font-medium capitalize">{key.replace("_", " ")}</legend>
        <div className="flex flex-wrap gap-2">{labels.map((label, i) => <label key={label} className="cursor-pointer">
          <input className="peer sr-only" type="radio" name={key} value={i + 1} required checked={ratings[key] === i + 1} onChange={() => setRatings((previous) => ({ ...previous, [key]: i + 1 }))} />
          <span className="flex min-h-11 min-w-11 items-center rounded-md border px-3 text-sm peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2">{i + 1} · {label}</span>
        </label>)}</div>
      </fieldset>)}
      <fieldset><legend className="mb-2 text-sm font-medium">Sore areas (optional, up to 12)</legend>
        <div className="flex flex-wrap gap-2">{SORENESS_AREAS.map((area) => <label key={area} className="cursor-pointer">
          <input className="peer sr-only" type="checkbox" name="soreness_areas" value={area} checked={areas.includes(area)} onChange={(e) => setAreas((previous) => e.target.checked ? [...previous, area] : previous.filter((value) => value !== area))} />
          <span className="flex min-h-11 items-center rounded-md border px-3 text-sm peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2">{area}</span>
        </label>)}</div>
      </fieldset>
      <label className="grid gap-1 text-sm">Note (optional)<textarea name="notes" maxLength={500} rows={2} className="rounded-md border p-3" value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      <Button disabled={pending}>{pending ? "Saving…" : "Save check-in"}</Button>
    </form>}
    {state.message && <p role="status" className="text-sm">{state.message}</p>}
    <Link href="/athlete/journal" className="text-sm text-muted-foreground underline">Journal habits</Link>
  </section>;
}
