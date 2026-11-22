import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SUGGESTION_LABELS, writeWorkoutInputSchema } from "@/lib/ai/suggestions";
import { PageHeader } from "@/components/layout/page-header";
import { athleteAdjustmentStatus } from "@/components/suggestions/athlete-adjustment-review";
import { inlineSuggestion } from "@/lib/ai/inline-suggestion";
import { completedReportWeek, formatReportWeek } from "@/lib/weekly-report";
import { WeeklyReportBatch } from "@/components/suggestions/weekly-report-batch";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/time-zone";
import { formatDate } from "@/lib/units";

const FILTERS = [
  { value: "pending", label: "Pending" },
  { value: "decided", label: "Decided" },
  { value: "ideas", label: "Food ideas" },
  { value: "failed", label: "Failed" },
] as const;

type Filter = (typeof FILTERS)[number]["value"];
type Props = { searchParams: Promise<{ status?: string }> };

export default async function Page({ searchParams }: Props) {
  const { status: requestedStatus } = await searchParams;
  const status: Filter = FILTERS.some((filter) => filter.value === requestedStatus) ? (requestedStatus as Filter) : "pending";
  const supabase = await createClient();
  const reportWeek = completedReportWeek(await getToday());
  const [weeklyReports, suggestionsResult] = await Promise.all([
    supabase.from("ai_suggestions").select("*, athletes(first_name, last_name)")
      .eq("suggestion_type", "weekly_report").eq("status", "pending")
      .contains("input", { start_on: reportWeek.start_on }).order("created_at"),
    (() => {
      let query = supabase
        .from("ai_suggestions")
        .select("id, suggestion_type, status, athlete_id, created_at, input, coach_reviewed_at")
        .order("created_at", { ascending: false });
      if (status === "pending") query = query.eq("status", "pending");
      else if (status === "failed") query = query.eq("status", "failed");
      else if (status === "ideas") query = query.eq("status", "idea");
      else query = query.in("status", ["approved", "edited", "rejected"]);
      return query;
    })(),
  ]);
  if (suggestionsResult.error || weeklyReports.error) throw new Error("Could not load AI history.");
  const suggestions = suggestionsResult.data ?? [];
  const athleteIds = [...new Set(suggestions.map((suggestion) => suggestion.athlete_id).filter((id): id is string => id != null))];
  const { data: athletes } = athleteIds.length
    ? await supabase.from("athletes").select("id, first_name, last_name").in("id", athleteIds)
    : { data: [] };
  const athleteNames = new Map((athletes ?? []).map((athlete) => [athlete.id, `${athlete.first_name} ${athlete.last_name}`]));
  const emptyMessage = status === "pending" ? "There are no pending suggestions." : status === "failed" ? "There are no failed suggestions." : status === "ideas" ? "No food ideas yet." : "There are no decided suggestions.";

  return (
    <>
      <Link href="/settings" className="mb-3 inline-block text-sm text-muted-foreground underline">← Settings</Link>
      <PageHeader title="AI history" description="See past AI suggestions or open a pending suggestion for review." />
      <WeeklyReportBatch week={formatReportWeek(reportWeek)} reports={(weeklyReports.data ?? []).map((row) => (
        inlineSuggestion(row, row.athletes && `${row.athletes.first_name} ${row.athletes.last_name}`)
      )).filter((row) => row.type === "weekly_report")} />
      <div className="mb-4 flex flex-wrap gap-2" aria-label="Filter suggestions">
        {FILTERS.map((filter) => (
          <Button key={filter.value} variant={filter.value === status ? "default" : "outline"} size="sm" asChild>
            <Link href={`/settings/ai-history?status=${filter.value}`} aria-current={filter.value === status ? "page" : undefined}>
              {filter.label}
            </Link>
          </Button>
        ))}
      </div>
      <Card className="pb-0">
        <CardContent className="p-0">
          {suggestions.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Type</TableHead>
                  <TableHead>Athlete</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suggestions.map((suggestion) => {
                  const workoutInput =
                    suggestion.suggestion_type === "write_workout"
                      ? writeWorkoutInputSchema.safeParse(suggestion.input)
                      : null;
                  const label =
                    workoutInput?.success && workoutInput.data.mode === "adjust"
                      ? "Adjust workout"
                      : SUGGESTION_LABELS[suggestion.suggestion_type];
                  const athleteStatus =
                    suggestion.suggestion_type === "athlete_adjust_workout" ? athleteAdjustmentStatus(suggestion) : null;
                  return (
                    <TableRow key={suggestion.id}>
                      <TableCell className="pl-4 font-medium">
                        <Link href={`/suggestions/${suggestion.id}`} className="hover:underline">{label}</Link>
                      </TableCell>
                      <TableCell>
                        {suggestion.athlete_id && athleteNames.has(suggestion.athlete_id) ? (
                          <Link href={`/athletes/${suggestion.athlete_id}`} className="hover:underline">
                            {athleteNames.get(suggestion.athlete_id)}
                          </Link>
                        ) : "—"}
                      </TableCell>
                      <TableCell>{formatDate(suggestion.created_at.slice(0, 10))}</TableCell>
                      <TableCell>
                        {athleteStatus ? (
                          <Badge variant={athleteStatus.variant}>{athleteStatus.label}</Badge>
                        ) : (
                          <Badge variant={suggestion.status === "failed" ? "destructive" : suggestion.status === "pending" ? "secondary" : "outline"}>
                            {suggestion.status}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="px-6 py-8 text-sm text-muted-foreground">{emptyMessage}</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
