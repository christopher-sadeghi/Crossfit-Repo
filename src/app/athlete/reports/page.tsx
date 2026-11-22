import { WeeklyReportFigures, WeeklyReportText } from "@/components/weekly-report";
import { createClient } from "@/lib/supabase/server";
import { formatReportWeek, weeklyReportInputSchema, weeklyReportSchema } from "@/lib/weekly-report";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ report?: string }> }) {
  const { report: selected } = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("athlete_weekly_reports");
  const reports = (data ?? []).flatMap(({ id, snapshot, content }) => {
    const input = weeklyReportInputSchema.safeParse(snapshot);
    const report = weeklyReportSchema.safeParse(content);
    return input.success && report.success ? [{ id, input: input.data, report: report.data }] : [];
  });
  const openId = reports.find(({ id }) => id === selected)?.id ?? reports[0]?.id;

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Reports</h1>
      {error ? <p role="alert" className="text-sm text-destructive">Couldn&apos;t load your reports. Please try again.</p>
        : reports.length === 0 && <p className="text-sm text-muted-foreground">Your weekly reports will appear here when your coach shares them.</p>}
      {reports.map(({ id, input, report }) => (
        <details key={id} id={`report-${id}`} open={openId === id} className="scroll-mt-4 rounded-xl border bg-card p-4 text-card-foreground">
          <summary className="cursor-pointer text-sm font-semibold">{formatReportWeek(input)}</summary>
          <div className="mt-4 grid gap-4">
            <WeeklyReportText report={report} />
            <WeeklyReportFigures sections={input.sections} />
          </div>
        </details>
      ))}
    </div>
  );
}
