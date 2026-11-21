"use client";

import { startTransition, useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/lib/auth/form-state";
import { approveSuggestion, rejectSuggestion, requestSuggestion } from "@/app/(app)/suggestions/actions";

type TrackedState = FormState & { successes?: number };
type MacroValues = { calories: number; protein_g: number; carbs_g: number; fat_g: number; rationale: string };

function Message({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="text-sm text-destructive">{state.error}</p>;
  if (state.message) return <p role="status" className="text-sm text-emerald-600">{state.message}</p>;
  return null;
}

export function RequestMacroSuggestionForm({ athleteId }: { athleteId: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async () => requestSuggestion("adjust_macros", athleteId),
    {},
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(() => formAction(new FormData(event.currentTarget)));
      }}
      className="grid justify-items-start gap-3"
    >
      <Button type="submit" disabled={pending}>
        {pending ? "Thinking… this can take up to 30 seconds" : "Ask AI to suggest new targets"}
      </Button>
      <Message state={state} />
    </form>
  );
}

export function ApproveSuggestionForm({ id, values }: { id: string; values: MacroValues }) {
  const [state, formAction, pending] = useActionState<TrackedState, FormData>(
    async (previous, formData) => {
      const next = await approveSuggestion(previous, formData);
      return { ...next, successes: (previous.successes ?? 0) + (next.error ? 0 : 1) };
    },
    {},
  );
  const formValues = state.error ? state.values ?? {} : {};
  const formKey = `${state.successes ?? 0}-${JSON.stringify(formValues)}`;

  return (
    <form
      key={formKey}
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(() => formAction(new FormData(event.currentTarget)));
      }}
      className="grid gap-4"
    >
      <input type="hidden" name="id" value={id} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["calories", "Calories", "kcal", 500, 10_000],
            ["protein_g", "Protein", "g", 0, 2000],
            ["carbs_g", "Carbs", "g", 0, 2000],
            ["fat_g", "Fat", "g", 0, 2000],
          ] as const
        ).map(([name, label, unit, min, max]) => (
          <div key={name} className="grid gap-1.5">
            <Label htmlFor={`${id}-${name}`}>{label} ({unit})</Label>
            <Input
              id={`${id}-${name}`}
              name={name}
              type="number"
              min={min}
              max={max}
              step="1"
              required
              defaultValue={formValues[name] ?? values[name]}
            />
          </div>
        ))}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-rationale`}>Why these targets?</Label>
        <Textarea
          id={`${id}-rationale`}
          name="rationale"
          rows={3}
          maxLength={1000}
          required
          defaultValue={formValues.rationale ?? values.rationale}
        />
      </div>
      <Message state={state} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Approving…" : "Approve"}</Button>
      </div>
    </form>
  );
}

export function RejectSuggestionForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async () => rejectSuggestion(id),
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
      <Button type="submit" variant="outline" disabled={pending}>{pending ? "Rejecting…" : "Reject"}</Button>
      <Message state={state} />
    </form>
  );
}
