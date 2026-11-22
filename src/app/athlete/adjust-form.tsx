"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CHECK_WITH_COACH_MESSAGE } from "@/lib/ai/athlete-adjust-copy";

import { adjustTodaysWorkout, type AdjustState } from "./adjust-actions";

export function AdjustWorkoutForm({ workoutId, adjusted }: { workoutId: string; adjusted: boolean }) {
  const [state, formAction, pending] = useActionState<AdjustState, FormData>(adjustTodaysWorkout, {});
  const fieldId = `feeling-${workoutId}`;
  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="workout_id" value={workoutId} />
      <div className="grid gap-2">
        <Label htmlFor={fieldId}>How do you feel today?</Label>
        <Textarea
          id={fieldId}
          name="feeling"
          rows={2}
          maxLength={300}
          required
          placeholder="For example: knee is sore, slept 4 hours"
          defaultValue={state.feeling ?? ""}
        />
        <p className="text-xs text-muted-foreground">
          The AI can only make {adjusted ? "your version" : "this WOD"} easier or safer. It applies right away, just for you, and your coach can
          review or undo it.
        </p>
      </div>
      {state.checkWithCoach && (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          {CHECK_WITH_COACH_MESSAGE}
        </p>
      )}
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      {state.message && <p role="status" className="text-sm text-emerald-600">{state.message}</p>}
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Adjusting…" : "Adjust my WOD"}
      </Button>
    </form>
  );
}
