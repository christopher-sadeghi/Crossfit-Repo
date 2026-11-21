"use client";

import { startTransition, useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/lib/auth/form-state";
import { JOURNAL_QUESTIONS, SLEEP_QUALITY_LABELS, type JournalEntry } from "@/lib/journal";

import { saveJournalEntry } from "./actions";

type Tracked = FormState & { successes?: number };

export function JournalForm({ entryOn, entry }: { entryOn: string; entry: JournalEntry | null }) {
  const [state, formAction, pending] = useActionState<Tracked, FormData>(async (prev, data) => {
    const next = await saveJournalEntry(prev, data);
    return { ...next, successes: (prev.successes ?? 0) + (next.error ? 0 : 1) };
  }, {});
  const initialValues: Record<string, string> = {
    sleep_hours: entry?.sleep_hours == null ? "" : String(entry.sleep_hours),
    sleep_quality: entry?.sleep_quality == null ? "" : String(entry.sleep_quality),
    notes: entry?.notes ?? "",
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
      <div className="grid gap-1.5">
        <Label htmlFor="sleep_hours">Hours slept</Label>
        <Input id="sleep_hours" name="sleep_hours" type="number" min="0" max="24" step="0.5" defaultValue={values.sleep_hours} />
      </div>
      <fieldset className="grid gap-1.5">
        <legend className="text-sm font-medium">Sleep quality</legend>
        <div className="flex flex-wrap gap-1.5">
          {["Not rated", ...SLEEP_QUALITY_LABELS].map((label, index) => (
            <label key={label} className="cursor-pointer">
              <input
                className="peer sr-only"
                type="radio"
                name="sleep_quality"
                value={index === 0 ? "" : index}
                defaultChecked={(Number(values.sleep_quality) || 0) === index}
              />
              <span className="flex min-h-11 items-center justify-center rounded-md border px-3 text-sm peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                {label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Yesterday and today, did you…</legend>
        {JOURNAL_QUESTIONS.map((q) => (
          <label key={q.key} className="flex min-h-11 items-center justify-between gap-3 rounded-md border px-3 text-sm">
            {q.label}
            <input type="checkbox" name={q.key} className="size-5" defaultChecked={values[q.key] === "on"} />
          </label>
        ))}
      </fieldset>
      <div className="grid gap-1.5">
        <Label htmlFor="journal_notes">Notes</Label>
        <Textarea id="journal_notes" name="notes" rows={2} maxLength={500} defaultValue={values.notes} />
      </div>
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
