"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/lib/auth/form-state";

import { copyProgramForAthlete } from "../actions";

type ProgramOption = { id: string; name: string; assigned: boolean };

export function PersonalProgramCopyForm({
  athleteId,
  programs,
  defaultStart,
}: {
  athleteId: string;
  programs: ProgramOption[];
  defaultStart: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(copyProgramForAthlete, {});
  const [programId, setProgramId] = useState(
    () => programs.find((program) => program.assigned)?.id ?? programs[0]?.id ?? "",
  );
  const selectedProgram = programs.find((program) => program.id === programId);

  if (!programs.length) {
    return <p className="text-sm text-muted-foreground">Create a group program before making a personal copy.</p>;
  }

  return (
    <form action={formAction} className="grid gap-3 rounded-md border p-3">
      <input type="hidden" name="athlete_id" value={athleteId} />
      <div className="grid gap-2">
        <Label htmlFor="copy-program-id">Group program</Label>
        <select
          id="copy-program-id"
          name="program_id"
          value={programId}
          onChange={(event) => setProgramId(event.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
          required
        >
          {programs.map((program) => (
            <option key={program.id} value={program.id}>
              {program.name}{program.assigned ? " (assigned)" : ""}
            </option>
          ))}
        </select>
      </div>
      {selectedProgram && !selectedProgram.assigned && (
        <div className="grid gap-2">
          <Label htmlFor="copy-program-start-date">Start date</Label>
          <Input
            id="copy-program-start-date"
            name="start_date"
            type="date"
            defaultValue={defaultStart}
            required
          />
        </div>
      )}
      <p className="text-xs text-muted-foreground">Changes to the personal copy won&apos;t change the group program.</p>
      <Button type="submit" disabled={pending || !selectedProgram}>
        {pending ? "Making copy…" : "Make personal copy"}
      </Button>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
