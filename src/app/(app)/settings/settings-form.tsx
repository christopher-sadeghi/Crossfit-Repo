"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { updateProfile } from "./actions";

type Props = {
  fullName: string;
  gymName: string;
  units: "lb" | "kg";
};

const UNIT_OPTIONS = [
  { value: "lb", label: "Pounds (lb)" },
  { value: "kg", label: "Kilograms (kg)" },
] as const;

export function SettingsForm({ fullName, gymName, units }: Props) {
  const [state, formAction, pending] = useActionState(updateProfile, {});

  return (
    <form action={formAction} className="grid max-w-md gap-5">
      <div className="grid gap-2">
        <Label htmlFor="full_name">Your name</Label>
        <Input id="full_name" name="full_name" defaultValue={fullName} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="gym_name">Gym name</Label>
        <Input id="gym_name" name="gym_name" defaultValue={gymName} placeholder="e.g. CrossFit Riverside" />
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Weight units</legend>
        <div className="flex gap-3">
          {UNIT_OPTIONS.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <input type="radio" name="units" value={o.value} defaultChecked={units === o.value} className="accent-primary" />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>
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
