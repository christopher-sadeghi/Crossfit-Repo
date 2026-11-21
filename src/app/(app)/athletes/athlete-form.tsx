"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Tables } from "@/lib/supabase/database.types";

import { saveAthlete } from "./actions";
import { LEVEL_LABELS, LEVELS } from "./options";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function AthleteForm({ athlete }: { athlete?: Tables<"athletes"> }) {
  const [state, formAction, pending] = useActionState(saveAthlete, {});
  const v = (name: keyof Tables<"athletes">) =>
    state.values?.[name] ?? (athlete?.[name] == null ? "" : String(athlete[name]));

  return (
    // Remount on each failed submit: React won't update a focused number input's value from new defaultValues.
    <form key={JSON.stringify(state.values ?? {})} action={formAction} className="grid max-w-2xl gap-5">
      {athlete && <input type="hidden" name="id" value={athlete.id} />}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="First name *" name="first_name">
          <Input id="first_name" name="first_name" defaultValue={v("first_name")} required />
        </Field>
        <Field label="Last name *" name="last_name">
          <Input id="last_name" name="last_name" defaultValue={v("last_name")} required />
        </Field>
        <Field label="Email" name="email">
          <Input id="email" name="email" type="email" defaultValue={v("email")} />
        </Field>
        <Field label="Birth date" name="birth_date">
          <Input id="birth_date" name="birth_date" type="date" defaultValue={v("birth_date")} />
        </Field>
        <Field label="Sex" name="sex">
          <select id="sex" name="sex" defaultValue={v("sex")} className={selectClass}>
            <option value="">—</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Height (cm)" name="height_cm">
          <Input id="height_cm" name="height_cm" type="number" step="0.5" defaultValue={v("height_cm")} />
        </Field>
        <Field label="Experience level *" name="experience_level">
          <select
            id="experience_level"
            name="experience_level"
            defaultValue={v("experience_level") || "intermediate"}
            className={selectClass}
            required
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABELS[l]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Injuries / limitations" name="injuries">
        <Textarea id="injuries" name="injuries" defaultValue={v("injuries")} placeholder="e.g. Left shoulder impingement: no overhead pressing" />
      </Field>
      <Field label="Coach notes" name="notes">
        <Textarea id="notes" name="notes" defaultValue={v("notes")} />
      </Field>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : athlete ? "Save changes" : "Add athlete"}
        </Button>
        <Button variant="outline" asChild>
          <Link href={athlete ? `/athletes/${athlete.id}` : "/athletes"}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

function Field({ label, name, children }: { label: string; name: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      {children}
    </div>
  );
}
