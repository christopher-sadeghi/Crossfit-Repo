"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_LOAD_WARNING_RATIO, MIN_WARNING_LOAD } from "@/lib/training-load";

import { updateProfile } from "./actions";

type Props = {
  fullName: string;
  gymName: string;
  units: "lb" | "kg";
  driftDays: number;
  loadWarningRatio: number;
  role: "owner" | "coach";
};

const UNIT_OPTIONS = [
  { value: "lb", label: "Pounds (lb)" },
  { value: "kg", label: "Kilograms (kg)" },
] as const;

export function SettingsForm({ fullName, gymName, units, driftDays, loadWarningRatio, role }: Props) {
  const [state, formAction, pending] = useActionState(updateProfile, {});
  const values = state.values;

  return (
    <form action={formAction} className="grid max-w-md gap-5">
      <div className="grid gap-2">
        <Label htmlFor="full_name">Your name</Label>
        <Input id="full_name" name="full_name" defaultValue={values?.full_name ?? fullName} required />
      </div>
      {role === "owner" && <div className="grid gap-2">
        <Label htmlFor="gym_name">Gym name</Label>
        <Input id="gym_name" name="gym_name" defaultValue={values?.gym_name ?? gymName} placeholder="e.g. CrossFit Riverside" />
      </div>}
      {role === "owner" && <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Weight units</legend>
        <div className="flex gap-3">
          {UNIT_OPTIONS.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <input type="radio" name="units" value={o.value} defaultChecked={(values?.units ?? units) === o.value} className="accent-primary" />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>}
      {role === "owner" && <div className="grid gap-2">
        <Label htmlFor="drift_days">Flag athletes as drifting after X days with no activity</Label>
        <Input id="drift_days" name="drift_days" type="number" min={1} max={60} step={1} required defaultValue={values?.drift_days ?? driftDays} />
        <p className="text-xs text-muted-foreground">Choose 1–60 days. A drop in completion can also flag an athlete.</p>
      </div>}
      {role === "owner" && <div className="grid gap-2">
        <Label htmlFor="load_warning_ratio">Training load warning ratio</Label>
        <Input id="load_warning_ratio" name="load_warning_ratio" type="number" min={0} step="any" required defaultValue={values?.load_warning_ratio ?? loadWarningRatio} />
        <p className="text-xs text-muted-foreground">Warn when last week&apos;s load is above this multiple of the 28-day weekly average and reaches {MIN_WARNING_LOAD} load. Default: {DEFAULT_LOAD_WARNING_RATIO}×.</p>
      </div>}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
