"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { saveAssignedCoach } from "./assigned-coach-action";

export function AssignedCoachForm({ athleteId, assignedCoachId, coaches }: {
  athleteId: string;
  assignedCoachId: string | null;
  coaches: { id: string; fullName: string }[];
}) {
  const [state, action, pending] = useActionState(saveAssignedCoach, {});
  return <form action={action} className="grid gap-3 sm:grid-cols-[1fr_auto]">
    <input type="hidden" name="athlete_id" value={athleteId} />
    <label className="grid gap-1 text-sm">
      Assigned coach
      <select name="assigned_coach_id" defaultValue={assignedCoachId ?? ""} className="h-9 rounded-md border bg-background px-2">
        <option value="">Gym owner (default)</option>
        {coaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.fullName}</option>)}
      </select>
    </label>
    <Button type="submit" variant="outline" disabled={pending} className="self-end">{pending ? "Saving…" : "Save coach"}</Button>
    {state.error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{state.error}</p>}
    {state.message && <p role="status" className="text-sm text-muted-foreground sm:col-span-2">{state.message}</p>}
  </form>;
}
