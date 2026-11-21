"use client";

import { Trash2, X } from "lucide-react";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";

import { deleteProgram, unassignProgram, unplaceWorkout } from "./actions";

export function DeleteProgramButton({ id, workoutCount }: { id: string; workoutCount: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => {
        const warning = workoutCount
          ? `This also deletes its ${workoutCount} WOD${workoutCount === 1 ? "" : "s"} and their logged results. `
          : "";
        if (confirm(`Delete this program? ${warning}This can't be undone.`)) startTransition(() => deleteProgram(id));
      }}
    >
      <Trash2 /> Delete
    </Button>
  );
}

export function UnplaceButton({ programId, workoutId, title }: { programId: string; workoutId: string; title: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Remove ${title} from program`}
      title="Remove from program (keeps the WOD)"
      className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
      onClick={() => startTransition(() => unplaceWorkout(programId, workoutId))}
    >
      <X className="size-3.5" />
    </button>
  );
}

export function UnassignButton({ programId, assignmentId, name }: { programId: string; assignmentId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-label={`Unassign ${name}`}
      onClick={() => {
        if (confirm(`Remove ${name} from this program?`)) startTransition(() => unassignProgram(programId, assignmentId));
      }}
    >
      {pending ? "Removing…" : "Unassign"}
    </Button>
  );
}
