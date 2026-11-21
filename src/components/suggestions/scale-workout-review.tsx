"use client";

import { startTransition, useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { approveScaleSuggestion } from "@/app/(app)/suggestions/scale-actions";
import { formatMovementLine, type WhiteboardMovement } from "@/app/(app)/programs/workouts/whiteboard";
import { RejectSuggestionForm } from "@/components/suggestions/suggestion-forms";
import type { Units } from "@/lib/units";
import type { FormState } from "@/lib/auth/form-state";

type ReviewedMovement = { original: WhiteboardMovement; scaled: WhiteboardMovement; reason: string };

export function ScaleWorkoutReview({
  id,
  summary,
  rationale,
  movements,
  units,
  editable,
  hasExistingScaling,
}: {
  id: string;
  summary: string;
  rationale: string;
  movements: ReviewedMovement[];
  units: Units;
  editable: boolean;
  hasExistingScaling: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (previous, formData) => approveScaleSuggestion(previous, formData),
    {},
  );
  const movementTable = (
    <Table>
      <TableHeader><TableRow><TableHead>Original</TableHead><TableHead>Scaled</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
      <TableBody>
        {movements.map((movement, index) => (
          <TableRow key={`${movement.original.name}-${index}`}>
            <TableCell>{formatMovementLine(movement.original, units)}</TableCell>
            <TableCell>{formatMovementLine(movement.scaled, units)}</TableCell>
            <TableCell className="text-muted-foreground">{movement.reason}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
  return (
    <div className="grid gap-6">
      <Card className="pb-0">
        <CardHeader><CardTitle>Movement changes</CardTitle></CardHeader>
        <CardContent className="p-0">{movementTable}</CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Athlete-facing summary</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          {editable ? (
            <>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  startTransition(() => formAction(new FormData(event.currentTarget)));
                }}
                className="grid gap-3"
              >
                <input type="hidden" name="id" value={id} />
                <Textarea name="summary" rows={3} maxLength={300} required defaultValue={summary} />
                {hasExistingScaling && (
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Approving replaces their current scaled version.
                  </p>
                )}
                <p className="whitespace-pre-line text-sm text-muted-foreground">{rationale}</p>
                {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
                {state.message && <p role="status" className="text-sm text-emerald-600">{state.message}</p>}
                <Button type="submit" disabled={pending}>{pending ? "Approving…" : "Approve scaling"}</Button>
              </form>
              <div className="border-t pt-4">
                <RejectSuggestionForm id={id} />
              </div>
            </>
          ) : (
            <>
              <p className="whitespace-pre-line">{summary}</p>
              <p className="whitespace-pre-line text-sm text-muted-foreground">{rationale}</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
