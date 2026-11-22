"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { COOKING_OPTIONS, DIET_TYPES } from "@/lib/food-preferences";
import { EQUIPMENT, GOAL_CATEGORIES, INTAKE_STEPS, type IntakeFormValues } from "@/lib/athlete-intake";
import type { Units } from "@/lib/units";
import { saveIntakeStep } from "./actions";

type Row = Record<string, string | number>;
type Benchmark = { id: string; name: string; kind: string; workout_type: string };

export function IntakeForm({ step, values, benchmarks, units }: { step: number; values: IntakeFormValues; benchmarks: Benchmark[]; units: Units }) {
  const [form, setForm] = useState(values);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const set = (name: string, value: unknown) => setForm((v) => ({ ...v, [name]: value }));
  const rows = (name: string) => (form[name] ?? []) as Row[];
  const updateRow = (name: string, index: number, field: string, value: string) => set(name, rows(name).map((r, i) => i === index ? { ...r, [field]: value } : r));
  const field = (name: string, label: string, type = "text", required = true) => <label className="grid gap-2 text-sm" key={name}>{label}<Input name={name} type={type} step={type === "number" ? "any" : undefined} required={required} value={String(form[name] ?? "")} onChange={(e) => set(name, e.target.value)} /></label>;
  const area = (name: string, label: string) => <label className="grid gap-2 text-sm">{label}<Textarea value={String(form[name] ?? "")} maxLength={2000} onChange={(e) => set(name, e.target.value)} /></label>;
  const select = (name: string, label: string, options: readonly (readonly [string, string])[]) => <label className="grid gap-2 text-sm">{label}<select className="h-11 rounded-md border bg-background px-3" value={String(form[name] ?? "")} onChange={(e) => set(name, e.target.value)}>{options.map(([value, title]) => <option value={value} key={value}>{title}</option>)}</select></label>;
  const remove = (name: string, index: number) => <Button type="button" variant="ghost" onClick={() => set(name, rows(name).filter((_, i) => i !== index))}>Remove</Button>;
  const rowInput = (name: string, index: number, key: string, label: string, type = "text") => <label className="grid gap-1 text-sm">{label}<Input type={type} step={type === "number" ? "any" : undefined} value={rows(name)[index][key]} onChange={(e) => updateRow(name, index, key, e.target.value)} /></label>;

  return <section className="space-y-5">
    <div><p className="text-sm text-muted-foreground">Your starting point · Step {step} of 7</p><h1 className="text-2xl font-semibold">{INTAKE_STEPS[step - 1]}</h1><p className="mt-2 text-sm text-muted-foreground">Help your coach tailor your training. Each step saves when you continue; come back anytime.</p></div>
    <progress className="h-2 w-full" value={step} max={7} aria-label="Questionnaire progress" />
    <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); setError(""); startTransition(async () => { const result = await saveIntakeStep(step, form); if (result) setError(result.error); }); }}>
      <fieldset disabled={pending} className="grid min-w-0 gap-5">
      {step === 1 && <>{field("birth_date", "Birth date", "date")}{select("sex", "Sex (optional)", [["", "Prefer not to say"], ["female", "Female"], ["male", "Male"], ["other", "Other"]])}<div className="grid grid-cols-2 gap-3">{field("height_ft", "Height (feet)", "number")}{field("height_in", "Inches", "number")}</div>{field("weight", `Current weight (${units})`, "number")}</>}
      {step === 2 && <>{select("experience_level", "CrossFit experience", [["beginner", "Beginner"], ["intermediate", "Intermediate"], ["advanced", "Advanced"], ["competitor", "Competitor"]])}{area("crossfit_detail", "Tell us about your CrossFit experience (optional)")}{field("years_training", "Years training", "number")}{area("sports_background", "Sports background (optional)")}<h2 className="font-medium">Known 1RMs & benchmarks (optional)</h2><p className="text-sm text-muted-foreground">Leave out results you don’t know. Loads are in {units}; times are in seconds.</p>{rows("benchmarks").map((r, i) => {
        const b = benchmarks.find((b) => b.id === r.benchmark_id);
        return <div key={i} className="grid gap-3 rounded-lg border p-3"><label className="grid gap-1 text-sm">Benchmark<select className="h-11 w-full rounded border bg-background" value={r.benchmark_id} onChange={(e) => updateRow("benchmarks", i, "benchmark_id", e.target.value)}><option value="">Choose a benchmark</option>{benchmarks.map((b) => <option key={b.id} value={b.id}>{b.name}{b.kind === "lift" ? " (1RM)" : ""}</option>)}</select></label>{b?.kind === "lift" ? rowInput("benchmarks", i, "load", `1RM (${units})`, "number") : b?.workout_type === "for_time" ? rowInput("benchmarks", i, "time_seconds", "Time (seconds)", "number") : <>{rowInput("benchmarks", i, "rounds", "Rounds", "number")}{rowInput("benchmarks", i, "reps", "Reps", "number")}</>}{remove("benchmarks", i)}</div>;
      })}<Button type="button" variant="outline" disabled={rows("benchmarks").length >= 30} onClick={() => set("benchmarks", [...rows("benchmarks"), { benchmark_id: "", load: "", time_seconds: "", rounds: "", reps: "" }])}>Add a known result</Button></>}
      {step === 3 && <><p className="text-sm">Choose 1–3 priorities. Targets and dates are optional.</p>{rows("goals").map((r, i) => <div key={i} className="grid gap-3 rounded-lg border p-3"><label className="grid gap-1 text-sm">Priority<select className="h-11 rounded border bg-background" value={r.category} onChange={(e) => updateRow("goals", i, "category", e.target.value)}>{GOAL_CATEGORIES.map((g) => <option key={g}>{g}</option>)}</select></label>{rowInput("goals", i, "target", "Target / skill / competition")}{rowInput("goals", i, "target_value", "Target value (include units in target text)", "number")}{rowInput("goals", i, "target_date", "Target date", "date")}{remove("goals", i)}</div>)}<Button type="button" variant="outline" disabled={rows("goals").length >= 3} onClick={() => set("goals", [...rows("goals"), { category: GOAL_CATEGORIES.find((c) => !rows("goals").some((g) => g.category === c)) ?? "Strength", target: "", target_value: "", target_date: "" }])}>Add goal</Button></>}
      {step === 4 && <><p className="text-sm text-muted-foreground">Include anything that affects training. Review any existing notes and confirm the severity.</p><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.no_injuries === true} onChange={(e) => setForm((v) => ({ ...v, no_injuries: e.target.checked, injury_list: e.target.checked ? [] : v.injury_list }))} />I have no injuries or limitations.</label>{rows("injury_list").map((r, i) => <div key={i} className="grid gap-3 rounded-lg border p-3">{rowInput("injury_list", i, "area", "Area / limitation")}<label className="grid gap-1 text-sm">Severity<select className="h-11 rounded border bg-background" value={r.severity} onChange={(e) => updateRow("injury_list", i, "severity", e.target.value)}>{["mild", "moderate", "severe"].map((s) => <option key={s}>{s}</option>)}</select></label>{rowInput("injury_list", i, "notes", "Notes (optional)")}{remove("injury_list", i)}</div>)}<Button type="button" variant="outline" disabled={rows("injury_list").length >= 20} onClick={() => setForm((v) => ({ ...v, no_injuries: false, injury_list: [...rows("injury_list"), { area: "", severity: "mild", notes: "" }] }))}>Add injury or limitation</Button></>}
      {step === 5 && <>{field("days_per_week", "Training days per week (1–7)", "number")}{field("session_minutes", "Session length (minutes)", "number")}{select("location", "Training location", [["gym", "Gym"], ["home", "Home"], ["travel", "Travel"]])}<fieldset className="grid grid-cols-2 gap-3"><legend className="mb-3 text-sm font-medium">Available equipment</legend>{EQUIPMENT.map((item) => <label key={item} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={(form.equipment as string[]).includes(item)} onChange={(e) => set("equipment", e.target.checked ? [...form.equipment as string[], item] : (form.equipment as string[]).filter((v) => v !== item))} />{item}</label>)}</fieldset></>}
      {step === 6 && <>{select("diet_type", "Diet", DIET_TYPES)}{field("allergies", "Allergies (comma separated)", "text", false)}{field("dislikes", "Foods you dislike (comma separated)", "text", false)}{select("cooking_minutes", "Time available to cook", COOKING_OPTIONS)}{area("eating_habits", "Current eating habits (optional)")}</>}
      {step === 7 && <>{field("sleep_hours", "Typical sleep (hours per night)", "number")}{select("stress_level", "Stress level", [["low", "Low"], ["moderate", "Moderate"], ["high", "High"]])}{select("job_activity", "Job activity level", [["sedentary", "Mostly sitting"], ["light", "Light activity"], ["moderate", "Moderately active"], ["physical", "Physical work"]])}<Button disabled variant="outline">Connect a wearable — coming soon</Button></>}
      </fieldset>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center justify-between gap-3">{step > 1 ? <Button variant="ghost" asChild><Link href={`/athlete/onboarding?step=${step - 1}`}>Back</Link></Button> : <span />}<Button type="submit" disabled={pending}>{pending ? "Saving…" : step === 7 ? "Complete questionnaire" : "Save & continue"}</Button></div>
    </form>
  </section>;
}
