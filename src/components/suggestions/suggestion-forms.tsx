"use client";

import { startTransition, useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/lib/auth/form-state";
import {
  approveSuggestion,
  rejectSuggestion,
  requestSuggestion,
  requestWorkoutSuggestion,
} from "@/app/(app)/suggestions/actions";

type TrackedState = FormState & { successes?: number };
type MacroValues = { calories: number; protein_g: number; carbs_g: number; fat_g: number; rationale: string };

function Message({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="text-sm text-destructive">{state.error}</p>;
  if (state.message) return <p role="status" className="text-sm text-emerald-600">{state.message}</p>;
  return null;
}

function RequestAthleteSuggestionForm({
  athleteId,
  type,
  label,
}: {
  athleteId: string;
  type: "adjust_macros" | "progress_summary";
  label: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async () => requestSuggestion(type, athleteId),
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
        {pending ? "Thinking… this can take up to 30 seconds" : label}
      </Button>
      <Message state={state} />
    </form>
  );
}

export function RequestMacroSuggestionForm({ athleteId }: { athleteId: string }) {
  return <RequestAthleteSuggestionForm athleteId={athleteId} type="adjust_macros" label="Suggest macros" />;
}

export function RequestProgressSummaryForm({ athleteId }: { athleteId: string }) {
  return <RequestAthleteSuggestionForm athleteId={athleteId} type="progress_summary" label="Summarize progress" />;
}

export function RequestWorkoutSuggestionForm({ workoutId }: { workoutId?: string }) {
  const [request, setRequest] = useState("");
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (previous, formData) => requestWorkoutSuggestion(previous, formData),
    {},
  );
  const quickRequests = ["Make it harder", "Make it easier", "Make it shorter", "No barbell"];

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(() => formAction(new FormData(event.currentTarget)));
      }}
      className="grid justify-items-start gap-3"
    >
      {workoutId && <input type="hidden" name="workout_id" value={workoutId} />}
      <div className="grid w-full gap-1.5">
        <Label htmlFor="workout-ai-request">{workoutId ? "What should change?" : "What WOD should the AI write?"}</Label>
        <Textarea
          id="workout-ai-request"
          name="request"
          placeholder="20-minute AMRAP, no barbell, focus on engine"
          minLength={3}
          maxLength={500}
          required
          rows={3}
          value={request}
          onChange={(event) => setRequest(event.target.value)}
        />
      </div>
      {workoutId && (
        <div className="flex flex-wrap gap-2">
          {quickRequests.map((quickRequest) => (
            <Button
              key={quickRequest}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRequest(quickRequest)}
            >
              {quickRequest}
            </Button>
          ))}
        </div>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Asking the AI… (up to 45 s)" : workoutId ? "Ask AI to adjust" : "Ask AI to write a WOD"}
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

export function ApproveWorkoutSuggestionForm({
  id,
  mode,
  defaultSaveAs,
  resultCount,
}: {
  id: string;
  mode: "write" | "adjust";
  defaultSaveAs: "update" | "new";
  resultCount: number;
}) {
  const [saveAs, setSaveAs] = useState(defaultSaveAs);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (previous, formData) => approveSuggestion(previous, formData),
    {},
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        if (submitter instanceof HTMLButtonElement && submitter.name === "intent")
          formData.set("intent", submitter.value);
        startTransition(() => formAction(formData));
      }}
      className="grid gap-4"
    >
      <input type="hidden" name="id" value={id} />
      {mode === "adjust" && (
        <fieldset className="grid gap-3">
          <legend className="text-sm font-medium">Save the adjusted WOD as</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["update", "Update this WOD"],
                ["new", "Save as a new WOD"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                htmlFor={`${id}-save-as-${value}`}
                className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <input
                  id={`${id}-save-as-${value}`}
                  type="radio"
                  name="save_as"
                  value={value}
                  checked={saveAs === value}
                  onChange={() => setSaveAs(value)}
                />
                {label}
              </label>
            ))}
          </div>
          {resultCount > 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              This WOD has {resultCount} logged results; updating changes what they were scored against.
            </p>
          )}
        </fieldset>
      )}
      <Message state={state} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="approve" disabled={pending}>
          {pending ? "Approving…" : "Approve"}
        </Button>
        <Button type="submit" name="intent" value="edit" variant="outline" disabled={pending}>
          {pending ? "Saving…" : "Approve and edit"}
        </Button>
      </div>
    </form>
  );
}

export function ApproveProgressSummaryForm({ id, summary }: { id: string; summary: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (previous, formData) => approveSuggestion(previous, formData),
    {},
  );
  const [value, setValue] = useState(summary);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(() => formAction(new FormData(event.currentTarget)));
      }}
      className="grid gap-4"
    >
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-summary`}>Summary</Label>
        <Textarea
          id={`${id}-summary`}
          name="summary"
          rows={4}
          maxLength={800}
          required
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
      <Message state={state} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save to athlete notes"}</Button>
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
