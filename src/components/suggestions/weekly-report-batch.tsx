"use client";

import { useState, useTransition } from "react";

import { generateWeeklyReportInBatch, loadWeeklyReportBatch } from "@/app/(app)/suggestions/weekly-report-actions";
import { Button } from "@/components/ui/button";

export function WeeklyReportBatch({ week }: { week: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function generate() {
    setMessage("");
    setError("");
    startTransition(async () => {
      let drafted = 0;
      let skipped = 0;
      let failed = 0;
      try {
        const batch = await loadWeeklyReportBatch();
        if ("error" in batch) {
          setError(batch.error ?? "Couldn't start the batch.");
          return;
        }
        if (!batch.athleteIds.length) {
          setMessage("There are no active athletes to draft reports for.");
          return;
        }
        for (const [index, athleteId] of batch.athleteIds.entries()) {
          setMessage(`Checking athlete ${index + 1} of ${batch.athleteIds.length}…`);
          const result = await generateWeeklyReportInBatch(athleteId, batch.startOn);
          if (result.outcome === "stopped") {
            setError(result.message);
            break;
          }
          if (result.outcome === "drafted") drafted++;
          else if (result.outcome === "skipped") skipped++;
          else failed++;
        }
      } catch {
        setError("The batch was interrupted. You can run it again to pick up where it stopped.");
      }
      setMessage(`${drafted} drafted · ${skipped} skipped · ${failed} failed`);
    });
  }

  return (
    <div className="mb-4 grid justify-items-start gap-2">
      <Button type="button" variant="outline" onClick={generate} disabled={pending}>
        {pending ? "Generating reports…" : "Generate reports for all athletes"}
      </Button>
      <p className="text-sm text-muted-foreground">
        {week}. Drafts reports for active athletes who don&apos;t already have a draft or shared report for this week.
      </p>
      {message && <p role="status" className="text-sm">{message}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
