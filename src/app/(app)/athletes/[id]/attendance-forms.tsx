"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { markAttendance, removeAttendance } from "./attendance-actions";

function preserveFormValues(form: HTMLFormElement | null) {
  if (!form) return;
  const preventReset = (event: Event) => event.preventDefault();
  form.addEventListener("reset", preventReset);
  return () => form.removeEventListener("reset", preventReset);
}

export function AttendanceForm({ athleteId, today }: { athleteId: string; today: string }) {
  const [state, action, pending] = useActionState(markAttendance, {});
  const id = useId();
  return (
    <form action={action} ref={preserveFormValues} className="grid max-w-lg gap-3">
      <input type="hidden" name="athlete_id" value={athleteId} />
      <div className="grid gap-2"><Label htmlFor={`${id}-date`}>Date</Label><Input id={`${id}-date`} name="attended_on" type="date" required max={today} defaultValue={state.values?.attended_on ?? today} /></div>
      <div className="grid gap-2"><Label htmlFor={`${id}-kind`}>Session type</Label><select id={`${id}-kind`} name="kind" defaultValue={state.values?.kind ?? "class"} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="class">Class</option><option value="open_gym">Open gym</option></select></div>
      <div className="grid gap-2"><Label htmlFor={`${id}-note`}>Note (optional)</Label><Textarea id={`${id}-note`} name="note" maxLength={500} defaultValue={state.values?.note ?? ""} /></div>
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      {state.message && <p role="status" className="text-sm text-muted-foreground">{state.message}</p>}
      <Button type="submit" disabled={pending} className="w-fit">{pending ? "Saving…" : "Mark attendance"}</Button>
    </form>
  );
}

export function AttendanceToggle({ athleteId, date, kind, marked, label }: {
  athleteId: string; date: string; kind: "class" | "open_gym"; marked: boolean; label?: string;
}) {
  const [state, action, pending] = useActionState(marked ? removeAttendance : markAttendance, {});
  const name = kind === "class" ? "Class" : "Open gym";
  return (
    <form action={action} className="grid gap-1">
      <input type="hidden" name="athlete_id" value={athleteId} />
      <input type="hidden" name="attended_on" value={date} />
      <input type="hidden" name="kind" value={kind} />
      <Button type="submit" size="sm" variant={marked ? "secondary" : "outline"} disabled={pending} aria-label={`${marked ? "Remove" : "Mark"} ${name} attendance`} aria-pressed={marked}>{pending ? "Saving…" : label ?? `${marked ? "✓ " : "+ "}${name}`}</Button>
      {state.error && <p role="alert" className="text-xs text-destructive">{state.error}</p>}
      {state.message && <span role="status" className="sr-only">{state.message}</span>}
    </form>
  );
}
