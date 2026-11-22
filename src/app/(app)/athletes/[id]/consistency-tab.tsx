import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConsistencyHeatmap } from "@/components/consistency-heatmap";
import { ConsistencySummary, driftReasonText } from "@/components/consistency-summary";
import { getCoach } from "@/lib/coach";
import { drifting } from "@/lib/consistency";
import { loadConsistency } from "@/lib/consistency-data";
import { addDays } from "@/lib/nutrition";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/time-zone";
import { formatDate } from "@/lib/units";
import { AttendanceForm, AttendanceToggle } from "./attendance-forms";

export default async function ConsistencyTab({ athleteId }: { athleteId: string }) {
  const supabase = await createClient();
  const [today, coach] = await Promise.all([getToday(), getCoach()]);
  const { stats, attendance } = await loadConsistency(supabase, athleteId, today);
  const flag = drifting(stats, { driftDays: coach?.driftDays });
  const recent = attendance.filter((a) => a.attended_on >= addDays(today, -29)).reverse();
  return (
    <div className="grid min-w-0 gap-4">
      {flag.drifting && <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/50 p-3 text-sm"><Badge variant="outline">Drifting</Badge><p>{driftReasonText(flag.reasons, flag.daysSinceActivity)}.</p></div>}
      <ConsistencySummary stats={stats} />
      <ConsistencyHeatmap days={stats.days} />
      <Card><CardHeader><CardTitle>Mark attendance</CardTitle><p className="text-sm text-muted-foreground">Count a training day even when no workout result was logged.</p></CardHeader><CardContent><AttendanceForm athleteId={athleteId} today={today} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Recent attendance</CardTitle><p className="text-sm text-muted-foreground">Last 30 days</p></CardHeader><CardContent>
        {recent.length ? <ul className="grid gap-3">{recent.map((entry) => <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3 text-sm"><div><p>{formatDate(entry.attended_on)} · {entry.kind === "class" ? "Class" : "Open gym"}</p>{entry.note && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{entry.note}</p>}</div><AttendanceToggle athleteId={athleteId} date={entry.attended_on} kind={entry.kind as "class" | "open_gym"} marked label="Remove" /></li>)}</ul> : <p className="text-sm text-muted-foreground">No attendance marked in the last 30 days.</p>}
      </CardContent></Card>
    </div>
  );
}
