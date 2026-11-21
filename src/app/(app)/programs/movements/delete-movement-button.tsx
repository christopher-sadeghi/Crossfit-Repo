"use client";

import { Trash2 } from "lucide-react";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";

import { deleteMovement } from "./actions";

export function DeleteMovementButton({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Delete ${name}`}
      disabled={pending}
      onClick={() => {
        if (!confirm(`Delete ${name}?`)) return;
        startTransition(async () => {
          const { error } = await deleteMovement(id);
          if (error) alert(error);
        });
      }}
    >
      <Trash2 />
    </Button>
  );
}
