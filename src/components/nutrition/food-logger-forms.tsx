"use client";

import { useEffect, useState, useTransition } from "react";

import { selectClass } from "@/app/(app)/programs/options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/lib/auth/form-state";
import { logFood, saveFoodToLibrary, saveMealFromLog } from "@/lib/food-log-actions";
import { MEALS, MEAL_LABELS, type Meal } from "@/lib/nutrition";

export function FoodMessage({ state }: { state: FormState }) {
  return state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : state.message ? <p role="status" className="text-sm text-emerald-600">{state.message}</p> : null;
}

export function defaultMeal(): Meal {
  const hour = new Date().getHours();
  return hour < 10 ? "breakfast" : hour < 15 ? "lunch" : hour < 20 ? "dinner" : "snack";
}

export function MealSelect({ value, onChange }: { value: Meal; onChange: (meal: Meal) => void }) {
  return <div className="grid min-w-0 gap-1.5"><Label htmlFor="logger-meal">Meal</Label><select id="logger-meal" name="meal" className={`${selectClass} w-full min-w-0`} value={value} onChange={event => onChange(event.target.value as Meal)}>{MEALS.map(meal => <option key={meal} value={meal}>{MEAL_LABELS[meal]}</option>)}</select></div>;
}

function FoodFields({ custom }: { custom: boolean }) {
  return <>
    <div className="grid gap-1.5"><Label htmlFor="logger-name">Food name</Label><Input id="logger-name" name="name" required maxLength={120} /></div>
    {custom && <div className="grid gap-1.5"><Label htmlFor="logger-brand">Brand (optional)</Label><Input id="logger-brand" name="brand" maxLength={120} /></div>}
    <div className="grid gap-1.5"><Label htmlFor="logger-serving">Serving</Label><Input id="logger-serving" name="serving" required maxLength={custom ? 80 : 120} placeholder="e.g. 1 cup (245 g)" /></div>
    <div className="grid grid-cols-2 gap-3">
      {([["calories", "Calories (kcal)"], ["protein_g", "Protein (g)"], ["carbs_g", "Carbs (g)"], ["fat_g", "Fat (g)"]] as const).map(([key, label]) => <div key={key} className="grid min-w-0 gap-1.5"><Label htmlFor={`logger-${key}`}>{label}</Label><Input id={`logger-${key}`} name={key} type="number" min={0} max={key === "calories" ? 10000 : 99999.9} step={key === "calories" ? 1 : 0.1} required /></div>)}
    </div>
    {custom && <div className="grid gap-1.5"><Label htmlFor="logger-ingredients">Ingredients (optional)</Label><Textarea id="logger-ingredients" name="ingredients" maxLength={2000} rows={2} /></div>}
  </>;
}

function readFood(form: HTMLFormElement) {
  const data = new FormData(form);
  return { name: String(data.get("name") ?? ""), serving: String(data.get("serving") ?? ""), brand: String(data.get("brand") ?? "") || null, ingredients: String(data.get("ingredients") ?? "") || null, calories: Number(data.get("calories")), protein_g: Number(data.get("protein_g")), carbs_g: Number(data.get("carbs_g")), fat_g: Number(data.get("fat_g")) };
}

export function ManualFoodForm({ athleteId, date }: { athleteId: string; date: string }) {
  const [meal, setMeal] = useState<Meal>("breakfast");
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  useEffect(() => setMeal(defaultMeal()), []);
  return <form className="grid gap-3" onSubmit={event => {
    event.preventDefault();
    const form = event.currentTarget;
    const food = readFood(form);
    start(async () => {
      try { const result = await logFood(athleteId, { ...food, date, meal }); setState(result); if (!result.error) form.reset(); }
      catch { setState({ error: "Couldn't add the food. Please try again." }); }
    });
  }}><FoodFields custom={false} /><MealSelect value={meal} onChange={setMeal} /><FoodMessage state={state} /><Button disabled={pending} className="justify-self-start">{pending ? "Adding…" : "Add to log"}</Button></form>;
}

export function CustomFoodForm({ athleteId }: { athleteId: string }) {
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  return <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">New custom food</summary><form className="mt-3 grid gap-3" onSubmit={event => {
    event.preventDefault();
    const form = event.currentTarget;
    const { serving, ...food } = readFood(form);
    start(async () => {
      try { const result = await saveFoodToLibrary(athleteId, { ...food, serving_label: serving, kind: "custom", is_favorite: false, source: "custom" }); setState(result); if (!result.error) form.reset(); }
      catch { setState({ error: "Couldn't save the food. Please try again." }); }
    });
  }}><FoodFields custom /><FoodMessage state={state} /><Button disabled={pending} className="justify-self-start">{pending ? "Saving…" : "Save custom food"}</Button></form></details>;
}

export type MealEntry = { id: string; food_name: string };
export function MealBuilder({ athleteId, date, entries }: { athleteId: string; date: string; entries: MealEntry[] }) {
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  if (!entries.length) return null;
  return <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">Save a meal from this day&apos;s log</summary><form className="mt-3 grid gap-3" onSubmit={event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    start(async () => {
      try { const result = await saveMealFromLog(athleteId, date, String(data.get("name") ?? ""), data.getAll("entries").map(String)); setState(result); if (!result.error) form.reset(); }
      catch { setState({ error: "Couldn't save the meal. Please try again." }); }
    });
  }}><div className="grid gap-1.5"><Label htmlFor="saved-meal-name">Meal name</Label><Input id="saved-meal-name" name="name" required maxLength={120} /></div><fieldset className="grid min-w-0 gap-2"><legend className="mb-2 text-sm">Choose food entries</legend>{entries.map(entry => <label key={entry.id} className="flex min-w-0 items-start gap-2 text-sm"><input className="mt-1 shrink-0" type="checkbox" name="entries" value={entry.id} /><span className="min-w-0 break-words">{entry.food_name}</span></label>)}</fieldset><FoodMessage state={state} /><Button disabled={pending} className="justify-self-start">{pending ? "Saving…" : "Save meal"}</Button></form></details>;
}
