"use client";

import { startTransition, useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/lib/auth/form-state";

import { assignProgram, placeWorkout } from "./actions";
import { selectClass } from "./options";

type Tracked = FormState & { successes?: number };

// Submit manually so a failed submit keeps the selections; remount after each success to clear them.
function useManualSubmit(action: (state: FormState, data: FormData) => Promise<FormState>) {
  const [state, formAction, pending] = useActionState<Tracked, FormData>(async (prev, data) => {
    const next = await action(prev, data);
    return { ...next, successes: (prev.successes ?? 0) + (next.error ? 0 : 1) };
  }, {});
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  };
  return { state, pending, onSubmit, formKey: state.successes ?? 0 };
}

function Status({ state }: { state: FormState }) {
  if (state.error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <p role="status" className="text-sm text-emerald-600">
        {state.message}
      </p>
    );
  return null;
}

export function PlaceWorkoutForm({
  programId,
  weeks,
  workouts,
}: {
  programId: string;
  weeks: number;
  workouts: { id: string; title: string }[];
}) {
  const { state, pending, onSubmit, formKey } = useManualSubmit(placeWorkout);
  return (
    <form key={formKey} onSubmit={onSubmit} className="grid gap-3">
      <input type="hidden" name="program_id" value={programId} />
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
        <div className="grid gap-2">
          <Label htmlFor="workout_id">WOD</Label>
          <select id="workout_id" name="workout_id" defaultValue="" className={`${selectClass} w-full`}>
            <option value="" disabled>
              {workouts.length ? "Choose a WOD…" : "No WODs yet"}
            </option>
            {workouts.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="week_number">Week</Label>
          <select id="week_number" name="week_number" defaultValue="1" className={`${selectClass} w-full`}>
            {Array.from({ length: weeks }, (_, i) => (
              <option key={i} value={i + 1}>
                Week {i + 1}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="day_number">Day</Label>
          <select id="day_number" name="day_number" defaultValue="1" className={`${selectClass} w-full`}>
            {Array.from({ length: 7 }, (_, i) => (
              <option key={i} value={i + 1}>
                Day {i + 1}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={pending || !workouts.length}>
          {pending ? "Adding…" : "Add to calendar"}
        </Button>
      </div>
      <Status state={state} />
    </form>
  );
}

export function AssignForm({
  programId,
  athletes,
  defaultStart,
}: {
  programId: string;
  athletes: { id: string; name: string }[];
  defaultStart: string;
}) {
  const { state, pending, onSubmit, formKey } = useManualSubmit(assignProgram);
  return (
    <form key={formKey} onSubmit={onSubmit} className="grid gap-3">
      <input type="hidden" name="program_id" value={programId} />
      {athletes.length ? (
        <fieldset className="grid max-h-56 gap-1 overflow-y-auto rounded-md border p-2">
          <legend className="sr-only">Athletes</legend>
          {athletes.map((a) => (
            <label key={a.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted">
              <input type="checkbox" name="athlete_ids" value={a.id} className="size-4" />
              {a.name}
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="text-sm text-muted-foreground">Every active athlete is already on this program.</p>
      )}
      <div className="flex items-end gap-3">
        <div className="grid gap-2">
          <Label htmlFor="start_date">Start date</Label>
          <Input id="start_date" name="start_date" type="date" defaultValue={defaultStart} required />
        </div>
        <Button type="submit" disabled={pending || !athletes.length}>
          {pending ? "Assigning…" : "Assign"}
        </Button>
      </div>
      <Status state={state} />
    </form>
  );
}
