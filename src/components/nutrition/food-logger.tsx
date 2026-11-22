"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Star, Trash2, X } from "lucide-react";

import { selectClass } from "@/app/(app)/programs/options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { matchedAllergies } from "@/lib/ai/food-safety";
import type { FormState } from "@/lib/auth/form-state";
import type { FoodItem, FoodServing } from "@/lib/food-db/types";
import { foodIngredients } from "@/lib/food-ingredients";
import type { loadFoodLibrary } from "@/lib/food-library";
import { deleteSavedFood, logFood, saveFoodToLibrary, setFavorite } from "@/lib/food-log-actions";
import type { Meal } from "@/lib/nutrition";

import { BarcodeScanner } from "./barcode-scanner";
import { CustomFoodForm, defaultMeal, FoodMessage, MealBuilder, MealSelect, type MealEntry } from "./food-logger-forms";

type Library = Awaited<ReturnType<typeof loadFoodLibrary>>;
type Saved = Library["saved"][number];
type Candidate = Omit<FoodItem, "key" | "source" | "sourceId"> & {
  key: string;
  source: "usda" | "off" | "custom" | "log";
  sourceId: string | null;
  savedId?: string;
};
type Props = Library & { athleteId: string; date: string; allergies: string[]; todayEntries: MealEntry[]; manual: ReactNode };

function fromSaved(food: Saved): Candidate {
  return { key: `saved:${food.id}`, savedId: food.id, source: food.source as Candidate["source"], sourceId: food.source_id, name: food.name, brand: food.brand, ingredients: food.ingredients, allergens: [], servings: [{ label: food.serving_label, grams: null, calories: food.calories, protein_g: food.protein_g, carbs_g: food.carbs_g, fat_g: food.fat_g }] };
}
function fromRecent(food: Library["recent"][number]): Candidate {
  return { key: `recent:${food.id}`, source: "log", sourceId: null, name: food.food_name, brand: null, ingredients: food.ingredients, allergens: [], servings: [{ label: food.serving || "1 serving", grams: null, calories: food.calories, protein_g: food.protein_g, carbs_g: food.carbs_g, fat_g: food.fat_g }] };
}
function servingLabel(serving: FoodServing) {
  return serving.grams && !/\bg\b/i.test(serving.label) ? `${serving.label} (${serving.grams} g)` : serving.label;
}
function scaled(serving: FoodServing, quantity: number) {
  return { calories: Math.round(serving.calories * quantity), protein_g: Math.round(serving.protein_g * quantity * 10) / 10, carbs_g: Math.round(serving.carbs_g * quantity * 10) / 10, fat_g: Math.round(serving.fat_g * quantity * 10) / 10 };
}
function MacroLine({ serving, quantity = 1 }: { serving: FoodServing; quantity?: number }) {
  const macros = scaled(serving, quantity);
  return <p className="text-xs break-words text-muted-foreground">{macros.calories} kcal · P {macros.protein_g.toFixed(1)}g · C {macros.carbs_g.toFixed(1)}g · F {macros.fat_g.toFixed(1)}g</p>;
}
function IncompleteNote({ serving }: { serving: FoodServing }) {
  return serving.incomplete?.length ? <p className="text-xs break-words text-amber-800">{serving.incomplete.join(", ")} not listed by the database — counted as 0; adjust in Manual if you know it.</p> : null;
}

export function FoodLogger({ athleteId, date, allergies, recent, saved, todayEntries, manual }: Props) {
  const [tab, setTab] = useState("search");
  const [items, setItems] = useState<FoodItem[]>([]);
  const [searched, setSearched] = useState(false);
  const [lookupState, setLookupState] = useState<FormState>({});
  const [lookupPending, setLookupPending] = useState(false);
  const request = useRef<AbortController | null>(null);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const panel = useRef<HTMLElement>(null);
  const [servingIndex, setServingIndex] = useState(0);
  const [quantity, setQuantity] = useState("1");
  const [meal, setMeal] = useState<Meal>("breakfast");
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { if (selected) panel.current?.focus(); }, [selected]);

  const hits = (item: Candidate) => matchedAllergies([item.name, item.brand, item.ingredients, ...item.allergens].filter(Boolean).join(" "), allergies);
  function allergyWarning(item: Candidate) {
    const matches = hits(item);
    return matches.length ? <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs break-words text-amber-900">May contain {matches.join(", ")}. Check the label and ingredients before eating. You can still log this food.</p> : null;
  }
  function favoriteRow(item: Candidate, serving = item.servings[0]) {
    const macros = scaled(serving, 1);
    return saved.find(row => item.savedId ? row.id === item.savedId : item.sourceId ? row.source === item.source && row.source_id === item.sourceId : row.name === item.name && row.serving_label === servingLabel(serving).slice(0, 80) && row.source_id === null && Number(row.calories) === macros.calories && Number(row.protein_g) === macros.protein_g && Number(row.carbs_g) === macros.carbs_g && Number(row.fat_g) === macros.fat_g);
  }
  function run(action: () => Promise<FormState>) {
    setState({});
    start(async () => {
      try { setState(await action()); }
      catch { setState({ error: "Couldn't save the change. Please try again." }); }
    });
  }
  function showPanel(item: Candidate) {
    setSelected(item); setServingIndex(0); setQuantity("1"); setMeal(defaultMeal()); setState({});
  }
  function pick(item: Candidate) {
    if (item.source === "off" && !item.savedId) void lookup(`/api/foods/barcode/${item.sourceId}`, true, true).then(full => { if (full) showPanel(full); });
    else showPanel(item);
  }
  function add(item: Candidate, serving: FoodServing, amount: number, meal: Meal) {
    if (!Number.isFinite(amount) || amount < 0.25 || amount > 20) { setState({ error: "Choose a quantity between 0.25 and 20." }); return; }
    const ingredients = foodIngredients([item], 2000);
    if (ingredients === null) { setState({ error: "This food has too much allergy information to log safely. Enter it manually instead." }); return; }
    run(() => logFood(athleteId, { date, meal, name: item.name.slice(0, 120), ingredients, serving: (amount === 1 ? servingLabel(serving) : `${amount} × ${servingLabel(serving)}`).slice(0, 120), ...scaled(serving, amount) }));
  }
  function saveFavorite(item: Candidate, serving: FoodServing) {
    const row = favoriteRow(item, serving);
    const ingredients = foodIngredients([item], 8000);
    if (ingredients === null) { setState({ error: "This food has too much allergy information to save safely." }); return; }
    if (row) run(() => setFavorite(row.id, !row.is_favorite));
    else run(() => saveFoodToLibrary(athleteId, { kind: "food", is_favorite: true, name: item.name.slice(0, 120), brand: item.brand?.slice(0, 120) ?? null, ingredients, serving_label: servingLabel(serving).slice(0, 80), ...scaled(serving, 1), source: item.source, source_id: item.sourceId }));
  }
  function toggleFavorite(item: Candidate, serving = item.servings[0]) {
    if (item.source === "off" && !item.savedId && item !== selected) {
      void lookup(`/api/foods/barcode/${item.sourceId}`, true, true).then(full => { if (full) saveFavorite(full, full.servings[0]); });
    } else saveFavorite(item, serving);
  }
  function star(item: Candidate, serving?: FoodServing) {
    const on = favoriteRow(item, serving)?.is_favorite ?? false;
    return <Button type="button" size="icon" variant="ghost" className="shrink-0" disabled={pending || lookupPending} aria-label={`${on ? "Unfavorite" : "Favorite"} ${item.name}`} aria-pressed={on} onClick={() => toggleFavorite(item, serving)}><Star className={on ? "fill-amber-400 text-amber-600" : ""} /></Button>;
  }
  async function lookup(url: string, barcode: boolean, detailsOnly = false): Promise<FoodItem | undefined> {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLookupPending(true); setLookupState({}); setState({});
    if (!detailsOnly) { setItems([]); setSearched(false); setSelected(null); }
    try {
      const response = await fetch(url, { signal: controller.signal });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) setLookupState({ error: result.error || "Food lookup isn't available right now." });
      else if (barcode && result.item) { if (!detailsOnly) showPanel(result.item); return result.item; }
      else if (!detailsOnly) { setItems(result.items ?? []); setSearched(true); setLookupState({ message: result.notice }); }
    } catch {
      if (!controller.signal.aborted) setLookupState({ error: "Food lookup isn't available right now." });
    } finally { if (!controller.signal.aborted) setLookupPending(false); }
  }
  function changeTab(value: string) {
    request.current?.abort(); setLookupPending(false); setLookupState({}); setTab(value); setSelected(null); setState({});
  }
  function list(listItems: Candidate[], quick: boolean, deletable = false) {
    return listItems.length ? <ul className="grid min-w-0 gap-2">{listItems.map(item => <li key={item.key} className="grid min-w-0 gap-2 rounded-lg border p-3">
      <div className="flex min-w-0 items-start gap-1"><button type="button" className="min-w-0 flex-1 text-left font-medium break-words hover:underline" onClick={() => pick(item)}>{item.name}</button>{star(item)}{deletable && item.savedId && <Button type="button" variant="ghost" size="icon" disabled={pending} aria-label={`Delete ${item.name}`} onClick={() => { if (confirm(`Delete "${item.name}" from your foods?`)) run(() => deleteSavedFood(item.savedId!)); }}><Trash2 /></Button>}</div>
      {item.brand && <p className="text-xs break-words text-muted-foreground">{item.brand}</p>}
      <p className="text-xs break-words">{servingLabel(item.servings[0])}</p><MacroLine serving={item.servings[0]} /><IncompleteNote serving={item.servings[0]} />{allergyWarning(item)}
      {quick ? <Button type="button" variant="outline" size="sm" className="justify-self-start" disabled={pending} onClick={() => add(item, item.servings[0], 1, defaultMeal())}>Add again</Button> : <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => pick(item)}>Choose serving</Button>}
    </li>)}</ul> : <p className="text-sm text-muted-foreground">No foods here yet.</p>;
  }
  const serving = selected?.servings[servingIndex];
  return <div className="grid min-w-0 gap-3">
    <Tabs value={tab} onValueChange={changeTab} className="min-w-0">
      <TabsList className="grid !h-auto w-full grid-cols-3 gap-1 sm:grid-cols-6" aria-label="Ways to log food">{[["search", "Search"], ["scan", "Scan"], ["recent", "Recent"], ["favorites", "Favorites"], ["my", "My foods"], ["manual", "Manual"]].map(([value, label]) => <TabsTrigger key={value} value={value} className="min-h-8">{label}</TabsTrigger>)}</TabsList>
      <TabsContent value="search" className="min-w-0 space-y-3">
        <form className="grid min-w-0 gap-3" onSubmit={event => {
          event.preventDefault(); const data = new FormData(event.currentTarget);
          void lookup(`/api/foods/search?${new URLSearchParams({ q: String(data.get("q") ?? ""), source: String(data.get("source") ?? "all") })}`, false);
        }}>
          <div className="grid gap-1.5"><Label htmlFor="food-search">Search foods</Label><Input id="food-search" name="q" placeholder="e.g. banana or Greek yogurt" minLength={2} maxLength={100} required /></div>
          <div className="grid min-w-0 gap-1.5"><Label htmlFor="food-source">Food source</Label><select id="food-source" name="source" className={`${selectClass} w-full min-w-0 max-w-full`}><option value="all">All sources</option><option value="usda">Generic foods (USDA)</option><option value="off">Branded &amp; packaged (Open Food Facts)</option></select></div>
          <Button disabled={lookupPending} className="justify-self-start">{lookupPending ? "Searching…" : "Search"}</Button>
        </form>
        {searched && list(items, false)}
      </TabsContent>
      <TabsContent value="scan"><BarcodeScanner pending={lookupPending} onCode={code => { if (/^\d{8,14}$/.test(code)) void lookup(`/api/foods/barcode/${code}`, true); else setLookupState({ error: "Enter a barcode with 8–14 digits." }); }} /></TabsContent>
      <TabsContent value="recent">{list(recent.map(fromRecent), true)}</TabsContent>
      <TabsContent value="favorites">{list(saved.filter(row => row.is_favorite).map(fromSaved), true)}</TabsContent>
      <TabsContent value="my" className="min-w-0 space-y-4">{list(saved.filter(row => row.kind === "custom" || row.kind === "meal").map(fromSaved), true, true)}<CustomFoodForm athleteId={athleteId} /><MealBuilder athleteId={athleteId} date={date} entries={todayEntries} /></TabsContent>
      <TabsContent value="manual">{manual}</TabsContent>
    </Tabs>
    <FoodMessage state={lookupState} />
    {lookupState.error && <div className="grid justify-items-start gap-2"><p className="text-sm text-muted-foreground">You can enter it manually.</p><Button type="button" variant="outline" onClick={() => changeTab("manual")}>Enter manually</Button></div>}
    {selected && serving && <section ref={panel} tabIndex={-1} aria-label={`Add ${selected.name}`} className="grid min-w-0 gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex min-w-0 items-start gap-1"><div className="min-w-0 flex-1"><h3 className="font-medium break-words">{selected.name}</h3>{selected.brand && <p className="text-xs break-words text-muted-foreground">{selected.brand}</p>}</div>{star(selected, serving)}<Button type="button" variant="ghost" size="icon" aria-label="Close add panel" onClick={() => setSelected(null)}><X /></Button></div>
      {allergyWarning(selected)}
      <IncompleteNote serving={serving} />
      <form className="grid min-w-0 gap-3" onSubmit={event => { event.preventDefault(); add(selected, serving, Number(quantity), meal); }}>
        <div className="grid min-w-0 gap-1.5"><Label htmlFor="food-serving">Serving</Label><select id="food-serving" className={`${selectClass} w-full min-w-0 max-w-full`} value={servingIndex} onChange={event => setServingIndex(Number(event.target.value))}>{selected.servings.map((s, i) => <option key={i} value={i}>{servingLabel(s)}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-3"><div className="grid min-w-0 gap-1.5"><Label htmlFor="food-quantity">Quantity</Label><Input id="food-quantity" type="number" value={quantity} onChange={event => setQuantity(event.target.value)} step={0.25} min={0.25} max={20} required /></div><MealSelect value={meal} onChange={setMeal} /></div>
        <div aria-live="polite"><MacroLine serving={serving} quantity={Number(quantity) || 0} /></div>
        <Button disabled={pending} className="justify-self-start">{pending ? "Adding…" : "Add to log"}</Button>
      </form>
    </section>}
    <FoodMessage state={state} />
  </div>;
}
