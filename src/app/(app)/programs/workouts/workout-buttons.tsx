"use client";

import { Copy, Trash2 } from "lucide-react";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";

import { deleteWorkout, duplicateWorkout } from "./actions";

export function WorkoutButtons({ id, resultCount }: { id: string; resultCount: number }) {
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button variant="outline" disabled={pending} onClick={() => startTransition(() => duplicateWorkout(id))}>
        <Copy /> Duplicate
      </Button>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => {
          const warning = resultCount
            ? `This also deletes ${resultCount} logged result${resultCount === 1 ? "" : "s"}. `
            : "";
          if (confirm(`Delete this WOD? ${warning}This can't be undone.`)) startTransition(() => deleteWorkout(id));
        }}
      >
        <Trash2 /> Delete
      </Button>
    </>
  );
}
