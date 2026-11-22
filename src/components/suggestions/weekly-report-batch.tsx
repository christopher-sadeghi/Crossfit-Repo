"use client";

import { useState, useTransition } from "react";

import { approveSuggestion } from "@/app/(app)/suggestions/actions";
import { generateWeeklyReportInBatch, loadWeeklyReportBatch } from "@/app/(app)/suggestions/weekly-report-actions";
import { InlineSuggestionCard } from "./inline-suggestion-card";
import type { InlineSuggestion } from "@/lib/ai/inline-suggestion";
import { Button } from "@/components/ui/button";

export function WeeklyReportBatch({ week, reports }: { week: string; reports: Extract<InlineSuggestion, { type: "weekly_report" }>[] }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function approve() {
    if (!confirm(`Approve and share ${reports.length} draft report${reports.length === 1 ? "" : "s"} for ${week}?`)) return;
    setMessage("");
    setError("");
    startTransition(async () => {
      let approved = 0;
      for (const { id, report } of reports) {
        const form = new FormData();
        form.set("id", id);
        form.set("summary", report.summary);
        report.focus.forEach((point) => form.append("focus", point));
        const result = await approveSuggestion({}, form).catch(() => ({ error: "Couldn't approve this report." }));
        if (!result.error) approved++;
      }
      setMessage(`${approved} shared · ${reports.length - approved} not shared`);
    });
  }

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
    <details className="mb-4 rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium">Weekly reports · {reports.length} pending</summary>
      <div className="mt-3 grid gap-3">
        <Button type="button" className="justify-self-start" variant="outline" onClick={generate} disabled={pending}>
          Generate reports for all athletes
        </Button>
        <p className="text-sm text-muted-foreground">
          {week}. Drafts reports for active athletes who don&apos;t already have a draft or shared report for this week.
        </p>
        {message && <p role="status" className="text-sm">{message}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {reports.length > 0 && <>
          <Button type="button" className="justify-self-start" onClick={approve} disabled={pending}>Approve all {reports.length} pending reports</Button>
          <div className="grid gap-3">
            {reports.map((report) => <InlineSuggestionCard key={report.id} id={report.id} suggestion={report} />)}
          </div>
        </>}
      </div>
    </details>
  );
}
