import Link from "next/link";

import { RequestWeeklyReportForm } from "@/components/suggestions/suggestion-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/units";
import { completedReportWeek, formatReportWeek, weeklyReportInputSchema } from "@/lib/weekly-report";

const reportWeekSchema = weeklyReportInputSchema.pick({ start_on: true, end_on: true });

export async function WeeklyReportsTab({ athleteId, today, active }: { athleteId: string; today: string; active: boolean }) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("ai_suggestions")
    .select("id, input, status, decided_at")
    .eq("athlete_id", athleteId)
    .eq("suggestion_type", "weekly_report")
    .in("status", ["pending", "approved", "edited"])
    .order("created_at", { ascending: false });
  return (
    <Card className="max-w-3xl">
      <CardHeader><CardTitle>Weekly reports</CardTitle></CardHeader>
      <CardContent className="grid gap-4">
        {active && (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">Last completed week · {formatReportWeek(completedReportWeek(today))}</p>
            <RequestWeeklyReportForm athleteId={athleteId} />
          </div>
        )}
        {error ? <p className="text-sm text-destructive">Couldn&apos;t load weekly reports.</p>
          : data.length === 0 ? <p className="text-sm text-muted-foreground">No weekly reports yet.</p>
          : (
            <ul className="divide-y border-t">
              {data.map((report) => {
                const week = reportWeekSchema.safeParse(report.input);
                return (
                  <li key={report.id} className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-3 text-sm">
                    <Link href={`/suggestions/${report.id}`} className="font-medium underline">
                      {week.success ? formatReportWeek(week.data) : "Weekly report"}
                    </Link>
                    <span className="text-muted-foreground">
                      {report.decided_at ? `Shared ${formatDate(report.decided_at)}` : "Pending review"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
      </CardContent>
    </Card>
  );
}
