"use client";

import { startTransition, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GOAL_TYPE_LABELS, GOAL_TYPES, TRACKING, TRACKING_LABELS, type Tracking } from "@/lib/progress";
import type { Units } from "@/lib/units";

import { Status, useForm } from "../../../nutrition/forms";
import { selectClass } from "../../../programs/options";
import { deleteGoal, deleteMetric, logMetric, saveGoal, setGoalStatus } from "./actions";

export function MetricForm({ athleteId, today, units }: { athleteId: string; today: string; units: Units }) {
  const { state, pending, values: v, formProps } = useForm(logMetric);
  return (
    <form key={formProps.key} onSubmit={formProps.onSubmit} className="grid gap-3">
      <input type="hidden" name="athlete_id" value={athleteId} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="measured_on">Date</Label>
          <Input id="measured_on" name="measured_on" type="date" required max={today} defaultValue={v.measured_on ?? today} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="weight">Weight ({units})</Label>
          <Input id="weight" name="weight" type="number" min="0" step="0.1" defaultValue={v.weight} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="body_fat_pct">Body fat %</Label>
          <Input id="body_fat_pct" name="body_fat_pct" type="number" min="1" max="75" step="0.1" defaultValue={v.body_fat_pct} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="metric_notes">Notes</Label>
        <Input id="metric_notes" name="notes" maxLength={500} placeholder="e.g. Morning, fasted" defaultValue={v.notes} />
      </div>
      <Status state={state} />
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Saving…" : "Log measurement"}
      </Button>
    </form>
  );
}

export function DeleteMetricButton({ id, label }: { id: string; label: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`Delete measurement from ${label}`}
      onClick={() => {
        if (confirm(`Delete the measurement from ${label}?`)) startTransition(() => deleteMetric(id));
      }}
    >
      <Trash2 />
    </Button>
  );
}

export type GoalDefaults = {
  id: string;
  title: string;
  goal_type: (typeof GOAL_TYPES)[number];
  tracking: Tracking;
  movement_id: string | null;
  metric: string | null;
  unit: string | null;
  start_value: number | null;
  target_value: number | null;
  target_date: string | null;
};

const VALUE_UNIT: Record<Tracking, (units: Units, unit: string) => string> = {
  body_weight: (units) => units,
  body_fat: () => "%",
  max_load: (units) => units,
  max_reps: () => "reps",
  manual: (_, unit) => unit,
};

export function GoalForm({
  athleteId,
  units,
  movements,
  goal,
  onDone,
}: {
  athleteId: string;
  units: Units;
  movements: { id: string; name: string }[];
  goal?: GoalDefaults;
  onDone?: () => void;
}) {
  const { state, pending, values: v, formProps } = useForm(saveGoal, onDone);
  const [tracking, setTracking] = useState<Tracking>((v.tracking as Tracking) ?? goal?.tracking ?? "max_load");
  const [unit, setUnit] = useState(v.unit ?? goal?.unit ?? "");
  const needsMovement = tracking === "max_load" || tracking === "max_reps";
  const suffix = VALUE_UNIT[tracking](units, unit);
  const p = goal?.id ?? "new";

  return (
    <form key={formProps.key} onSubmit={formProps.onSubmit} className="grid gap-3" aria-label={goal ? `Edit ${goal.title}` : "New goal"}>
      {goal && <input type="hidden" name="id" value={goal.id} />}
      <input type="hidden" name="athlete_id" value={athleteId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`title-${p}`}>Goal</Label>
          <Input id={`title-${p}`} name="title" required maxLength={120} placeholder="e.g. Back squat 120 kg" defaultValue={v.title ?? goal?.title} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`goal_type-${p}`}>Type</Label>
          <select id={`goal_type-${p}`} name="goal_type" className={selectClass} defaultValue={v.goal_type ?? goal?.goal_type ?? "performance"}>
            {GOAL_TYPES.map((t) => (
              <option key={t} value={t}>
                {GOAL_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`tracking-${p}`}>Progress measured by</Label>
          <select id={`tracking-${p}`} name="tracking" className={selectClass} value={tracking} onChange={(e) => setTracking(e.target.value as Tracking)}>
            {TRACKING.map((t) => (
              <option key={t} value={t}>
                {TRACKING_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        {needsMovement && (
          <div className="grid gap-1.5">
            <Label htmlFor={`movement-${p}`}>Movement</Label>
            <select id={`movement-${p}`} name="movement_id" className={selectClass} required defaultValue={v.movement_id ?? goal?.movement_id ?? ""}>
              <option value="" disabled>
                Choose a movement
              </option>
              {movements.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {(needsMovement || tracking === "manual") && (
          <div className="grid gap-1.5">
            <Label htmlFor={`metric-${p}`}>What&apos;s measured (optional)</Label>
            <Input id={`metric-${p}`} name="metric" maxLength={60} placeholder={tracking === "max_load" ? "e.g. 1RM" : "e.g. unbroken reps"} defaultValue={v.metric ?? goal?.metric ?? ""} />
          </div>
        )}
        {tracking === "manual" && (
          <div className="grid gap-1.5">
            <Label htmlFor={`unit-${p}`}>Unit (optional)</Label>
            <Input id={`unit-${p}`} name="unit" maxLength={20} placeholder="e.g. m, min" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor={`start-${p}`}>Starting value{suffix && ` (${suffix})`}</Label>
          <Input id={`start-${p}`} name="start_value" type="number" min="0" step="0.1" defaultValue={v.start_value ?? goal?.start_value ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`target-${p}`}>Target{suffix && ` (${suffix})`}</Label>
          <Input id={`target-${p}`} name="target_value" type="number" min="0" step="0.1" required={tracking !== "manual"} defaultValue={v.target_value ?? goal?.target_value ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`target_date-${p}`}>Target date (optional)</Label>
          <Input id={`target_date-${p}`} name="target_date" type="date" defaultValue={v.target_date ?? goal?.target_date ?? ""} />
        </div>
      </div>
      <Status state={state} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : goal ? "Save goal" : "Add goal"}
        </Button>
        {onDone && (
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

export function GoalControls({
  athleteId,
  units,
  movements,
  goal,
  status,
  children,
}: {
  athleteId: string;
  units: Units;
  movements: { id: string; name: string }[];
  goal: GoalDefaults;
  status: "active" | "achieved" | "abandoned";
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) return <GoalForm athleteId={athleteId} units={units} movements={movements} goal={goal} onDone={() => setEditing(false)} />;

  const act = (fn: () => Promise<void>) => startTransition(fn);
  return (
    <>
      {children}
      <div className="flex flex-wrap gap-2">
        {status === "active" ? (
          <>
            <Button size="sm" onClick={() => act(() => setGoalStatus(goal.id, "achieved"))}>
              Mark achieved
            </Button>
            <Button size="sm" variant="outline" onClick={() => act(() => setGoalStatus(goal.id, "abandoned"))}>
              Close without achieving
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => act(() => setGoalStatus(goal.id, "active"))}>
            Reopen
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          <Pencil /> Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Delete ${goal.title}`}
          onClick={() => {
            if (confirm(`Delete the goal "${goal.title}"?`)) act(() => deleteGoal(goal.id));
          }}
        >
          <Trash2 /> Delete
        </Button>
      </div>
    </>
  );
}
