"use client";

import { useActionState, useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/lib/auth/form-state";
import type { Tables } from "@/lib/supabase/database.types";
import type { Units } from "@/lib/units";
import {
  deleteBenchmarkResult,
  saveBenchmarkResult,
  saveCustomBenchmark,
} from "./benchmark-actions";

export function BenchmarkActionForm({
  action,
  children,
  label,
  destructive = false,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  children: ReactNode;
  label: string;
  destructive?: boolean;
}) {
  const [state, submit, pending] = useActionState(action, {});
  return (
    <form
      action={submit}
      onReset={(event) => event.preventDefault()}
      className="grid gap-3"
      onSubmit={(event) => {
        if (
          destructive &&
          !window.confirm(
            "Delete this entry? Deleting a benchmark also removes all its direct results.",
          )
        )
          event.preventDefault();
      }}
    >
      {children}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.message && (
        <p
          role="status"
          className="text-sm font-medium text-green-700 dark:text-green-400"
        >
          {state.message}
        </p>
      )}
      <Button
        type="submit"
        variant={destructive ? "outline" : "default"}
        disabled={pending}
        className="w-fit"
      >
        {pending ? "Saving…" : label}
      </Button>
    </form>
  );
}

export function BenchmarkResultForm({
  benchmarks,
  athleteId,
  today,
  units,
}: {
  benchmarks: Tables<"benchmarks">[];
  athleteId: string;
  today: string;
  units: Units;
}) {
  const [selected, setSelected] = useState(benchmarks[0]?.id ?? "");
  const [repChoice, setRepChoice] = useState("1");
  const [state, submit, pending] = useActionState(saveBenchmarkResult, {});
  const prefix = useId();
  const b = benchmarks.find((b) => b.id === selected);
  if (!b)
    return (
      <p className="text-sm text-muted-foreground">
        No benchmarks available yet. Ask your coach to add one.
      </p>
    );
  const field = (name: string, label: string, max = 100000) => (
    <label
      className="grid gap-1 text-sm"
      key={name}
      htmlFor={`${prefix}-${name}`}
    >
      {label}
      <Input
        id={`${prefix}-${name}`}
        name={name}
        type="number"
        min="0"
        max={max}
        step={name === "load" ? "0.1" : "1"}
        defaultValue={state.values?.[name]}
      />
    </label>
  );
  return (
    <form
      action={submit}
      onReset={(event) => event.preventDefault()}
      className="grid gap-4"
    >
      <input type="hidden" name="athlete_id" value={athleteId} />
      <label className="grid gap-1 text-sm">
        Benchmark
        <select
          name="benchmark_id"
          className="h-10 rounded-md border bg-background px-3"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {benchmarks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
        {b.description}
      </p>
      <label className="grid gap-1 text-sm">
        Date
        <Input
          name="performed_on"
          type="date"
          required
          max={today}
          defaultValue={state.values?.performed_on ?? today}
        />
      </label>
      <div key={selected} className="grid grid-cols-2 gap-3">
        {(b.workout_type === "for_time" || b.workout_type === "other") && (
          <>
            {field("minutes", "Minutes")}
            {field("seconds", "Seconds", 59)}
          </>
        )}
        {(b.workout_type === "amrap" ||
          b.workout_type === "emom" ||
          b.workout_type === "other") && (
          <>
            {field("rounds", "Rounds")}
            {field("reps", "Additional reps")}
          </>
        )}
        {(b.workout_type === "strength" || b.workout_type === "other") &&
          field("load", `Load (${units})`, 1999)}
      </div>
      {b.kind === "lift" && (
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm">
            Reps in set
            <select
              name={repChoice === "other" ? undefined : "rep_max"}
              value={repChoice}
              onChange={(e) => setRepChoice(e.target.value)}
              className="h-10 rounded-md border bg-background px-3"
            >
              <option value="1">1RM</option>
              <option value="3">3RM</option>
              <option value="5">5RM</option>
              <option value="other">Other</option>
            </select>
          </label>
          {repChoice === "other" && (
            <label className="grid gap-1 text-sm">
              Reps (1–20)
              <Input
                name="rep_max"
                type="number"
                required
                min="1"
                max="20"
                step="1"
                defaultValue={state.values?.rep_max ?? "2"}
              />
            </label>
          )}
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input name="is_rx" type="checkbox" defaultChecked /> Rx (uncheck for
        scaled)
      </label>
      <label className="grid gap-1 text-sm">
        Notes
        <Textarea
          name="notes"
          maxLength={2000}
          defaultValue={state.values?.notes}
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.message && (
        <p
          role="status"
          className="font-medium text-green-700 dark:text-green-400"
        >
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Log benchmark result"}
      </Button>
    </form>
  );
}

export function DeleteBenchmarkResult({ id }: { id: string }) {
  return (
    <BenchmarkActionForm
      action={deleteBenchmarkResult}
      label="Delete entry"
      destructive
    >
      <input type="hidden" name="id" value={id} />
    </BenchmarkActionForm>
  );
}

export function CustomBenchmarkForm({
  benchmark,
  movements,
}: {
  benchmark?: Tables<"benchmarks">;
  movements: { id: string; name: string }[];
}) {
  return (
    <BenchmarkActionForm
      action={saveCustomBenchmark}
      label={benchmark ? "Save changes" : "Add custom benchmark"}
    >
      <input type="hidden" name="id" value={benchmark?.id ?? ""} />
      <label className="grid gap-1 text-sm">
        Name
        <Input
          name="name"
          required
          maxLength={100}
          defaultValue={benchmark?.name}
        />
      </label>
      <label className="grid gap-1 text-sm">
        Workout type
        <select
          name="workout_type"
          className="h-10 rounded-md border bg-background px-3"
          defaultValue={benchmark?.workout_type ?? "for_time"}
        >
          {["for_time", "amrap", "emom", "strength", "other"].map((type) => (
            <option key={type} value={type}>
              {type.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        Description
        <Textarea
          name="description"
          maxLength={4000}
          defaultValue={benchmark?.description ?? ""}
        />
      </label>
      <label className="grid gap-1 text-sm">
        Lift movement (optional; requires Strength)
        <select
          name="movement_id"
          defaultValue={benchmark?.movement_id ?? ""}
          className="h-10 w-full min-w-0 rounded-md border bg-background px-3"
        >
          <option value="">Not a lift</option>
          {movements.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
    </BenchmarkActionForm>
  );
}
