"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/lib/auth/form-state";
import type { Enums } from "@/lib/supabase/database.types";
import { ResultPartsEditor } from "@/components/result-parts-editor";
import { WorkoutResultPartsDisplay } from "@/components/workout-result-parts-display";
import { defaultParts, type ResultPartMovement, type SectionScore } from "@/lib/result-parts";
import type { WorkoutSection } from "@/lib/workout-sections";
import type { ScalingRow } from "@/lib/workout-scaling";
import { workoutVersion } from "@/lib/workout-version";
import type { Units } from "@/lib/units";

import { selectClass } from "../options";
import { deleteResult, logResult } from "./result-actions";

type Tracked = FormState & {
  successes?: number;
  savedParts?: import("@/lib/result-parts").ResultPart[];
  savedSectionScores?: SectionScore[];
  newPrSets?: import("@/lib/result-parts").LiftPrSetLocation[];
  prError?: boolean;
};

export const FIELDS: Record<Enums<"workout_type">, ("time" | "rounds" | "reps" | "load")[]> = {
  for_time: ["time", "reps"],
  amrap: ["rounds", "reps"],
  emom: ["rounds", "reps"],
  strength: ["load"],
  other: ["time", "rounds", "reps", "load"],
};

export function LogResultForm({
  workoutId,
  workoutType,
  athletes,
  units,
  today,
  baseVersion,
  scalings,
}: {
  workoutId: string;
  workoutType: Enums<"workout_type">;
  athletes: { id: string; name: string }[];
  units: Units;
  today: string;
  baseVersion: {
    movements: ResultPartMovement[];
    rounds: number | null;
    time_cap_seconds: number | null;
    sections?: WorkoutSection[];
  };
  scalings: (ScalingRow & { athlete_id: string })[];
}) {
  // Submit manually so a failed submit keeps the selections; remount after each success to clear them.
  const [state, formAction, pending] = useActionState<Tracked, FormData>(async (prev, data) => {
    const next = await logResult(prev, data);
    return { ...next, successes: (prev.successes ?? 0) + (next.error ? 0 : 1) };
  }, {});
  const fields = FIELDS[workoutType];
  const v = state.error ? (state.values ?? {}) : {};
  const [selectedAthlete, setSelectedAthlete] = useState(v.athlete_id ?? "");
  const [selectedDate, setSelectedDate] = useState(v.performed_on ?? today);
  useEffect(() => {
    if (state.error) {
      setSelectedAthlete(v.athlete_id ?? "");
      setSelectedDate(v.performed_on ?? today);
    } else if (state.successes) {
      setSelectedAthlete("");
      setSelectedDate(today);
    }
  }, [state.error, state.successes, today, v.athlete_id, v.performed_on]);
  const scaling = scalings.find((row) => row.athlete_id === selectedAthlete) ?? null;
  const version = workoutVersion(baseVersion, scaling, selectedDate);
  const initialParts = defaultParts(version, units);

  return (
    <form
      key={`${state.successes ?? 0}-${JSON.stringify(v)}`}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="grid gap-3"
    >
      <input type="hidden" name="workout_id" value={workoutId} />
      <div className="grid gap-1.5">
        <Label htmlFor="athlete_id">Athlete</Label>
        <select
          id="athlete_id"
          name="athlete_id"
          className={selectClass}
          value={selectedAthlete}
          onChange={(event) => setSelectedAthlete(event.currentTarget.value)}
          required
        >
          <option value="" disabled>
            Choose an athlete…
          </option>
          {athletes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="performed_on">Date</Label>
        <Input
          id="performed_on"
          name="performed_on"
          type="date"
          max={today}
          value={selectedDate}
          onChange={(event) => setSelectedDate(event.currentTarget.value)}
          required
        />
      </div>
      <ResultPartsEditor
        initialParts={initialParts}
        templateParts={initialParts}
        sections={version.sections}
        resetKey={`${selectedAthlete}-${state.successes ?? 0}`}
        movements={version.movements}
        units={units}
        workoutType={workoutType}
        inputId={`${workoutId}-coach`}
        initialRawParts={state.error ? v.parts : undefined}
        initialRawSectionScores={state.error ? v.section_scores : undefined}
      />
      {fields.includes("time") && (
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">Time {workoutType === "for_time" && <span className="font-normal text-muted-foreground">(mm:ss)</span>}</legend>
          <div className="flex items-center gap-1">
            <Input aria-label="Minutes" name="minutes" type="number" min="0" step="1" placeholder="min" defaultValue={v.minutes} />
            <span>:</span>
            <Input aria-label="Seconds" name="seconds" type="number" min="0" max="59" step="1" placeholder="sec" defaultValue={v.seconds} />
          </div>
        </fieldset>
      )}
      {(fields.includes("rounds") || fields.includes("reps")) && (
        <div className="grid grid-cols-2 gap-2">
          {fields.includes("rounds") && (
            <div className="grid gap-1.5">
              <Label htmlFor="rounds">Rounds</Label>
              <Input id="rounds" name="rounds" type="number" min="0" step="1" defaultValue={v.rounds} />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="reps">{workoutType === "for_time" ? "Reps (if capped)" : fields.includes("rounds") ? "+ Reps" : "Reps"}</Label>
            <Input id="reps" name="reps" type="number" min="0" step="1" defaultValue={v.reps} />
          </div>
        </div>
      )}
      {fields.includes("load") && (
        <div className="grid gap-1.5">
          <Label htmlFor="load">Load ({units})</Label>
          <Input id="load" name="load" type="number" min="0" step="any" defaultValue={v.load} />
        </div>
      )}
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Rx or scaled</legend>
        <div className="flex gap-4 text-sm">
          {(["rx", "scaled"] as const).map((o) => (
            <label key={o} className="flex items-center gap-1.5">
              <input type="radio" name="is_rx" value={o} defaultChecked={(v.is_rx ?? "rx") === o} />
              {o === "rx" ? "Rx" : "Scaled"}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-1.5">
        <Label htmlFor="result_notes">Notes</Label>
        <Textarea id="result_notes" name="notes" rows={2} maxLength={500} placeholder="e.g. Scaled to 65 lb, banded pull-ups" defaultValue={v.notes} />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {!state.error && state.message && (
        <div className="grid gap-2">
          <p role="status" className="text-sm text-emerald-600">{state.message}</p>
          {state.prError && (
            <p role="status" className="text-sm text-amber-700">
              The result was saved, but automatic lift PRs could not be updated.
            </p>
          )}
          {state.savedParts && (
            <WorkoutResultPartsDisplay
              parts={state.savedParts}
              sections={version.sections}
              movements={version.movements}
              sectionScores={state.savedSectionScores}
              units={units}
              newPrSets={state.newPrSets}
            />
          )}
        </div>
      )}
      <Button type="submit" disabled={pending || athletes.length === 0}>
        {pending ? "Saving…" : "Log result"}
      </Button>
    </form>
  );
}

export function DeleteResultButton({ id, label }: { id: string; label: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`Delete ${label}`}
      title="Delete result"
      onClick={() => {
        if (confirm(`Delete ${label}? This can't be undone.`)) startTransition(() => deleteResult(id));
      }}
    >
      <Trash2 />
    </Button>
  );
}
