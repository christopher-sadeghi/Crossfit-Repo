"use client";

import { startTransition, useActionState } from "react";

import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/auth/form-state";
import { JOURNAL_QUESTIONS, type JournalEntry } from "@/lib/journal";

import { saveJournalEntry } from "./actions";

type Tracked = FormState & { successes?: number };

export function JournalForm({
  entryOn,
  entry,
  habitsLegend,
}: {
  entryOn: string;
  entry: JournalEntry | null;
  habitsLegend: string;
}) {
  const [state, formAction, pending] = useActionState<Tracked, FormData>(async (prev, data) => {
    const next = await saveJournalEntry(prev, data);
    return { ...next, successes: (prev.successes ?? 0) + (next.error ? 0 : 1) };
  }, {});
  const initialValues: Record<string, string> = {
    ...Object.fromEntries(JOURNAL_QUESTIONS.map((q) => [q.key, entry?.[q.key] ? "on" : ""])),
  };
  const values = state.error ? state.values ?? {} : initialValues;

  return (
    <form
      key={`${entryOn}-${state.successes ?? 0}-${JSON.stringify(values)}`}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="grid gap-4"
    >
      <input type="hidden" name="entry_on" value={entryOn} />
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{habitsLegend}</legend>
        {JOURNAL_QUESTIONS.map((q) => (
          <label key={q.key} className="flex min-h-11 items-center justify-between gap-3 rounded-md border px-3 text-sm">
            {q.label}
            <input type="checkbox" name={q.key} className="size-5" defaultChecked={values[q.key] === "on"} />
          </label>
        ))}
      </fieldset>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.message && !state.error && (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : entry ? "Save changes" : "Save journal"}
      </Button>
    </form>
  );
}
