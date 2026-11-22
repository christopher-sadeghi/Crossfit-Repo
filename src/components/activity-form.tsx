"use client";

import { useActionState, useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveActivity } from "@/lib/activity-actions";
import { draftActivity } from "@/lib/ai/activity-draft";
import { ACTIVITY_TYPES, activityLabel, distanceUnit, fromActivityMeters, type ActivityDraft, type AthleteActivity } from "@/lib/athlete-activities";
import type { FormState } from "@/lib/auth/form-state";
import type { Units } from "@/lib/units";

type Props = { athleteId: string; today: string; defaultDate?: string; units: Units; activity?: AthleteActivity; initialDraft?: ActivityDraft };

function distanceValue(meters: number | null | undefined, units: Units) {
  return meters == null ? "" : String(Number(fromActivityMeters(meters, units).toPrecision(12)));
}

export function ActivityForm({ athleteId, today, defaultDate = today, units, activity, initialDraft }: Props) {
  const initialValues = {
    activity_type: activity?.activity_type ?? initialDraft?.activity_type ?? "",
    custom_label: activity?.custom_label ?? initialDraft?.custom_label ?? "",
    performed_on: activity?.performed_on ?? initialDraft?.performed_on ?? defaultDate,
    duration_minutes: String(activity?.duration_minutes ?? initialDraft?.duration_minutes ?? ""),
    rpe: String(activity?.rpe ?? initialDraft?.rpe ?? ""),
    distance: distanceValue(activity?.distance_m ?? initialDraft?.distance_m, units),
    notes: activity?.notes ?? "",
  };
  const [values, setValues] = useState(initialValues);
  const [description, setDescription] = useState("");
  const [draft, setDraft] = useState<ActivityDraft | null>(initialDraft ?? null);
  const [draftError, setDraftError] = useState("");
  const [draftPending, startDraft] = useTransition();
  const [state, action, pending] = useActionState(async (previous: FormState, data: FormData) => {
    try {
      const result = await saveActivity(athleteId, activity?.id ?? null, previous, data);
      if (!activity && result.message) {
        setValues(initialValues);
        setDraft(null);
        setDescription("");
        setDraftError("");
      }
      return result;
    } catch {
      return { error: "Couldn't save the activity. Please try again." };
    }
  }, {});
  const id = useId();

  function field(name: keyof typeof values) {
    return {
      name,
      value: values[name],
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { value } = event.target;
        setValues((current) => ({ ...current, [name]: value }));
      },
    };
  }

  function requestDraft() {
    setDraftError("");
    startDraft(async () => {
      try {
        const response = await draftActivity(athleteId, description);
        if ("error" in response) setDraftError(response.error);
        else {
          const next = response.draft;
          setDraft(next);
          setValues((current) => ({
            ...current,
            activity_type: next.activity_type,
            custom_label: next.custom_label ?? current.custom_label,
            performed_on: next.performed_on ?? current.performed_on,
            duration_minutes: String(next.duration_minutes ?? current.duration_minutes),
            rpe: String(next.rpe ?? current.rpe),
            distance: next.distance_m == null ? current.distance : distanceValue(next.distance_m, units),
          }));
        }
      } catch {
        setDraftError("AI couldn't draft this activity. You can still fill out the form by hand.");
      }
    });
  }

  if (initialDraft && state.message) return <p role="status" className="text-sm">{state.message}</p>;

  return (
    <div className="grid gap-4">
      {!activity && !initialDraft && (
        <div className="grid gap-2 rounded-lg border p-3">
          <Label htmlFor={`${id}-description`}>Describe what you did</Label>
          <Textarea id={`${id}-description`} value={description} maxLength={1000}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Played 90 minutes of pickup basketball, pretty intense" />
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={requestDraft}
            disabled={draftPending || pending || !description.trim()}>{draftPending ? "Drafting…" : "Fill with AI"}</Button>
          {draftError && <p className="text-sm text-destructive" role="alert">{draftError}</p>}
          {draft && <p className="text-sm text-muted-foreground" role="status">AI draft ready. Review or edit the fields below, then confirm to save.</p>}
        </div>
      )}
      <form action={action} className="grid gap-3">
        <fieldset className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2" disabled={pending || draftPending}>
          <input type="hidden" name="source" value={draft ? "ai" : activity?.source ?? "manual"} />
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-type`}>Activity type</Label>
            <select id={`${id}-type`} {...field("activity_type")} required className="h-9 w-full rounded-md border bg-background px-3 text-sm">
              <option value="" disabled>Choose a type</option>
              {ACTIVITY_TYPES.map((type) => <option key={type} value={type}>{activityLabel({ activity_type: type, custom_label: null })}</option>)}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-label`}>Activity name (optional)</Label>
            <Input id={`${id}-label`} {...field("custom_label")} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-date`}>Date</Label>
            <Input id={`${id}-date`} {...field("performed_on")} type="date" max={today} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-duration`}>Duration (minutes)</Label>
            <Input id={`${id}-duration`} {...field("duration_minutes")} type="number" min={1} max={1440} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-rpe`}>Session RPE (1–10)</Label>
            <Input id={`${id}-rpe`} {...field("rpe")} type="number" min={1} max={10} required aria-describedby={`${id}-effort`} />
            <p id={`${id}-effort`} className="text-xs text-muted-foreground">1 = very easy, 10 = maximum effort.</p>
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor={`${id}-distance`}>Distance ({distanceUnit(units)}, optional)</Label>
            <Input id={`${id}-distance`} {...field("distance")} type="number" min={0} step="any" />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor={`${id}-notes`}>Notes (optional)</Label>
            <Textarea id={`${id}-notes`} {...field("notes")} maxLength={500} />
          </div>
        </fieldset>
        {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
        {state.message && <p role="status" className="text-sm text-muted-foreground">{state.message}</p>}
        <Button type="submit" className="w-fit" disabled={pending || draftPending}>
          {pending ? "Saving…" : activity ? "Save changes" : draft ? "Confirm and save activity" : "Save activity"}
        </Button>
      </form>
    </div>
  );
}
