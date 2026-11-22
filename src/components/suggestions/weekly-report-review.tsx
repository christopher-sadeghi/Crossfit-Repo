import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { ApproveWeeklyReportForm, RejectSuggestionForm } from "@/components/suggestions/suggestion-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WeeklyReportFigures, WeeklyReportText } from "@/components/weekly-report";
import { friendlySuggestionError } from "@/lib/ai/service-core";
import type { Tables } from "@/lib/supabase/database.types";
import { formatReportWeek, weeklyReportInputSchema, weeklyReportSchema } from "@/lib/weekly-report";

export function WeeklyReportReview({ suggestion, athleteName }: {
  suggestion: Tables<"ai_suggestions">;
  athleteName: string;
}) {
  const shared = suggestion.status === "approved" || suggestion.status === "edited";
  const pending = suggestion.status === "pending";
  const report = weeklyReportSchema.safeParse(shared ? suggestion.final : suggestion.proposal);
  const input = weeklyReportInputSchema.safeParse(suggestion.input);
  const week = input.success ? formatReportWeek(input.data) : null;

  return (
    <>
      <Link href="/settings/ai-history" className="mb-3 inline-block text-sm text-muted-foreground underline">Back to AI history</Link>
      <PageHeader title="Weekly athlete report" description={[athleteName, week].filter(Boolean).join(" · ")} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Badge variant={shared ? "default" : "outline"} className="capitalize">{shared ? "Shared" : suggestion.status}</Badge>
        {suggestion.athlete_id && (
          <Link href={`/athletes/${suggestion.athlete_id}?tab=reports`} className="text-sm underline">Athlete reports</Link>
        )}
      </div>
      {suggestion.status === "failed" && (
        <p className="text-sm text-destructive">
          {suggestion.error === "in_progress" ? "The report is being drafted." : friendlySuggestionError(suggestion.error)}
        </p>
      )}
      {report.success && input.success && (
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>{pending ? "Review before sharing" : "Report"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {pending ? <ApproveWeeklyReportForm id={suggestion.id} report={report.data} /> : <WeeklyReportText report={report.data} />}
            {pending && <RejectSuggestionForm id={suggestion.id} />}
            <WeeklyReportFigures sections={input.data.sections} />
          </CardContent>
        </Card>
      )}
      {pending && (!report.success || !input.success) && (
        <div className="grid gap-3">
          <p className="text-sm text-destructive">This draft couldn&apos;t be loaded. Reject it and try drafting again.</p>
          <RejectSuggestionForm id={suggestion.id} />
        </div>
      )}
    </>
  );
}
