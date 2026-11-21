"use client";

import { startTransition, useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FEEDBACK_LABELS } from "@/lib/feedback";
import type { FormState } from "@/lib/auth/form-state";
import type { Enums, Tables } from "@/lib/supabase/database.types";
import { fromKgPrecise, type Units } from "@/lib/units";
import { FIELDS } from "@/app/(app)/programs/workouts/log-result-form";

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
  | "sleep_hours"
  | "soreness"
  | "pain_notes"
  | "logged_by"
>;
type Tracked = FormState & { successes?: number };

export function AthleteResultForm({
  workoutId,
  workoutType,
  today,
  minDate,
  units,
  existingResult,
}: {
  workoutId: string;
  workoutType: Enums<"workout_type">;
  today: string;
  minDate: string;
  units: Units;
  existingResult: WorkoutResult | null;
}) {
  const [state, formAction, pending] = useActionState<Tracked, FormData>(async (prev, data) => {
    const next = await saveAthleteResult(prev, data);
    return { ...next, successes: (prev.successes ?? 0) + (next.error ? 0 : 1) };
  }, {});
  const fields = FIELDS[workoutType];
  const initialValues: Record<string, string> = {
    result_id: existingResult?.id ?? "",
    performed_on: existingResult?.performed_on ?? today,
    minutes: existingResult?.time_seconds == null ? "" : String(Math.floor(existingResult.time_seconds / 60)),
    seconds: existingResult?.time_seconds == null ? "" : String(existingResult.time_seconds % 60),
    rounds: existingResult?.rounds == null ? "" : String(existingResult.rounds),
    reps: existingResult?.reps == null ? "" : String(existingResult.reps),
    load: existingResult?.load_kg == null ? "" : String(fromKgPrecise(existingResult.load_kg, units)),
    is_rx: existingResult?.is_rx === false ? "scaled" : "rx",
    notes: existingResult?.notes ?? "",
    rpe: existingResult?.rpe == null ? "" : String(existingResult.rpe),
    energy: existingResult?.energy == null ? "" : String(existingResult.energy),
    sleep_hours: existingResult?.sleep_hours == null ? "" : String(existingResult.sleep_hours),
    soreness: existingResult?.soreness == null ? "" : String(existingResult.soreness),
    pain_notes: existingResult?.pain_notes ?? "",
  };
  const values = state.error ? state.values ?? {} : initialValues;

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
      <div className="grid gap-1.5">
        <Label htmlFor="performed_on">Date</Label>
        <Input
          id="performed_on"
          name="performed_on"
          type="date"
          min={minDate}
          max={today}
          defaultValue={values.performed_on ?? today}
          required
        />
      </div>
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
              <Label htmlFor="rounds">Rounds</Label>
              <Input id="rounds" name="rounds" type="number" min="0" step="1" defaultValue={values.rounds} />
            </div>
          )}
          {fields.includes("reps") && (
            <div className="grid gap-1.5">
              <Label htmlFor="reps">{workoutType === "for_time" ? "Reps (if capped)" : fields.includes("rounds") ? "+ Reps" : "Reps"}</Label>
              <Input id="reps" name="reps" type="number" min="0" step="1" defaultValue={values.reps} />
            </div>
          )}
        </div>
      )}
      {fields.includes("load") && (
        <div className="grid gap-1.5">
          <Label htmlFor="load">Load ({units})</Label>
          <Input id="load" name="load" type="number" min="0" step="any" defaultValue={values.load} />
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
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={2} maxLength={500} defaultValue={values.notes} />
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
      <div className="grid gap-1.5">
        <Label htmlFor="sleep_hours">Sleep hours</Label>
        <Input
          id="sleep_hours"
          name="sleep_hours"
          type="number"
          min="0"
          max="24"
          step="0.5"
          defaultValue={values.sleep_hours}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pain_notes">Pain or discomfort</Label>
        <Textarea id="pain_notes" name="pain_notes" rows={3} maxLength={500} defaultValue={values.pain_notes} />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : existingResult ? "Save changes" : "Save result"}
      </Button>
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
