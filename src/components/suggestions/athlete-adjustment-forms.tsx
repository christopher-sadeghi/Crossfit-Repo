"use client";

import { useActionState } from "react";

import {
  editAthleteAdjustment,
  markAthleteAdjustmentReviewed,
  undoAthleteAdjustment,
} from "@/app/(app)/suggestions/athlete-adjust-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/lib/auth/form-state";
import type { Units } from "@/lib/units";

function Status({ state }: { state: FormState }) {
  return (
    <>
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      {state.message && <p role="status" className="text-sm text-emerald-600">{state.message}</p>}
    </>
  );
}

export function EditAthleteAdjustmentForm({
  id,
  summary,
  movements,
  units,
}: {
  id: string;
  summary: string;
  movements: { name: string; load: number | null }[];
  units: Units;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(editAthleteAdjustment, {});
  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-3 sm:grid-cols-2">
        {movements.map((movement, index) => (
          <div key={`${movement.name}-${index}`} className="grid gap-1">
            <Label htmlFor={`adjust-load-${index}`}>{movement.name} load ({units})</Label>
            <Input
              id={`adjust-load-${index}`}
              name={`load_${index}`}
              type="number"
              min={0}
              max={2000}
              step="any"
              defaultValue={state.values?.[`load_${index}`] ?? movement.load ?? ""}
            />
          </div>
        ))}
      </div>
      <div className="grid gap-1">
        <Label htmlFor="adjust-summary">What the athlete sees</Label>
        <Textarea id="adjust-summary" name="summary" rows={3} maxLength={600} required defaultValue={state.values?.summary ?? summary} />
      </div>
      <Status state={state} />
      <Button type="submit" disabled={pending} className="justify-self-start">{pending ? "Saving…" : "Save changes"}</Button>
    </form>
  );
}

export function MarkReviewedForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(markAthleteAdjustmentReviewed, {});
  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" disabled={pending} className="justify-self-start">{pending ? "Saving…" : "Looks good — mark as reviewed"}</Button>
      <Status state={state} />
    </form>
  );
}

export function UndoAthleteAdjustmentForm({ id, restoresCoachScaling }: { id: string; restoresCoachScaling: boolean }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(undoAthleteAdjustment, {});
  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      <p className="text-sm text-muted-foreground">
        {restoresCoachScaling
          ? "Undo puts the athlete back on the scaling you gave them."
          : "Undo puts the athlete back on the original WOD."}
      </p>
      <Button type="submit" variant="destructive" disabled={pending} className="justify-self-start">
        {pending ? "Undoing…" : "Undo athlete's change"}
      </Button>
      <Status state={state} />
    </form>
  );
}
