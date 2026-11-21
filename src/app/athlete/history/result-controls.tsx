"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { deleteAthleteResult } from "../actions";

export function AthleteResultControls({
  resultId,
  workoutId,
  workoutTitle,
}: {
  resultId: string;
  workoutId: string;
  workoutTitle: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function removeResult() {
    if (!confirm(`Delete your ${workoutTitle} result? This can't be undone.`)) return;
    setPending(true);
    setError("");
    const result = await deleteAthleteResult(resultId);
    setError(result.error ?? "");
    setPending(false);
  }

  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/athlete/log/${workoutId}?result=${resultId}`}>Edit</Link>
        </Button>
        <Button variant="ghost" size="sm" disabled={pending} onClick={removeResult}>
          {pending ? "Deleting…" : "Delete"}
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
