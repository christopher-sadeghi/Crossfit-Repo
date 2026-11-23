"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveProgrammingStyle, skipProgrammingStyle } from "./actions";
import type { ProgrammingStyleAnswers } from "@/lib/programming-style";

type Option = readonly [string, string];
const athleteTypes: Option[] = [["beginners", "Beginners"], ["general_fitness", "General fitness"], ["competitors", "Competitors"], ["older_adults", "Older adults"], ["weight_loss", "Weight loss"], ["youth", "Youth"], ["endurance", "Endurance"]];
const components: Option[] = [["warm_up", "Warm-up"], ["strength", "Strength"], ["skill", "Skill"], ["metcon", "Metcon"], ["accessory", "Accessory work"], ["cool_down", "Cool-down"], ["mobility", "Mobility"]];
const metconFormats: Option[] = [["amrap", "AMRAP"], ["for_time", "For time"], ["emom", "EMOM"], ["intervals", "Intervals"], ["chipper", "Chipper"], ["partner", "Partner"], ["long_aerobic", "Long aerobic"]];
const domains: Option[] = [["short_under_8", "Under 8 minutes"], ["medium_8_15", "8–15 minutes"], ["long_15_30", "15–30 minutes"], ["very_long_30_plus", "Over 30 minutes"]];

function MultiSelect({ title, options, value, onChange }: { title: string; options: Option[]; value: string[]; onChange: (value: string[]) => void }) {
  return <fieldset className="grid gap-2"><legend className="text-sm font-medium">{title}</legend>
    <div className="grid gap-2 sm:grid-cols-2">{options.map(([key, label]) =>
      <label key={key} className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value.includes(key)} onChange={(event) => onChange(event.target.checked ? [...value, key] : value.filter((item) => item !== key))} />
        {label}
      </label>)}</div>
  </fieldset>;
}

function SelectField({ title, value, options, onChange }: { title: string; value?: string | number; options: Option[]; onChange: (value: string | undefined) => void }) {
  return <label className="grid gap-1 text-sm font-medium">{title}
    <select className="h-10 rounded-md border bg-background px-3 font-normal" value={value?.toString() ?? ""} onChange={(event) => onChange(event.target.value || undefined)}>
      <option value="">Choose…</option>{options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
  </label>;
}

function TextField({ title, value, maxLength, onChange, multiline = false }: { title: string; value?: string; maxLength: number; onChange: (value: string) => void; multiline?: boolean }) {
  return <label className="grid gap-1 text-sm font-medium">{title}
    {multiline
      ? <Textarea maxLength={maxLength} value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
      : <input className="h-10 rounded-md border bg-background px-3 font-normal" maxLength={maxLength} value={value ?? ""} onChange={(event) => onChange(event.target.value)} />}
    <span className="text-xs font-normal text-muted-foreground">Up to {maxLength} characters</span>
  </label>;
}

export function ProgrammingStyleForm({ initialAnswers }: { initialAnswers: ProgrammingStyleAnswers }) {
  const [answers, setAnswers] = useState(initialAnswers);
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof ProgrammingStyleAnswers>(key: K, value: ProgrammingStyleAnswers[K]) =>
    setAnswers((current) => ({ ...current, [key]: value }));
  const run = (action: (value: unknown) => Promise<void>) => startTransition(() => action(answers));
  const progress = Math.round(((step + 1) / 6) * 100);
  const fields = [
    <div key="audience" className="grid gap-5"><MultiSelect title="Who do you coach?" options={athleteTypes} value={answers.athlete_types} onChange={(value) => set("athlete_types", value as ProgrammingStyleAnswers["athlete_types"])} />
      <SelectField title="Coaching format" value={answers.format} options={[["group", "Group"], ["one_on_one", "One-on-one"], ["online", "Online"]]} onChange={(value) => set("format", value as ProgrammingStyleAnswers["format"])} /></div>,
    <div key="sessions" className="grid gap-5"><SelectField title="Typical session length" value={answers.session_minutes} options={["30", "45", "60", "75", "90"].map((v): Option => [v, `${v} minutes`])} onChange={(value) => set("session_minutes", value as ProgrammingStyleAnswers["session_minutes"])} />
      <MultiSelect title="What do your sessions include?" options={components} value={answers.components} onChange={(value) => set("components", value as ProgrammingStyleAnswers["components"])} /></div>,
    <div key="strength" className="grid gap-5"><SelectField title="Strength approach" value={answers.strength_method} options={[["percentages", "Percentages"], ["rpe", "RPE"], ["linear", "Linear progression"], ["531", "5/3/1"], ["olympic_focus", "Olympic lifting focus"], ["bodybuilding", "Bodybuilding"], ["minimal", "Minimal strength work"]]} onChange={(value) => set("strength_method", value as ProgrammingStyleAnswers["strength_method"])} />
      <TextField title="Strength notes" maxLength={500} value={answers.strength_notes} onChange={(value) => set("strength_notes", value)} multiline /></div>,
    <div key="metcons" className="grid gap-5"><MultiSelect title="Preferred metcon formats" options={metconFormats} value={answers.metcon_formats} onChange={(value) => set("metcon_formats", value as ProgrammingStyleAnswers["metcon_formats"])} />
      <MultiSelect title="Typical time domains" options={domains} value={answers.time_domains} onChange={(value) => set("time_domains", value as ProgrammingStyleAnswers["time_domains"])} />
      <SelectField title="Intensity" value={answers.intensity} options={[["mostly_hard", "Mostly hard"], ["mixed", "Mixed"], ["mostly_aerobic", "Mostly aerobic"]]} onChange={(value) => set("intensity", value as ProgrammingStyleAnswers["intensity"])} /></div>,
    <div key="programming" className="grid gap-5"><SelectField title="Training days per week" value={answers.days_per_week} options={[3, 4, 5, 6, 7].map((v): Option => [String(v), String(v)])} onChange={(value) => set("days_per_week", value ? Number(value) : undefined)} />
      <SelectField title="Deload frequency" value={answers.deload_every_weeks} options={[["none", "No scheduled deload"], ["4", "Every 4 weeks"], ["6", "Every 6 weeks"], ["8", "Every 8 weeks"]]} onChange={(value) => set("deload_every_weeks", value as ProgrammingStyleAnswers["deload_every_weeks"])} />
      <SelectField title="Cycle length" value={answers.cycle_weeks} options={["4", "6", "8", "12"].map((v): Option => [v, `${v} weeks`])} onChange={(value) => set("cycle_weeks", value as ProgrammingStyleAnswers["cycle_weeks"])} /></div>,
    <div key="preferences" className="grid gap-5"><TextField title="Favorite movements" maxLength={500} value={answers.favorite_movements} onChange={(value) => set("favorite_movements", value)} />
      <TextField title="Movements to avoid" maxLength={500} value={answers.avoid_movements} onChange={(value) => set("avoid_movements", value)} />
      <SelectField title="When scaling, what changes first?" value={answers.scaling_order} options={[["load_first", "Load"], ["reps_first", "Reps"], ["movement_first", "Movement"]]} onChange={(value) => set("scaling_order", value as ProgrammingStyleAnswers["scaling_order"])} />
      <TextField title="Describe your programming style" maxLength={1500} value={answers.style_description} onChange={(value) => set("style_description", value)} multiline />
      <TextField title="Example WOD" maxLength={1500} value={answers.example_wod} onChange={(value) => set("example_wod", value)} multiline /></div>,
  ];
  const titles = ["Athletes & format", "Session structure", "Strength", "Conditioning", "Training plan", "Your preferences"];
  return <section className="mx-auto grid w-full max-w-2xl gap-6 rounded-lg border bg-card p-5 shadow-sm sm:p-8">
    <div className="grid gap-2"><div className="flex justify-between text-sm"><span>Step {step + 1} of 6 · {titles[step]}</span><span>{progress}%</span></div>
      <div role="progressbar" aria-label="Programming style questionnaire" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div></div>
    <div className="grid gap-5">{fields[step]}</div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <Button type="button" variant="outline" disabled={pending || step === 0} onClick={() => setStep((value) => value - 1)}>Back</Button>
      <Button type="button" variant="ghost" disabled={pending} onClick={() => run(skipProgrammingStyle)}>Skip for now</Button>
      {step < 5
        ? <Button type="button" disabled={pending} onClick={() => setStep((value) => value + 1)}>Next</Button>
        : <Button type="button" disabled={pending} onClick={() => run(saveProgrammingStyle)}>{pending ? "Saving…" : "Save"}</Button>}
    </div>
  </section>;
}
