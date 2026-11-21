"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { CATEGORIES, CATEGORY_LABELS, MEASURE_LABELS, MEASURES, selectClass } from "../options";
import { addMovement } from "./actions";

export function MovementForm() {
  const [state, formAction, pending] = useActionState(addMovement, {});

  return (
    <form action={formAction} className="grid gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" defaultValue={state.values?.name} placeholder="e.g. Sandbag Clean" className="w-56" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="category">Category</Label>
          <select id="category" name="category" defaultValue={state.values?.category ?? "weightlifting"} className={selectClass}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="measure">Measured in</Label>
          <select id="measure" name="measure" defaultValue={state.values?.measure ?? "reps"} className={selectClass}>
            {MEASURES.map((m) => (
              <option key={m} value={m}>
                {MEASURE_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add movement"}
        </Button>
      </div>
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
    </form>
  );
}
