"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FEEDBACK_LABELS } from "@/lib/feedback";
import type { FormState } from "@/lib/auth/form-state";
import type { Enums, Tables } from "@/lib/supabase/database.types";
import type { LiftPrSetLocation, ResultPart, ResultPartMovement, SectionScore } from "@/lib/result-parts";
import type { WorkoutSection } from "@/lib/workout-sections";
import { fromKgPrecise, type Units } from "@/lib/units";
import { FIELDS } from "@/app/(app)/programs/workouts/log-result-form";
import { ResultPartsEditor } from "@/components/result-parts-editor";
import { WorkoutResultPartsDisplay } from "@/components/workout-result-parts-display";

import { saveAthleteResult } from "../../actions";

type WorkoutResult = Pick<
  Tables<"workout_results">,
  | "id"
  | "workout_id"
  | "performed_on"
  | "time_seconds"
  | "rounds"
  | "reps"
  | "load_kg"
  | "is_rx"
  | "notes"
  | "rpe"
  | "energy"
  | "soreness"
  | "logged_by"
  | "parts"
  | "section_scores"
>;
type Tracked = FormState & {
  successes?: number;
  savedParts?: ResultPart[];
  savedSectionScores?: SectionScore[];
  newPrSets?: LiftPrSetLocation[];
  prError?: boolean;
  savedResultId?: string;
};

export function AthleteResultForm({
  workoutId,
  workoutType,
  today,
  minDate,
  defaultDate,
  units,
  existingResult,
  initialParts,
  sections,
  initialSectionScores,
  movements,
  scheduledOn,
  scheduledParts,
  otherDateParts,
  scheduledMovements,
  otherDateMovements,
  partsHandoffToken,
  prefill,
  inline = false,
}: {
  workoutId: string;
  workoutType: Enums<"workout_type">;
  today: string;
  minDate: string;
  defaultDate: string;
  units: Units;
  existingResult: WorkoutResult | null;
  initialParts: ResultPart[];
  sections?: WorkoutSection[];
  initialSectionScores?: SectionScore[];
  movements: ResultPartMovement[];
  scheduledOn?: string;
  scheduledParts?: ResultPart[];
  otherDateParts?: ResultPart[];
  scheduledMovements?: ResultPartMovement[];
  otherDateMovements?: ResultPartMovement[];
  partsHandoffToken?: string;
  prefill?: Record<string, string>;
  inline?: boolean;
}) {
  const id = (field: string) => (inline ? `${workoutId}-${field}` : field);
  const [state, formAction, pending] = useActionState<Tracked, FormData>(async (prev, data) => {
    const next = await saveAthleteResult(prev, data);
    return { ...next, successes: (prev.successes ?? 0) + (next.error ? 0 : 1) };
  }, {});
  const fields = FIELDS[workoutType];
  const initialValues: Record<string, string> = {
    result_id: existingResult?.id ?? "",
    performed_on: existingResult?.performed_on ?? defaultDate ?? today,
    minutes: existingResult?.time_seconds == null ? "" : String(Math.floor(existingResult.time_seconds / 60)),
    seconds: existingResult?.time_seconds == null ? "" : String(existingResult.time_seconds % 60),
    rounds: existingResult?.rounds == null ? "" : String(existingResult.rounds),
    reps: existingResult?.reps == null ? "" : String(existingResult.reps),
    load: existingResult?.load_kg == null ? "" : String(fromKgPrecise(existingResult.load_kg, units)),
    is_rx: existingResult?.is_rx === false ? "scaled" : "rx",
    notes: existingResult?.notes ?? "",
    rpe: existingResult?.rpe == null ? "" : String(existingResult.rpe),
    energy: existingResult?.energy == null ? "" : String(existingResult.energy),
    soreness: existingResult?.soreness == null ? "" : String(existingResult.soreness),
    ...(!existingResult ? prefill : {}),
  };
  const values = state.error ? state.values ?? {} : initialValues;
  const [selectedDate, setSelectedDate] = useState(
    values.performed_on ?? today,
  );
  useEffect(() => {
    if (state.error)
      setSelectedDate(state.values?.performed_on ?? today);
  }, [state.error, state.values?.performed_on, today]);
  const templateDate = inline ? today : selectedDate;
  const templateParts =
    scheduledOn && scheduledParts && otherDateParts
      ? templateDate === scheduledOn
        ? scheduledParts
        : otherDateParts
      : initialParts;
  const templateMovements =
    scheduledOn && scheduledMovements && otherDateMovements
      ? templateDate === scheduledOn
        ? scheduledMovements
        : otherDateMovements
      : movements;

  return (
    <form
      key={`${state.successes ?? 0}-${JSON.stringify(values)}`}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="grid gap-4"
    >
      <input type="hidden" name="workout_id" value={workoutId} />
      <input type="hidden" name="result_id" value={values.result_id ?? ""} />
      <input type="hidden" name="return_to" value={inline ? "/athlete" : "/athlete/history"} />
      {inline ? (
        <input type="hidden" name="performed_on" value={today} />
      ) : (
        <div className="grid gap-1.5">
          <Label htmlFor="performed_on">Date</Label>
          <Input
            id="performed_on"
            name="performed_on"
            type="date"
            min={minDate}
            max={today}
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.currentTarget.value)}
            required
          />
        </div>
      )}
      <ResultPartsEditor
        initialParts={state.savedParts ?? initialParts}
        sections={sections}
        initialSectionScores={
          state.savedSectionScores ??
          (state.error ? undefined : initialSectionScores)
        }
        templateParts={templateParts}
        movements={templateMovements}
        units={units}
        workoutType={workoutType}
        inputId={id("parts")}
        initialRawParts={state.error ? state.values?.parts : undefined}
        initialRawSectionScores={state.error ? state.values?.section_scores : undefined}
        handoffToken={partsHandoffToken}
        newPrSets={state.newPrSets}
      />
      {state.message && (
        <div className="grid gap-2">
          <p role="status" className="text-sm text-emerald-600">
            {state.message}
          </p>
          {state.prError && (
            <p role="status" className="text-sm text-amber-700">
              The result was saved, but automatic lift PRs could not be updated.
            </p>
          )}
          {state.savedParts && (
            <WorkoutResultPartsDisplay
              parts={state.savedParts}
              units={units}
              sections={sections}
              movements={templateMovements}
              sectionScores={state.savedSectionScores}
              newPrSets={state.newPrSets}
            />
          )}
        </div>
      )}
      {fields.includes("time") && (
        <fieldset className="grid gap-1.5">
          <legend className="text-sm font-medium">
            Time {workoutType === "for_time" && <span className="font-normal text-muted-foreground">(mm:ss)</span>}
          </legend>
          <div className="flex items-center gap-1">
            <Input aria-label="Minutes" name="minutes" type="number" min="0" step="1" placeholder="min" defaultValue={values.minutes} />
            <span>:</span>
            <Input aria-label="Seconds" name="seconds" type="number" min="0" max="59" step="1" placeholder="sec" defaultValue={values.seconds} />
          </div>
        </fieldset>
      )}
      {(fields.includes("rounds") || fields.includes("reps")) && (
        <div className="grid grid-cols-2 gap-2">
          {fields.includes("rounds") && (
            <div className="grid gap-1.5">
              <Label htmlFor={id("rounds")}>Rounds</Label>
              <Input id={id("rounds")} name="rounds" type="number" min="0" step="1" defaultValue={values.rounds} />
            </div>
          )}
          {fields.includes("reps") && (
            <div className="grid gap-1.5">
              <Label htmlFor={id("reps")}>{workoutType === "for_time" ? "Reps (if capped)" : fields.includes("rounds") ? "+ Reps" : "Reps"}</Label>
              <Input id={id("reps")} name="reps" type="number" min="0" step="1" defaultValue={values.reps} />
            </div>
          )}
        </div>
      )}
      {fields.includes("load") && (
        <div className="grid gap-1.5">
          <Label htmlFor={id("load")}>Load ({units})</Label>
          <Input id={id("load")} name="load" type="number" min="0" step="any" defaultValue={values.load} />
        </div>
      )}
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Rx or scaled</legend>
        <div className="flex gap-4 text-sm">
          {(["rx", "scaled"] as const).map((value) => (
            <label key={value} className="flex items-center gap-2">
              <input type="radio" name="is_rx" value={value} defaultChecked={(values.is_rx ?? "rx") === value} />
              {value === "rx" ? "Rx" : "Scaled"}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-1.5">
        <Label htmlFor={id("notes")}>Notes</Label>
        <Textarea id={id("notes")} name="notes" rows={2} maxLength={500} defaultValue={values.notes} />
      </div>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold">How did you feel? (optional)</legend>
        <div className="grid gap-2">
          <RatingField label="RPE" name="rpe" max={10} value={values.rpe} />
          <RatingField
            label="Energy"
            name="energy"
            max={5}
            value={values.energy}
            endpoints={[FEEDBACK_LABELS.energy[0], FEEDBACK_LABELS.energy[4]]}
          />
          <RatingField
            label="Soreness"
            name="soreness"
            max={5}
            value={values.soreness}
            endpoints={[FEEDBACK_LABELS.soreness[0], FEEDBACK_LABELS.soreness[4]]}
          />
        </div>
      </fieldset>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {inline && state.savedResultId ? (
        <Button asChild variant="outline">
          <Link href={`/athlete/history?result=${state.savedResultId}`}>View saved result</Link>
        </Button>
      ) : (
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : existingResult ? "Save changes" : "Save result"}
        </Button>
      )}
    </form>
  );
}

function RatingField({
  label,
  name,
  max,
  value,
  endpoints,
}: {
  label: string;
  name: string;
  max: number;
  value?: string;
  endpoints?: [string, string];
}) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: max }, (_, index) => index + 1).map((rating) => (
          <label key={rating} className="cursor-pointer">
            <input className="peer sr-only" type="radio" name={name} value={rating} defaultChecked={Number(value) === rating} />
            <span className="flex min-h-11 min-w-11 items-center justify-center rounded-md border px-3 text-sm peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
              {rating}
            </span>
          </label>
        ))}
      </div>
      {endpoints && (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{endpoints[0]}</span>
          <span>{endpoints[1]}</span>
        </div>
      )}
    </fieldset>
  );
}
