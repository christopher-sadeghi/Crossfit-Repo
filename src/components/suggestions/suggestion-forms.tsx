"use client";

import { startTransition, useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { joinProgressNote } from "@/lib/ai/progress-note";
import { useInlineDecision } from "./inline-decision";
import type { FormState } from "@/lib/auth/form-state";
import type { WeeklyReport } from "@/lib/weekly-report";
import {
  approveSuggestion,
  rejectSuggestion,
} from "@/app/(app)/suggestions/actions";

type DecisionState = FormState & { warning?: string };
type TrackedState = DecisionState & { successes?: number };
type MacroValues = { calories: number; protein_g: number; carbs_g: number; fat_g: number; rationale: string };

function Message({ state }: { state: DecisionState }) {
  if (state.error) return <p role="alert" className="text-sm text-destructive">{state.error}</p>;
  if (state.warning) return <p role="alert" className="text-sm text-muted-foreground">{state.warning}</p>;
  if (state.message) return <p role="status" className="text-sm text-emerald-600">{state.message}</p>;
  return null;
}

export function ApproveProgramForm({ id, name, startDate, compact = false }: { id: string; name: string; startDate: string; compact?: boolean }) {
  const [state, action, pending] = useActionState(useInlineDecision(approveSuggestion), {});
  return <form action={action} className="grid gap-4">
    <input type="hidden" name="id" value={id} />
    {compact ? <><input type="hidden" name="name" value={name} /><input type="hidden" name="start_date" value={startDate} /></> : <>
    <label className="grid gap-2 text-sm">Program name<Input name="name" defaultValue={state.values?.name ?? name} maxLength={80} required /></label>
    <label className="grid gap-2 text-sm">Start date<Input name="start_date" type="date" defaultValue={state.values?.start_date ?? startDate} required /></label>
    </>}
    <Button disabled={pending}>{pending ? "Saving…" : compact ? "Approve" : "Approve & assign personal program"}</Button>
    <Message state={state} />
  </form>;
}

export function ApproveWeeklyReportForm({ id, report, compact = false }: { id: string; report: WeeklyReport; compact?: boolean }) {
  const [state, formAction, pending] = useActionState(useInlineDecision(approveSuggestion), {});
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => formAction(formData));
      }}
      className="grid gap-4"
    >
      <input type="hidden" name="id" value={id} />
      {compact ? <>
        <input type="hidden" name="summary" value={report.summary} />
        {report.focus.map((point, index) => <input key={index} type="hidden" name="focus" value={point} />)}
      </> : <>
      <div className="grid gap-1.5">
        <Label htmlFor="report-summary">Summary</Label>
        <Textarea id="report-summary" name="summary" defaultValue={report.summary} rows={5} maxLength={1000} required />
      </div>
      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-medium">Focus for next week</legend>
        {["First focus point", "Second focus point", "Third focus point (optional)"].map((label, index) => (
          <div key={label} className="grid gap-1.5">
            <Label htmlFor={`report-focus-${index}`}>{label}</Label>
            <Textarea
              id={`report-focus-${index}`}
              name="focus"
              defaultValue={report.focus[index] ?? ""}
              rows={2}
              maxLength={240}
              required={index < 2}
            />
          </div>
        ))}
      </fieldset>
      </>}
      <Message state={state} />
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Sharing…" : compact ? "Approve" : "Approve and share"}
      </Button>
    </form>
  );
}

export function ApproveSuggestionForm({ id, values }: { id: string; values: MacroValues }) {
  const decide = useInlineDecision(approveSuggestion);
  const [state, formAction, pending] = useActionState<TrackedState, FormData>(
    async (previous, formData) => {
      const next = await decide(previous, formData);
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
  compact = false,
}: {
  id: string;
  mode: "write" | "adjust";
  defaultSaveAs: "update" | "new";
  resultCount: number;
  compact?: boolean;
}) {
  const [saveAs, setSaveAs] = useState(defaultSaveAs);
  const [state, formAction, pending] = useActionState<DecisionState, FormData>(
    useInlineDecision(approveSuggestion),
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
        {!compact && <Button type="submit" name="intent" value="edit" variant="outline" disabled={pending}>
          {pending ? "Saving…" : "Approve and edit"}
        </Button>}
      </div>
    </form>
  );
}

export function ApproveProgressSummaryForm({
  id,
  summary,
  header,
  goalLines,
  compact = false,
}: {
  id: string;
  summary: string;
  header: string;
  goalLines: string[];
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState<DecisionState, FormData>(
    useInlineDecision(approveSuggestion),
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
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Preview the note</summary>
        <pre className="mt-2 font-sans whitespace-pre-wrap">{joinProgressNote(header, value.trim(), goalLines)}</pre>
      </details>
      <Message state={state} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : compact ? "Approve" : "Save to athlete notes"}</Button>
      </div>
    </form>
  );
}

export function RejectSuggestionForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<DecisionState, FormData>(
    useInlineDecision(async () => rejectSuggestion(id)),
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
