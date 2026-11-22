"use client";

import Link from "next/link";
import { Bot, CalendarDays, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import { InlineSuggestionCard } from "@/components/suggestions/inline-suggestion-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SCHEDULE_LABEL, type AthleteScheduleItem } from "@/lib/athlete-schedule";
import type { FormState } from "@/lib/auth/form-state";
import { scheduledWorkoutResultMatcher } from "@/lib/results";
import { formatDate } from "@/lib/units";
import { formatHeadline, type WhiteboardWorkout } from "../../programs/workouts/whiteboard";
import { addExistingWorkoutForAthlete, deleteAthleteWorkout, editWorkoutForAthlete, moveAthleteWorkout, removeWorkoutForAthlete, requestAthleteDayWorkout, restoreWorkoutForAthlete } from "./calendar-actions";
import { addDays, monday } from "./calendar-dates";

type CalendarWorkout = Pick<WhiteboardWorkout, "title" | "workout_type" | "rounds" | "time_cap_seconds"> & {
  id: string; source_workout_id: string | null; week_number: number | null; day_number: number | null;
};
type Props = {
  athleteId: string;
  firstName: string;
  today: string;
  weekStart: string;
  selectedDate: string;
  items: AthleteScheduleItem<CalendarWorkout>[];
  results: { workout_id: string; performed_on: string }[];
  library: { id: string; title: string }[];
  programs: { id: string; name: string; athlete_id: string | null }[];
};

function Status({ state }: { state: FormState }) {
  return <>{state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}{state.message && <p role="status" className="text-sm">{state.message}</p>}</>;
}

function DayMenu({ athleteId, date, weekStart, alignEnd, onSuggestion }: { athleteId: string; date: string; weekStart: string; alignEnd: boolean; onSuggestion: (id: string) => void }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [state, action, pending] = useActionState(async (previous: FormState, formData: FormData) => {
    const result = await requestAthleteDayWorkout(previous, formData);
    if (result.suggestionId) {
      onSuggestion(result.suggestionId);
      if (menu.current) menu.current.open = false;
    }
    return result;
  }, {});
  return (
    <details ref={menu} className="relative">
      <summary aria-label={`Add WOD on ${date}`} title="Add WOD on this day" className="cursor-pointer list-none rounded p-1 hover:bg-muted"><Plus className="size-3.5" /></summary>
      <div className={`absolute z-20 grid w-64 gap-3 rounded-lg border bg-background p-3 text-foreground shadow-lg ${alignEnd ? "right-0" : "left-0"}`}>
        <Link className="hover:underline" href={`/programs/workouts/new?athlete=${athleteId}&date=${date}`}>New WOD for this day</Link>
        <Link className="hover:underline" href={`?tab=workouts&week=${weekStart}&date=${date}#add-existing-wod`}>Add from library</Link>
        <form action={action} className="grid gap-2 border-t pt-2">
          <input type="hidden" name="athlete_id" value={athleteId} />
          <input type="hidden" name="date" value={date} />
          <label htmlFor={`ai-request-${date}`} className="font-medium">Ask AI to write one</label>
          <Textarea id={`ai-request-${date}`} name="request" placeholder="Optional instructions" maxLength={500} />
          <Button size="sm" disabled={pending}>{pending ? "Requesting…" : "Ask AI to write one"}</Button>
          <p className="text-xs text-muted-foreground">Review the draft here before anything changes.</p>
          <Status state={state} />
        </form>
      </div>
    </details>
  );
}

function WorkoutChip({ item, athleteId, today, logged }: { item: AthleteScheduleItem<CalendarWorkout>; athleteId: string; today: string; logged: boolean }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<FormState>({});
  const [moving, setMoving] = useState(false);
  const [date, setDate] = useState(item.date);
  const workoutId = item.workout.id;
  function run(action: () => Promise<FormState>, confirmation?: string) {
    if (confirmation && !confirm(confirmation)) return;
    setState({});
    startTransition(async () => {
      try { setState(await action()); } catch (error) {
        // Next.js redirects must reach the router.
        if (error && typeof error === "object" && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT")) throw error;
        setState({ error: "Couldn't update this WOD. Please try again." });
      }
    });
  }
  const label = item.overrides ? `Edited from ${SCHEDULE_LABEL(item.overrides)}` : SCHEDULE_LABEL(item);
  const iconClass = "rounded p-1 hover:bg-background disabled:opacity-50";
  const restore = () => run(() => restoreWorkoutForAthlete(athleteId, item.overrides?.workoutId ?? workoutId));
  return (
    <div className={`grid gap-1 rounded bg-muted/60 px-1.5 py-2 ${item.removed ? "text-muted-foreground" : ""}`} aria-busy={pending}>
      <Link href={`/programs/workouts/${workoutId}`} className={`font-medium hover:underline ${item.removed ? "line-through" : ""}`}>{item.workout.title}</Link>
      <span className="text-muted-foreground">{formatHeadline(item.workout)}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
      {item.removed && <span>Removed for this athlete</span>}
      {(logged || (!item.removed && item.date < today)) && <span>{logged ? "Logged" : "Not logged"}</span>}
      <div className="flex flex-wrap items-center gap-1">
        {item.removed ? (
          <button type="button" className={iconClass} disabled={pending} onClick={restore} aria-label="Restore program WOD" title="Restore program WOD"><RotateCcw className="size-3.5" /></button>
        ) : <>
          {item.source === "group" ? (
            <button type="button" className={iconClass} disabled={pending} onClick={() => run(() => editWorkoutForAthlete(athleteId, workoutId))} aria-label="Edit for this athlete" title="Edit for this athlete"><Pencil className="size-3.5" /></button>
          ) : <Link className={iconClass} href={`/programs/workouts/${workoutId}/edit`} aria-label="Edit WOD" title="Edit WOD"><Pencil className="size-3.5" /></Link>}
          {item.source === "one_off" ? <>
            <button type="button" className={iconClass} disabled={pending} onClick={() => setMoving(!moving)} aria-label="Move WOD" title="Move WOD"><CalendarDays className="size-3.5" /></button>
            <button type="button" className={iconClass} disabled={pending} onClick={() => run(() => deleteAthleteWorkout(athleteId, workoutId), "Delete this athlete's WOD?")} aria-label="Delete WOD" title="Delete WOD"><Trash2 className="size-3.5" /></button>
            {item.overrides && <button type="button" className={iconClass} disabled={pending} onClick={restore} aria-label="Restore group version" title="Restore group version"><RotateCcw className="size-3.5" /></button>}
          </> : <button type="button" className={iconClass} disabled={pending} onClick={() => run(() => removeWorkoutForAthlete(athleteId, workoutId), "Remove this WOD for this athlete only?")} aria-label="Remove for this athlete" title="Remove for this athlete"><X className="size-3.5" /></button>}
        </>}
      </div>
      {moving && !item.removed && <form className="grid gap-1" onSubmit={(event) => { event.preventDefault(); run(() => moveAthleteWorkout(athleteId, workoutId, date)); }}>
        <label htmlFor={`move-${workoutId}`}>Move to</label>
        <Input id={`move-${workoutId}`} type="date" value={date} required onChange={(event) => setDate(event.target.value)} className="min-w-0 px-1 text-xs" />
        <Button size="sm" disabled={pending}>Move</Button>
      </form>}
      <Status state={state} />
    </div>
  );
}

function AddExistingForm({ athleteId, firstName, library, programs, selectedDate }: Pick<Props, "athleteId" | "firstName" | "library" | "programs" | "selectedDate">) {
  const [state, action, pending] = useActionState(addExistingWorkoutForAthlete, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (window.location.hash === "#add-existing-wod") formRef.current?.querySelector<HTMLSelectElement>("select")?.focus();
  }, [selectedDate]);
  return <Card id="add-existing-wod">
    <CardHeader><CardTitle>Add an existing WOD</CardTitle></CardHeader>
    <CardContent>
      <form ref={formRef} action={action} className="grid gap-3 md:grid-cols-4">
        <input type="hidden" name="athlete_id" value={athleteId} />
        <label className="grid gap-1 text-sm">Library WOD
          <select name="workout_id" required defaultValue="" className="h-9 min-w-0 rounded-md border bg-background px-2">
            <option value="" disabled>Choose a WOD</option>
            {library.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">Date<Input name="date" type="date" defaultValue={selectedDate} required /></label>
        <label className="grid gap-1 text-sm">Destination
          <select name="destination" className="h-9 min-w-0 rounded-md border bg-background px-2">
            <option value="athlete">Just {firstName}</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.athlete_id ? "Personal" : "Group"} · {p.name}</option>)}
          </select>
        </label>
        <Button className="self-end" disabled={pending || !library.length}>{pending ? "Adding…" : "Add WOD"}</Button>
        <p className="text-xs text-muted-foreground md:col-span-4">Adding to a group program changes it for everyone on that program.</p>
        {!library.length && <p className="text-sm text-muted-foreground md:col-span-4">No library WODs available. Create a new WOD from a day&apos;s + menu.</p>}
        <div className="md:col-span-4"><Status state={state} /></div>
      </form>
    </CardContent>
  </Card>;
}

export function AthleteCalendar(props: Props) {
  const { athleteId, firstName, today, weekStart, items, results } = props;
  const [suggestionIds, setSuggestionIds] = useState<string[]>([]);
  const isLogged = scheduledWorkoutResultMatcher(results);
  const weekLink = (date: string) => `?tab=workouts&week=${date}`;
  return <section aria-label="Athlete training calendar" className="grid min-w-0 gap-4">
    <AddExistingForm key={props.selectedDate} {...props} />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-semibold">Week of {formatDate(weekStart)}</h2>
      <Button variant="outline" onClick={() => window.dispatchEvent(new CustomEvent("open-coach-chat", { detail: { draft: `Plan ${firstName}'s week of ${weekStart} around their program, goals and injuries.` } }))}><Bot className="size-4" />Plan with AI coach</Button>
      <nav aria-label="Calendar weeks" className="flex gap-3 text-sm">
        <Link className="hover:underline" href={weekLink(addDays(weekStart, -7))}>Previous</Link>
        <Link className="hover:underline" href={weekLink(monday(today))}>This week</Link>
        <Link className="hover:underline" href={weekLink(addDays(weekStart, 7))}>Next</Link>
      </nav>
    </div>
    <div className="overflow-x-auto pb-4">
      <div className="grid min-w-[980px] grid-cols-7 gap-2 has-[details[open]]:min-h-[28rem]">
        {Array.from({ length: 7 }, (_, index) => {
          const date = addDays(weekStart, index);
          const dayItems = items.filter((item) => item.date === date);
          return <div key={date} className={`flex min-h-44 flex-col gap-2 rounded-lg border bg-card p-2 text-xs ${date === today ? "border-primary ring-1 ring-primary" : ""}`}>
            <div className="flex items-center justify-between text-muted-foreground">
              <time dateTime={date} aria-current={date === today ? "date" : undefined}>{new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))}</time>
              <DayMenu athleteId={athleteId} date={date} weekStart={weekStart} alignEnd={index > 3} onSuggestion={(id) => setSuggestionIds((ids) => [...ids, id])} />
            </div>
            {dayItems.map((item) => <WorkoutChip key={`${item.workout.id}-${item.date}`} item={item} athleteId={athleteId} today={today} logged={isLogged(item)} />)}
            {!dayItems.length && <p className="py-2 text-muted-foreground">No WODs</p>}
          </div>;
        })}
      </div>
    </div>
    {suggestionIds.map((id) => <InlineSuggestionCard key={id} id={id} />)}
  </section>;
}
