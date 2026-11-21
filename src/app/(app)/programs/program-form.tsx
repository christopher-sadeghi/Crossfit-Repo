"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Tables } from "@/lib/supabase/database.types";

import { saveProgram } from "./actions";

export function ProgramForm({ program }: { program?: Pick<Tables<"programs">, "id" | "name" | "description" | "weeks"> }) {
  const [state, formAction, pending] = useActionState(saveProgram, {});
  const v = (name: "name" | "description" | "weeks") =>
    state.values?.[name] ?? (program?.[name] == null ? "" : String(program[name]));

  return (
    // Remount on each failed submit so the inputs show the values that were sent.
    <form key={JSON.stringify(state.values ?? {})} action={formAction} className="grid max-w-2xl gap-5">
      {program && <input type="hidden" name="id" value={program.id} />}
      <div className="grid gap-5 sm:grid-cols-[3fr_1fr]">
        <div className="grid gap-2">
          <Label htmlFor="name">Name *</Label>
          <Input id="name" name="name" defaultValue={v("name")} placeholder="e.g. 6-Week Strength Cycle" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="weeks">Weeks *</Label>
          <Input id="weeks" name="weeks" type="number" min="1" max="52" step="1" defaultValue={v("weeks") || "4"} required />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" defaultValue={v("description")} placeholder="Goal and focus of this program" />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : program ? "Save changes" : "Create program"}
        </Button>
        <Button variant="outline" asChild>
          <Link href={program ? `/programs/${program.id}` : "/programs"}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
