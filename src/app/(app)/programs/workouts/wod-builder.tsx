"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Enums } from "@/lib/supabase/database.types";
import type { Units } from "@/lib/units";

import { CATEGORIES, CATEGORY_LABELS, selectClass, WORKOUT_TYPE_LABELS, WORKOUT_TYPES } from "../options";
import { saveWorkout } from "./actions";
import { Whiteboard, type WhiteboardWorkout } from "./whiteboard";

const LB_PER_KG = 2.20462;
type NumericField = "sets" | "reps" | "load" | "distance_m" | "calories" | "duration_seconds";

type Row = { key: number; movement_id: string; notes: string } & Record<NumericField, string>;
type MovementOption = { id: string; name: string; category: Enums<"movement_category"> };

export type BuilderWorkout = WhiteboardWorkout & {
  id: string;
  movements: ({ movement_id: string; notes: string | null; load_kg: number | null } & Record<
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
});

const num = (v: string) => (v.trim() === "" ? null : Number(v));
const toDisplay = (kg: number | null, units: Units) =>
  kg == null ? "" : String(Math.round((units === "lb" ? kg * LB_PER_KG : kg) * 10) / 10);
const toKg = (v: string, units: Units) => {
  const n = num(v);
  return n == null ? null : Math.round((units === "lb" ? n / LB_PER_KG : n) * 100) / 100;
};

export function WodBuilder({
  workout,
  movementOptions,
  units,
}: {
  workout?: BuilderWorkout;
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

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_24rem]">
      <form action={formAction} className="grid content-start gap-5">
        {workout && <input type="hidden" name="id" value={workout.id} />}
        <input type="hidden" name="movements" value={JSON.stringify(movements)} />
        <div className="grid gap-5 sm:grid-cols-[2fr_1fr_1fr_1fr]">
          <Field label="Name *" id="title">
            <Input id="title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fran" required />
          </Field>
          <Field label="Type *" id="workout_type">
            <select
              id="workout_type"
              name="workout_type"
              value={type}
              onChange={(e) => setType(e.target.value as Enums<"workout_type">)}
              className={`${selectClass} w-full`}
            >
              {WORKOUT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {WORKOUT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={type === "amrap" || type === "emom" ? "Length (min)" : "Time cap (min)"} id="time_cap_minutes">
            <Input id="time_cap_minutes" name="time_cap_minutes" type="number" min="0.5" step="0.5" value={cap} onChange={(e) => setCap(e.target.value)} />
          </Field>
          <Field label="Rounds" id="rounds">
            <Input id="rounds" name="rounds" type="number" min="1" step="1" value={rounds} onChange={(e) => setRounds(e.target.value)} />
          </Field>
        </div>
        <Field label="Description / rep scheme" id="description">
          <Textarea id="description" name="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. 21-15-9" />
        </Field>

        <fieldset className="grid gap-3">
          <legend className="mb-2 text-sm font-medium">Movements *</legend>
          {rows.map((r, i) => (
            <div key={r.key} className="grid gap-2 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <span className="w-5 text-sm text-muted-foreground">{i + 1}.</span>
                <select
                  aria-label={`Movement ${i + 1}`}
                  value={r.movement_id}
                  onChange={(e) => update(r.key, { movement_id: e.target.value })}
                  className={`${selectClass} min-w-0 flex-1`}
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
              <div className="grid grid-cols-3 gap-2 pl-7 sm:grid-cols-7">
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
                  <label key={field} className="grid gap-1 text-xs text-muted-foreground">
                    {label}
                    <Input type="number" min="0" step={step} value={r[field]} onChange={(e) => update(r.key, { [field]: e.target.value })} />
                  </label>
                ))}
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Note
                  <Input value={r.notes} onChange={(e) => update(r.key, { notes: e.target.value })} placeholder="e.g. Rx 95/65" />
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
            <Link href={workout ? `/programs/workouts/${workout.id}` : "/programs/workouts"}>Cancel</Link>
          </Button>
        </div>
      </form>

      <aside className="xl:sticky xl:top-6 xl:self-start">
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
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
