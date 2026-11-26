"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { startTransition, useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Enums } from "@/lib/supabase/database.types";
import type { Units } from "@/lib/units";
import { SECTION_FORMATS, type WorkoutSection } from "@/lib/workout-sections";

import { CATEGORIES, CATEGORY_LABELS, selectClass, WORKOUT_TYPE_LABELS, WORKOUT_TYPES } from "../options";
import { saveWorkout } from "./actions";
import { Whiteboard, type WhiteboardWorkout } from "./whiteboard";

const LB_PER_KG = 2.20462;
type NumericField = "sets" | "reps" | "load" | "distance_m" | "calories" | "duration_seconds";

type Row = { key: number; movement_id: string; notes: string; section: string } & Record<NumericField, string>;
type SectionDraft = { title: string; format: WorkoutSection["format"]; time_cap_minutes: string; rounds: string };
type MovementOption = { id: string; name: string; category: Enums<"movement_category"> };

export type BuilderWorkout = WhiteboardWorkout & {
  id: string;
  movements: ({ movement_id: string; notes: string | null; load_kg: number | null; section?: number | null } & Record<
    Exclude<NumericField, "load">,
    number | null
  >)[];
};

let nextKey = 1;
const emptyRow = (): Row => ({
  key: nextKey++,
  movement_id: "",
  sets: "",
  reps: "",
  load: "",
  distance_m: "",
  calories: "",
  duration_seconds: "",
  notes: "",
  section: "",
});

const num = (v: string) => (v.trim() === "" ? null : Number(v));
const toDisplay = (kg: number | null, units: Units) =>
  kg == null ? "" : String(Math.round((units === "lb" ? kg * LB_PER_KG : kg) * 100) / 100);
const toKg = (v: string, units: Units) => {
  const n = num(v);
  return n == null ? null : Math.round((units === "lb" ? n / LB_PER_KG : n) * 100) / 100;
};

export type Placement = { program_id: string; program_name: string; week_number: number; day_number: number };
export type OneOff = { athleteId: string; athleteName: string; date: string };

export function WodBuilder({
  workout,
  placement,
  oneOff,
  movementOptions,
  units,
}: {
  workout?: BuilderWorkout;
  placement?: Placement;
  oneOff?: OneOff;
  movementOptions: MovementOption[];
  units: Units;
}) {
  const [state, formAction, pending] = useActionState(saveWorkout, {});
  const [title, setTitle] = useState(workout?.title ?? "");
  const [type, setType] = useState<Enums<"workout_type">>(workout?.workout_type ?? "for_time");
  const [cap, setCap] = useState(workout?.time_cap_seconds ? String(workout.time_cap_seconds / 60) : "");
  const [rounds, setRounds] = useState(workout?.rounds ? String(workout.rounds) : "");
  const [description, setDescription] = useState(workout?.description ?? "");
  const [notes, setNotes] = useState(workout?.notes ?? "");
  const [scheduledOn, setScheduledOn] = useState(oneOff?.date ?? "");
  const [sections, setSections] = useState<SectionDraft[]>(() =>
    (workout?.sections ?? []).map((section) => ({
      title: section.title,
      format: section.format,
      time_cap_minutes:
        section.time_cap_seconds == null
          ? ""
          : String(section.time_cap_seconds / 60),
      rounds: section.rounds == null ? "" : String(section.rounds),
    })),
  );
  const [rows, setRows] = useState<Row[]>(() =>
    workout?.movements.length
      ? workout.movements.map((m) => ({
          key: nextKey++,
          movement_id: m.movement_id,
          sets: m.sets?.toString() ?? "",
          reps: m.reps?.toString() ?? "",
          load: toDisplay(m.load_kg, units),
          distance_m: m.distance_m?.toString() ?? "",
          calories: m.calories?.toString() ?? "",
          duration_seconds: m.duration_seconds?.toString() ?? "",
          notes: m.notes ?? "",
          section: m.section == null ? "" : String(m.section),
        }))
      : [emptyRow()],
  );

  const names = new Map(movementOptions.map((m) => [m.id, m.name]));
  const movements = rows.map((r) => ({
    movement_id: r.movement_id,
    sets: num(r.sets),
    reps: num(r.reps),
    load_kg: toKg(r.load, units),
    distance_m: num(r.distance_m),
    calories: num(r.calories),
    duration_seconds: num(r.duration_seconds),
    notes: r.notes.trim() || null,
    section: sections.length && r.section !== "" ? Number(r.section) : null,
  }));
  const sectionPayload = sections.map((section) => ({
    title: section.title,
    format: section.format,
    time_cap_seconds:
      section.time_cap_minutes.trim() === ""
        ? null
        : Math.round(Number(section.time_cap_minutes) * 60),
    rounds: num(section.rounds),
  }));
  const capSeconds = num(cap);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (index: number, by: number) =>
    setRows((rs) => {
      const next = [...rs];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });
  const removeSection = (index: number) => {
    const nextCount = sections.length - 1;
    setSections((current) => current.filter((_, sectionIndex) => sectionIndex !== index));
    setRows((current) =>
      current.map((row) => {
        if (row.section === "") return row;
        const oldIndex = Number(row.section);
        if (nextCount === 0) return { ...row, section: "" };
        if (oldIndex === index) return { ...row, section: String(Math.max(0, index - 1)) };
        return oldIndex > index ? { ...row, section: String(oldIndex - 1) } : row;
      }),
    );
  };

  return (
    <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <form
        // Submit manually: React's automatic reset after a form action would visually clear the dropdowns.
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => formAction(data));
        }}
        className="grid min-w-0 content-start gap-5"
      >
        {workout && <input type="hidden" name="id" value={workout.id} />}
        {placement && (
          <>
            <input type="hidden" name="program_id" value={placement.program_id} />
            <input type="hidden" name="week_number" value={placement.week_number} />
            <input type="hidden" name="day_number" value={placement.day_number} />
            <p className="rounded-md bg-muted px-3 py-2 text-sm">
              Adds to <strong>{placement.program_name}</strong>, week {placement.week_number}, day {placement.day_number}.
            </p>
          </>
        )}
        {oneOff && (
          <>
            <input type="hidden" name="athlete_id" value={oneOff.athleteId} />
            <h2 className="text-lg font-semibold">One-off WOD for {oneOff.athleteName}</h2>
            <Field label="Date *" id="scheduled_on">
              <Input
                id="scheduled_on"
                name="scheduled_on"
                type="date"
                value={scheduledOn}
                onChange={(e) => setScheduledOn(e.target.value)}
                required
                className="w-full min-w-0"
              />
            </Field>
          </>
        )}
        <input type="hidden" name="movements" value={JSON.stringify(movements)} />
        <input type="hidden" name="sections" value={JSON.stringify(sectionPayload)} />
        <div className="grid min-w-0 gap-5 sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <Field label="Name *" id="title">
            <Input id="title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fran" required className="w-full min-w-0" />
          </Field>
          <Field label="Type *" id="workout_type">
            <select
              id="workout_type"
              name="workout_type"
              value={type}
              onChange={(e) => setType(e.target.value as Enums<"workout_type">)}
              className={`${selectClass} w-full min-w-0`}
            >
              {WORKOUT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {WORKOUT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={type === "amrap" || type === "emom" ? "Length (min)" : "Time cap (min)"} id="time_cap_minutes">
            <Input id="time_cap_minutes" name="time_cap_minutes" type="number" min="1" max="180" step="0.5" value={cap} onChange={(e) => setCap(e.target.value)} className="w-full min-w-0" />
          </Field>
          <Field label="Rounds" id="rounds">
            <Input id="rounds" name="rounds" type="number" min="1" step="1" value={rounds} onChange={(e) => setRounds(e.target.value)} className="w-full min-w-0" />
          </Field>
        </div>
        <Field label="Description / rep scheme" id="description">
          <Textarea id="description" name="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. 21-15-9" />
        </Field>

        <fieldset className="grid min-w-0 gap-3 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">Sections</legend>
          {sections.map((section, index) => (
            <div key={index} className="grid min-w-0 gap-2 rounded-md bg-muted/40 p-3 sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]">
              <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
                Title
                <Input
                  value={section.title}
                  maxLength={80}
                  onChange={(event) =>
                    setSections((current) =>
                      current.map((item, i) => i === index ? { ...item, title: event.target.value } : item),
                    )
                  }
                  className="w-full min-w-0"
                />
              </label>
              <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
                Format
                <select
                  value={section.format}
                  onChange={(event) =>
                    setSections((current) =>
                      current.map((item, i) => i === index
                        ? { ...item, format: event.target.value as WorkoutSection["format"] }
                        : item),
                    )
                  }
                  className={`${selectClass} w-full min-w-0`}
                >
                  {SECTION_FORMATS.map((format) => (
                    <option key={format} value={format}>{format.replace("_", " ")}</option>
                  ))}
                </select>
              </label>
              <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
                Time cap (min)
                <Input type="number" min="1" max="180" step="0.5" value={section.time_cap_minutes} onChange={(event) => setSections((current) => current.map((item, i) => i === index ? { ...item, time_cap_minutes: event.target.value } : item))} className="w-full min-w-0" />
              </label>
              <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
                Rounds
                <Input type="number" min="1" max="100" step="1" value={section.rounds} onChange={(event) => setSections((current) => current.map((item, i) => i === index ? { ...item, rounds: event.target.value } : item))} className="w-full min-w-0" />
              </label>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove section ${index + 1}`} onClick={() => removeSection(index)}>
                <X />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            disabled={sections.length >= 10}
            onClick={() => setSections((current) => [...current, {
              title: `Section ${current.length + 1}`,
              format: "other",
              time_cap_minutes: "",
              rounds: "",
            }])}
          >
            <Plus /> Add section
          </Button>
          {sections.length > 0 && <p className="text-xs text-muted-foreground">Assign movements to sections below. Remove a section to move its movements to the previous section.</p>}
        </fieldset>

        <fieldset className="grid min-w-0 gap-3">
          <legend className="mb-2 text-sm font-medium">Movements *</legend>
          {rows.map((r, i) => (
            <div key={r.key} className="grid min-w-0 gap-2 rounded-lg border p-3">
              <div className="grid min-w-0 gap-2 sm:flex sm:items-center">
                <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1">
                  <span className="w-5 shrink-0 text-sm text-muted-foreground">{i + 1}.</span>
                  <select
                    aria-label={`Movement ${i + 1}`}
                    value={r.movement_id}
                    onChange={(e) => update(r.key, { movement_id: e.target.value })}
                    className={`${selectClass} w-full min-w-0 sm:w-auto sm:flex-1`}
                  >
                    <option value="">Choose a movement…</option>
                    {CATEGORIES.map((c) => (
                      <optgroup key={c} label={CATEGORY_LABELS[c]}>
                        {movementOptions
                          .filter((m) => m.category === c)
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  {sections.length > 0 && (
                    <select
                      aria-label={`Section for movement ${i + 1}`}
                      value={r.section}
                      onChange={(e) => update(r.key, { section: e.target.value })}
                      className={`${selectClass} w-full min-w-0 flex-1 sm:w-32 sm:flex-none`}
                    >
                      <option value="">
                        {i === 0 ? "Section 1 (default)" : "Previous section (default)"}
                      </option>
                      {sections.map((section, sectionIndex) => (
                        <option key={sectionIndex} value={sectionIndex}>
                          {section.title || `Section ${sectionIndex + 1}`}
                        </option>
                      ))}
                    </select>
                  )}
                  <Button type="button" variant="ghost" size="icon" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label="Move down" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove movement"
                    disabled={rows.length === 1}
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  >
                    <X />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pl-0 sm:grid-cols-4 sm:pl-7 md:grid-cols-7">
                {(
                  [
                    ["sets", "Sets", "1"],
                    ["reps", "Reps", "1"],
                    ["load", `Load (${units})`, "any"],
                    ["distance_m", "Distance (m)", "1"],
                    ["calories", "Calories", "1"],
                    ["duration_seconds", "Time (sec)", "1"],
                  ] as const
                ).map(([field, label, step]) => (
                  <label key={field} className="grid min-w-0 gap-1 text-xs text-muted-foreground">
                    {label}
                    <Input type="number" min="0" step={step} value={r[field]} onChange={(e) => update(r.key, { [field]: e.target.value })} className="w-full min-w-0" />
                  </label>
                ))}
                <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
                  Note
                  <Input value={r.notes} onChange={(e) => update(r.key, { notes: e.target.value })} placeholder="e.g. Rx 95/65" className="w-full min-w-0" />
                </label>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" className="justify-self-start" onClick={() => setRows((rs) => [...rs, emptyRow()])}>
            <Plus /> Add movement
          </Button>
        </fieldset>

        <Field label="Coach notes" id="notes">
          <Textarea id="notes" name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Stimulus, scaling options, warm-up…" />
        </Field>
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        <div className="flex gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : workout ? "Save changes" : "Save WOD"}
          </Button>
          <Button variant="outline" asChild>
            <Link
              href={
                oneOff
                  ? `/athletes/${oneOff.athleteId}`
                  : workout
                  ? `/programs/workouts/${workout.id}`
                  : placement
                    ? `/programs/${placement.program_id}`
                    : "/programs/workouts"
              }
            >
              Cancel
            </Link>
          </Button>
        </div>
      </form>

      <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">
        <p className="mb-2 text-sm font-medium text-muted-foreground">Whiteboard preview</p>
        <Whiteboard
          units={units}
          workout={{
            title,
            workout_type: type,
            time_cap_seconds: capSeconds && capSeconds > 0 ? Math.round(capSeconds * 60) : null,
            rounds: num(rounds),
            description: description.trim() || null,
            notes: notes.trim() || null,
            sections: sectionPayload,
          }}
          movements={movements
            .filter((m) => m.movement_id)
            .map((m) => ({ ...m, name: names.get(m.movement_id) ?? "" }))}
        />
      </aside>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={id} className="min-w-0">{label}</Label>
      {children}
    </div>
  );
}
