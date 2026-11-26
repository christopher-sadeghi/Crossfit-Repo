"use client";

import { startTransition, useActionState, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableCell, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/lib/auth/form-state";
import { MEAL_LABELS, MEALS, type Meal } from "@/lib/nutrition";

import { selectClass } from "../programs/options";
import { deleteFood, saveFood, saveTarget } from "./actions";

type Tracked = FormState & { successes?: number };

// Submit manually so a failed submit keeps the inputs; remount after each success to reset them.
export function useForm(action: (s: FormState, d: FormData) => Promise<FormState>, onSuccess?: () => void) {
  const [state, formAction, pending] = useActionState<Tracked, FormData>(async (prev, data) => {
    const next = await action(prev, data);
    if (!next.error) onSuccess?.();
    return { ...next, successes: (prev.successes ?? 0) + (next.error ? 0 : 1) };
  }, {});
  const values = state.error ? (state.values ?? {}) : {};
  return {
    state,
    pending,
    values,
    formProps: {
      key: `${state.successes ?? 0}-${JSON.stringify(values)}`,
      onSubmit: (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      },
    },
  };
}

export function Status({ state }: { state: FormState }) {
  if (state.error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <p role="status" className="text-sm text-emerald-600">
        {state.message}
      </p>
    );
  return null;
}

function Num({ name, label, defaultValue, step = "1" }: { name: string; label: string; defaultValue?: string | number; step?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type="number" min="0" step={step} required defaultValue={defaultValue} />
    </div>
  );
}

export function TargetForm({
  athleteId,
  current,
  today,
}: {
  athleteId: string;
  current: { calories: number; protein_g: number; carbs_g: number; fat_g: number; notes: string | null; start_date: string } | null;
  today: string;
}) {
  const { state, pending, values: v, formProps } = useForm(saveTarget);
  return (
    <form key={formProps.key} onSubmit={formProps.onSubmit} className="grid gap-3">
      <input type="hidden" name="athlete_id" value={athleteId} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Num name="calories" label="Calories" defaultValue={v.calories ?? current?.calories} />
        <Num name="protein_g" label="Protein (g)" defaultValue={v.protein_g ?? current?.protein_g} />
        <Num name="carbs_g" label="Carbs (g)" defaultValue={v.carbs_g ?? current?.carbs_g} />
        <Num name="fat_g" label="Fat (g)" defaultValue={v.fat_g ?? current?.fat_g} />
      </div>
      <div className="grid gap-1.5 sm:max-w-48">
        <Label htmlFor="start_date">Starts on</Label>
        <Input id="start_date" name="start_date" type="date" required defaultValue={v.start_date ?? today} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="target_notes">Notes</Label>
        <Textarea id="target_notes" name="notes" rows={2} maxLength={500} placeholder="e.g. Cut 200 kcal for competition prep" defaultValue={v.notes ?? (current?.start_date === today ? (current.notes ?? undefined) : undefined)} />
      </div>
      <Status state={state} />
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Saving…" : current ? "Save new target" : "Set target"}
      </Button>
    </form>
  );
}

export type FoodEntry = {
  id: string;
  meal: Meal;
  food_name: string;
  serving?: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

function FoodFields({ v, entry }: { v: Record<string, string>; entry?: FoodEntry }) {
  return (
    <>
      <div className="grid gap-1.5">
        <Label htmlFor={`meal-${entry?.id ?? "new"}`}>Meal</Label>
        <select id={`meal-${entry?.id ?? "new"}`} name="meal" className={selectClass} defaultValue={v.meal ?? entry?.meal ?? "breakfast"}>
          {MEALS.map((m) => (
            <option key={m} value={m}>
              {MEAL_LABELS[m]}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor={`food-${entry?.id ?? "new"}`}>Food</Label>
        <Input id={`food-${entry?.id ?? "new"}`} name="food_name" required maxLength={120} placeholder="e.g. Greek yogurt + berries" defaultValue={v.food_name ?? entry?.food_name} />
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor={`serving-${entry?.id ?? "new"}`}>Serving (optional)</Label>
        <Input id={`serving-${entry?.id ?? "new"}`} name="serving" maxLength={120} defaultValue={v.serving ?? entry?.serving ?? ""} placeholder="e.g. 1 cup (245 g)" />
      </div>
      {(
        [
          ["calories", "kcal", "1"],
          ["protein_g", "Protein g", "0.1"],
          ["carbs_g", "Carbs g", "0.1"],
          ["fat_g", "Fat g", "0.1"],
        ] as const
      ).map(([name, label, step]) => (
        <div key={name} className="grid gap-1.5">
          <Label htmlFor={`${name}-${entry?.id ?? "new"}`}>{label}</Label>
          <Input id={`${name}-${entry?.id ?? "new"}`} name={name} type="number" min="0" step={step} required defaultValue={v[name] ?? entry?.[name]} />
        </div>
      ))}
    </>
  );
}

export function AddFoodForm({ athleteId, date }: { athleteId: string; date: string }) {
  const { state, pending, values: v, formProps } = useForm(saveFood);
  return (
    <form key={formProps.key} onSubmit={formProps.onSubmit} className="grid gap-3">
      <input type="hidden" name="athlete_id" value={athleteId} />
      <input type="hidden" name="logged_on" value={date} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-7">
        <FoodFields v={v} />
      </div>
      <Status state={state} />
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Adding…" : "Add entry"}
      </Button>
    </form>
  );
}

export function FoodRow({ athleteId, date, entry }: { athleteId: string; date: string; entry: FoodEntry }) {
  const [editing, setEditing] = useState(false);
  const { state, pending, values: v, formProps } = useForm(saveFood, () => setEditing(false));

  if (editing)
    return (
      <TableRow>
        <TableCell colSpan={7} className="p-3">
          <form key={formProps.key} onSubmit={formProps.onSubmit} className="grid gap-3" aria-label={`Edit ${entry.food_name}`}>
            <input type="hidden" name="id" value={entry.id} />
            <input type="hidden" name="athlete_id" value={athleteId} />
            <input type="hidden" name="logged_on" value={date} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-7">
              <FoodFields v={v} entry={entry} />
            </div>
            <Status state={state} />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </TableCell>
      </TableRow>
    );

  return (
    <TableRow>
      <TableCell className="hidden pl-4 text-muted-foreground sm:table-cell">{MEAL_LABELS[entry.meal]}</TableCell>
      <TableCell className="pl-4 font-medium whitespace-normal">
        <span className="text-xs font-normal text-muted-foreground sm:hidden">{MEAL_LABELS[entry.meal]} · </span>
        {entry.food_name}
        {entry.serving && <p className="text-xs font-normal text-muted-foreground">{entry.serving}</p>}
      </TableCell>
      <TableCell className="whitespace-normal">
        {entry.calories}
        <p className="text-xs text-muted-foreground sm:hidden">
          P {Number(entry.protein_g)} · C {Number(entry.carbs_g)} · F {Number(entry.fat_g)}
        </p>
      </TableCell>
      <TableCell className="hidden sm:table-cell">{Number(entry.protein_g)}g</TableCell>
      <TableCell className="hidden sm:table-cell">{Number(entry.carbs_g)}g</TableCell>
      <TableCell className="hidden sm:table-cell">{Number(entry.fat_g)}g</TableCell>
      <TableCell className="w-20 px-1 text-right sm:w-24 sm:px-2">
        <Button type="button" variant="ghost" size="icon" className="size-8 sm:size-9" aria-label={`Edit ${entry.food_name}`} onClick={() => setEditing(true)}>
          <Pencil />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 sm:size-9"
          aria-label={`Delete ${entry.food_name}`}
          onClick={() => {
            if (confirm(`Delete "${entry.food_name}"?`)) startTransition(() => deleteFood(entry.id));
          }}
        >
          <Trash2 />
        </Button>
      </TableCell>
    </TableRow>
  );
}
