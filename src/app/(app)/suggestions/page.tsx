import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SUGGESTION_LABELS, writeWorkoutInputSchema } from "@/lib/ai/suggestions";
import { PageHeader } from "@/components/layout/page-header";
import { athleteAdjustmentStatus } from "@/components/suggestions/athlete-adjustment-review";
import { WeeklyReportBatch } from "@/components/suggestions/weekly-report-batch";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/time-zone";
import { formatDate } from "@/lib/units";
import { completedReportWeek, formatReportWeek } from "@/lib/weekly-report";

const FILTERS = [
  { value: "pending", label: "Pending" },
  { value: "athlete", label: "Athlete changes" },
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
  const [{ count }, { count: athleteCount }, suggestionsResult] = await Promise.all([
    supabase.from("ai_suggestions").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase
      .from("ai_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("suggestion_type", "athlete_adjust_workout")
      .in("status", ["approved", "edited"])
      .is("coach_reviewed_at", null),
    (() => {
      let query = supabase
        .from("ai_suggestions")
        .select("id, suggestion_type, status, athlete_id, created_at, input, coach_reviewed_at")
        .order("created_at", { ascending: false });
      if (status === "pending") query = query.eq("status", "pending");
      else if (status === "athlete") query = query.eq("suggestion_type", "athlete_adjust_workout");
      else if (status === "failed") query = query.eq("status", "failed");
      else if (status === "ideas") query = query.eq("status", "idea");
      else query = query.in("status", ["approved", "edited", "rejected"]);
      return query;
    })(),
  ]);
  const suggestions = suggestionsResult.data ?? [];
  const athleteIds = [...new Set(suggestions.map((suggestion) => suggestion.athlete_id).filter((id): id is string => id != null))];
  const { data: athletes } = athleteIds.length
    ? await supabase.from("athletes").select("id, first_name, last_name").in("id", athleteIds)
    : { data: [] };
  const athleteNames = new Map((athletes ?? []).map((athlete) => [athlete.id, `${athlete.first_name} ${athlete.last_name}`]));
  const emptyMessage = status === "pending" ? "There are no pending suggestions." : status === "athlete" ? "No athlete has adjusted a WOD yet." : status === "failed" ? "There are no failed suggestions." : status === "ideas" ? "No food ideas yet." : "There are no decided suggestions.";

  return (
    <>
      <PageHeader title="AI Suggestions" description={`${count ?? 0} pending suggestion${count === 1 ? "" : "s"} to review.${athleteCount ? ` ${athleteCount} athlete change${athleteCount === 1 ? "" : "s"} to review.` : ""}`} />
      <WeeklyReportBatch week={formatReportWeek(completedReportWeek(await getToday()))} />
      <div className="mb-4 flex flex-wrap gap-2" aria-label="Filter suggestions">
        {FILTERS.map((filter) => (
          <Button key={filter.value} variant={filter.value === status ? "default" : "outline"} size="sm" asChild>
            <Link href={`/suggestions?status=${filter.value}`} aria-current={filter.value === status ? "page" : undefined}>
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
