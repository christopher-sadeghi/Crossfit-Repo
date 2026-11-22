"use client";

import { startTransition, useActionState } from "react";

import { InlineSuggestionCard } from "./inline-suggestion-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/lib/auth/form-state";

import { removeWorkoutScaling, requestScaleSuggestion } from "@/app/(app)/suggestions/scale-actions";

type AthleteOption = { id: string; name: string };

function Message({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="text-sm text-destructive">{state.error}</p>;
  if (state.message) return <p role="status" className="text-sm text-emerald-600">{state.message}</p>;
  return null;
}

export function ScaleWorkoutRequestForm({
  workoutId,
  athletes,
  lockedAthlete,
}: {
  workoutId: string;
  athletes: AthleteOption[];
  lockedAthlete: AthleteOption | null;
}) {
  const [state, formAction, pending] = useActionState<FormState & { suggestionId?: string }, FormData>(
    async (previous, formData) => requestScaleSuggestion(previous, formData),
    {},
  );
  return (
    <div className="grid min-w-0 gap-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(() => formAction(new FormData(event.currentTarget)));
        }}
        className="grid max-w-xl gap-3"
      >
        <input type="hidden" name="workout_id" value={workoutId} />
        <div className="grid gap-1.5">
          <Label htmlFor={`scale-athlete-${workoutId}`}>Athlete</Label>
          {lockedAthlete ? (
            <>
              <input type="hidden" name="athlete_id" value={lockedAthlete.id} />
              <p className="rounded-md border px-3 py-2 text-sm">{lockedAthlete.name}</p>
            </>
          ) : (
            <select
              id={`scale-athlete-${workoutId}`}
              name="athlete_id"
              required
              defaultValue=""
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="" disabled>Select an active athlete</option>
              {athletes.map((athlete) => <option key={athlete.id} value={athlete.id}>{athlete.name}</option>)}
            </select>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`scale-note-${workoutId}`}>Optional note for the AI</Label>
          <Textarea id={`scale-note-${workoutId}`} name="note" maxLength={300} rows={2} />
        </div>
        <Button type="submit" disabled={pending}>{pending ? "Creating scaling suggestion…" : "Scale for athlete…"}</Button>
        <Message state={state} />
      </form>
      {state.suggestionId && <InlineSuggestionCard key={state.suggestionId} id={state.suggestionId} />}
    </div>
  );
}

export function RemoveWorkoutScalingForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (previous, formData) => removeWorkoutScaling(previous, formData),
    {},
  );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(() => formAction(new FormData(event.currentTarget)));
      }}
      className="grid justify-items-start gap-2"
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Removing…" : "Remove"}
      </Button>
      <Message state={state} />
    </form>
  );
}
