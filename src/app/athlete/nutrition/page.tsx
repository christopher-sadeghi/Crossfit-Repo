import { redirect } from "next/navigation";

import { DeleteOwnFoodButton, FoodIdeaList, FoodPreferencesForm, SuggestFoodForm } from "@/components/nutrition/food-ideas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FOOD_DISCLAIMER } from "@/lib/ai/suggest-food";
import { readPreferences } from "@/lib/food-preferences";
import { latestFoodIdeas } from "@/lib/food-ideas";
import { MEAL_LABELS, MEALS, targetOn, totals } from "@/lib/nutrition";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/time-zone";
import { getViewer } from "@/lib/viewer";

export default async function AthleteNutritionPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.kind === "coach") redirect("/");
  if (viewer.kind === "none") redirect("/no-access");

  const today = await getToday();
  const supabase = await createClient();
  const [{ data: targets }, { data: food }, { data: prefsRow }, ideas] = await Promise.all([
    supabase.from("nutrition_targets").select("calories, protein_g, carbs_g, fat_g, start_date, end_date").eq("athlete_id", viewer.athleteId),
    supabase
      .from("food_logs")
      .select("id, logged_on, meal, food_name, calories, protein_g, carbs_g, fat_g")
      .eq("athlete_id", viewer.athleteId)
      .eq("logged_on", today)
      .order("created_at"),
    supabase.from("athlete_food_preferences").select("diet_type, allergies, dislikes, cooking_minutes").eq("athlete_id", viewer.athleteId).maybeSingle(),
    latestFoodIdeas(supabase, viewer.athleteId, today),
  ]);

  const target = targetOn(targets ?? [], today);
  const entries = [...(food ?? [])].sort((a, b) => MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal));
  const eaten = totals(entries);
  const prefs = readPreferences(prefsRow);
  const rows = [
    ["Calories", eaten.calories, target?.calories, " kcal"],
    ["Protein", eaten.protein, target ? Number(target.protein_g) : undefined, "g"],
    ["Carbs", eaten.carbs, target ? Number(target.carbs_g) : undefined, "g"],
    ["Fat", eaten.fat, target ? Number(target.fat_g) : undefined, "g"],
  ] as const;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6">
      <section className="grid gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Nutrition</h1>
          <p className="text-sm text-muted-foreground">Today · {target ? "eaten vs. your coach's targets" : "your coach hasn't set targets yet"}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {rows.map(([label, value, goal, unit]) => (
            <Card key={label} className="gap-1 py-3">
              <CardContent className="px-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-semibold">
                  {Math.round(value)}
                  {goal != null ? ` / ${goal}` : ""}
                  {unit}
                </p>
                {goal != null && <p className="text-xs text-muted-foreground">{Math.max(0, Math.round(goal - value))}{unit} left</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Food ideas</CardTitle>
          <p className="text-sm text-muted-foreground">Ideas that fit what&apos;s left of today&apos;s macros, your goals and your food preferences. Nothing is logged until you tap to add it.</p>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SuggestFoodForm athleteId={viewer.athleteId} date={today} />
          {ideas && <FoodIdeaList id={ideas.id} ideas={ideas.ideas} addedNames={ideas.addedNames} />}
          <p className="text-xs text-muted-foreground">{FOOD_DISCLAIMER}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s food log</CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length ? (
            <ul className="grid grid-cols-1 gap-2">
              {entries.map((entry) => (
                <li key={entry.id} className="flex min-w-0 items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{entry.food_name}</p>
                    <p className="text-xs break-words text-muted-foreground">
                      {MEAL_LABELS[entry.meal]} · {entry.calories} kcal · P {Number(entry.protein_g)}g · C {Number(entry.carbs_g)}g · F {Number(entry.fat_g)}g
                    </p>
                  </div>
                  <DeleteOwnFoodButton id={entry.id} name={entry.food_name} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing logged yet today.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Food preferences</CardTitle>
          <p className="text-sm text-muted-foreground">Your coach sees these too and can update them.</p>
        </CardHeader>
        <CardContent>
          <FoodPreferencesForm key={JSON.stringify(prefs)} athleteId={viewer.athleteId} prefs={prefs} />
        </CardContent>
      </Card>
    </div>
  );
}
