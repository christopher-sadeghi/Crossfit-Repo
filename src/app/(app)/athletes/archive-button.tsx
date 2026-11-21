"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";

import { setAthleteStatus } from "./actions";

export function ArchiveButton({ id, status }: { id: string; status: "active" | "archived" }) {
  const [pending, startTransition] = useTransition();
  const archiving = status === "active";

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (archiving && !confirm("Archive this athlete? You can restore them later.")) return;
        startTransition(() => setAthleteStatus(id, archiving ? "archived" : "active"));
      }}
    >
      {pending ? "Saving…" : archiving ? "Archive" : "Restore"}
    </Button>
  );
}
