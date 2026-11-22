"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { deleteActivity } from "@/lib/activity-actions";

export function DeleteActivityButton({ athleteId, activityId }: { athleteId: string; activityId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  return (
    <div>
      <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={() => {
        if (!window.confirm("Delete this activity?")) return;
        setError("");
        startTransition(async () => {
          try {
            const result = await deleteActivity(athleteId, activityId);
            if (result.error) setError(result.error);
          } catch {
            setError("Couldn't delete the activity. Please try again.");
          }
        });
      }}>{pending ? "Deleting…" : "Delete activity"}</Button>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
