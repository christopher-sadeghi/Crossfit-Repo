import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ConsistencyStats } from "@/lib/consistency";

export function ConsistencySummary({ stats, compact = false }: { stats: ConsistencyStats; compact?: boolean }) {
  if (compact) return (
    <Card><CardContent className="flex flex-wrap gap-x-6 gap-y-2 py-4 text-sm">
      <p><strong>{stats.currentStreak}</strong> scheduled-day streak</p>
      <p>Last 30 days: <strong>{stats.windows[30].rate === null ? "No scheduled days yet" : `${stats.windows[30].rate}% complete`}</strong></p>
    </CardContent></Card>
  );
  return (
    <Card>
      <CardHeader><CardTitle>Consistency</CardTitle></CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {([7, 30, 90] as const).map((length) => {
            const window = stats.windows[length];
            return (
              <div key={length} className="rounded-md border p-3">
                <p className="text-sm text-muted-foreground">Last {length} days</p>
                <p className="text-2xl font-semibold">{window.rate === null ? "—" : `${window.rate}%`}</p>
                <p className="text-xs text-muted-foreground">{window.completed} completed · {window.partial} partial · {window.missed} missed</p>
                {window.rate === null && <p className="text-xs text-muted-foreground">No scheduled days to count yet.</p>}
              </div>
            );
          })}
        </div>
        <p className="text-sm">Current streak: <strong>{stats.currentStreak}</strong> · Best streak: <strong>{stats.bestStreak}</strong> scheduled days</p>
        <p className="text-sm text-muted-foreground">
          Last activity: {stats.daysSinceActivity === null ? "None recorded yet" : stats.daysSinceActivity === 0 ? "Today" : stats.daysSinceActivity === 1 ? "Yesterday" : `${stats.daysSinceActivity} days ago`}.
        </p>
        <p className="text-xs text-muted-foreground">Streaks follow scheduled days, so rest days do not break them. Partially completed days count as half toward your completion rate. Today is not counted until you start.</p>
      </CardContent>
    </Card>
  );
}

export function driftReasonText(reasons: ("inactive" | "declining")[], daysSinceActivity: number | null) {
  return reasons.map((reason) => reason === "inactive"
    ? daysSinceActivity === null ? "No activity recorded on recent scheduled days" : `No activity for ${daysSinceActivity} days`
    : "Completion is down at least 25 percentage points from the previous month").join(". ");
}
