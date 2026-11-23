"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { setAthleteStatus } from "./actions";

export function ArchiveButton({ id, status }: { id: string; status: "active" | "archived" }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const archiving = status === "active";

  return (
    <div>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => {
          if (archiving && !confirm("Archive this athlete? You can restore them later.")) return;
          setError("");
          startTransition(async () => {
            try {
              const result = await setAthleteStatus(id, archiving ? "archived" : "active");
              if (result.error) setError(result.error);
            } catch {
              setError("Couldn't update the athlete.");
            }
          });
        }}
      >
        {pending ? "Saving…" : archiving ? "Archive" : "Restore"}
      </Button>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
