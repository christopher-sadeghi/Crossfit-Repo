"use client";

import { startTransition, useActionState, useState } from "react";
import { Plus, Check, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectClass } from "@/app/(app)/programs/options";
import { addFoodIdea, deleteOwnFood, requestFoodIdeas, saveFoodPreferences } from "@/lib/ai/food-idea-actions";
import { ideaText, matchedAllergies } from "@/lib/ai/food-safety";
import type { FoodIdeas } from "@/lib/ai/suggest-food";
import type { FormState } from "@/lib/auth/form-state";
import { COOKING_OPTIONS, DIET_TYPES, type FoodPreferences } from "@/lib/food-preferences";
import { MEAL_LABELS, MEALS } from "@/lib/nutrition";

function Message({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="text-sm text-destructive">{state.error}</p>;
  if (state.message) return <p role="status" className="text-sm text-emerald-600">{state.message}</p>;
  return null;
}

function submit(formAction: (data: FormData) => void) {
  return (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  };
}

export function FoodPreferencesForm({ athleteId, prefs }: { athleteId: string; prefs: FoodPreferences }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    (previous, data) => saveFoodPreferences(athleteId, previous, data),
    {},
  );
  return (
    <form onSubmit={submit(formAction)} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="diet_type">Diet type</Label>
          <select id="diet_type" name="diet_type" className={selectClass} defaultValue={prefs.diet_type}>
            {DIET_TYPES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cooking_minutes">Time to cook</Label>
          <select id="cooking_minutes" name="cooking_minutes" className={selectClass} defaultValue={prefs.cooking_minutes == null ? "" : String(prefs.cooking_minutes)}>
            {COOKING_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="allergies">Allergies</Label>
        <Textarea id="allergies" name="allergies" rows={2} maxLength={1000} placeholder="e.g. peanuts, shellfish" defaultValue={prefs.allergies.join(", ")} />
        <p className="text-xs text-muted-foreground">Separate with commas. Food ideas containing these are always removed.</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="dislikes">Foods they dislike</Label>
        <Textarea id="dislikes" name="dislikes" rows={2} maxLength={1000} placeholder="e.g. mushrooms, olives" defaultValue={prefs.dislikes.join(", ")} />
      </div>
      <Message state={state} />
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Saving…" : "Save preferences"}
      </Button>
    </form>
  );
}

export function SuggestFoodForm({ athleteId, date }: { athleteId: string; date: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    (previous, data) => requestFoodIdeas(athleteId, previous, data),
    {},
  );
  return (
    <form onSubmit={submit(formAction)} className="grid gap-3">
      <input type="hidden" name="date" value={date} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="food-idea-meal">For</Label>
          <select id="food-idea-meal" name="meal" className={selectClass} defaultValue="">
            <option value="">Any meal or snack</option>
            {MEALS.map((meal) => (
              <option key={meal} value={meal}>{MEAL_LABELS[meal]}</option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Thinking… this can take up to 30 seconds" : "Suggest food"}
        </Button>
      </div>
      <Message state={state} />
    </form>
  );
}

function AddIdeaButton({ suggestionId, index, name, added }: { suggestionId: string; index: number; name: string; added: boolean }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(() => addFoodIdea(suggestionId, index), {});
  if (added)
    return (
      <p className="inline-flex items-center gap-1 text-sm text-emerald-600">
        <Check className="size-4" /> In the food log
      </p>
    );
  return (
    <form onSubmit={submit(formAction)} className="grid justify-items-start gap-1">
      <Button type="submit" size="sm" disabled={pending} aria-label={`Add ${name} to the food log`}>
        <Plus /> {pending ? "Adding…" : "Add to food log"}
      </Button>
      <Message state={state} />
    </form>
  );
}

export function FoodIdeaList({
  id,
  ideas,
  addedNames,
  allergies = [],
}: {
  id: string;
  ideas: FoodIdeas;
  addedNames: string[];
  allergies?: string[];
}) {
  // Ideas made before the allergy list changed are re-checked and hidden if they now match.
  const outdated = ideas.ideas.map((idea) => matchedAllergies(ideaText(idea), allergies));
  const hiddenAllergies = [...new Set(outdated.flat())];
  const hiddenCount = outdated.filter((hits) => hits.length).length;
  return (
    <div className="grid gap-3">
      {ideas.note && <p className="text-sm">{ideas.note}</p>}
      <ul className="grid gap-3">
        {ideas.ideas.map((idea, index) => outdated[index].length ? null : (
          <li key={`${index}-${idea.name}`} className="grid gap-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="min-w-0 font-medium break-words">{idea.name}</p>
              <p className="text-xs text-muted-foreground">
                {MEAL_LABELS[idea.meal]} · {idea.prep_minutes === 0 ? "no cooking" : `${idea.prep_minutes} min`}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">{idea.description}</p>
            <p className="text-sm">
              ~{idea.calories} kcal · P {idea.protein_g}g · C {idea.carbs_g}g · F {idea.fat_g}g
            </p>
            <p className="text-xs text-muted-foreground">Ingredients: {idea.ingredients.join(", ")}</p>
            <AddIdeaButton suggestionId={id} index={index} name={idea.name} added={addedNames.includes(idea.name)} />
          </li>
        ))}
      </ul>
      {hiddenCount ? (
        <p className="text-xs text-muted-foreground">
          {hiddenCount} idea{hiddenCount === 1 ? " is" : "s are"} hidden because {hiddenCount === 1 ? "it matches" : "they match"} the current allergy list ({hiddenAllergies.join(", ")}).
        </p>
      ) : null}
      {ideas.removed?.length ? (
        <p className="text-xs text-muted-foreground">
          Safety check: {ideas.removed.length} idea{ideas.removed.length === 1 ? " was" : "s were"} removed because{" "}
          {ideas.removed.length === 1 ? "it" : "they"} matched an allergy ({[...new Set(ideas.removed.flatMap((r) => r.allergies))].join(", ")}).
        </p>
      ) : null}
    </div>
  );
}

export function DeleteOwnFoodButton({ id, name }: { id: string; name: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex shrink-0 flex-col items-end">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remove ${name}`}
        onClick={() => {
          if (confirm(`Remove "${name}" from your food log?`))
            startTransition(async () => {
              const result = await deleteOwnFood(id);
              setError(result.error ?? null);
            });
        }}
      >
        <Trash2 />
      </Button>
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
