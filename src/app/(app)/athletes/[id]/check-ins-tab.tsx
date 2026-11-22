import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CHECK_IN_LABELS, checkInAttention, readinessLabel, type CheckIn } from "@/lib/check-in";
import { addDays } from "@/lib/nutrition";
import { formatDate } from "@/lib/units";

const METRICS = ["readiness", "sleep_hours", "soreness", "stress", "energy", "mood"] as const;
type Metric = (typeof METRICS)[number];

function average(entries: CheckIn[], key: Metric) {
  const values = entries.flatMap((entry) => entry[key] == null ? [] : [Number(entry[key])]);
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10 : null;
}

function trendLabel(current: number | null, previous: number | null, key: Metric) {
  if (current == null || previous == null) return "No comparison";
  if (current === previous) return `→ Unchanged vs ${previous}`;
  const lowerIsBetter = key === "soreness" || key === "stress";
  const better = lowerIsBetter ? current < previous : current > previous;
  return `${current > previous ? "↑" : "↓"} ${better ? "Better" : "Worse"} vs ${previous}`;
}

export function CheckInsTab({ entries, today }: { entries: CheckIn[]; today: string }) {
  const sorted = entries
    .filter((entry) => entry.entry_on <= today)
    .sort((a, b) => b.entry_on.localeCompare(a.entry_on));
  const attention = checkInAttention(sorted, today);
  const latest = sorted.find((entry) => entry.readiness != null);
  const last28 = sorted.filter((entry) => entry.entry_on >= addDays(today, -27));
  const areas = new Map<string, number>();
  for (const entry of last28) {
    for (const area of new Set(entry.soreness_areas)) {
      areas.set(area, (areas.get(area) ?? 0) + 1);
    }
  }
  const topAreas = [...areas].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="grid gap-4">
      {attention.flagged && (
        <Card className="ring-amber-300/70" role="status">
          <CardHeader>
            <CardTitle>
              <Badge variant="destructive">Needs attention</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1 text-sm">
              {attention.reasons.map((reason) => (
                <li key={`${reason.date}-${reason.text}`}>
                  <span className="font-medium">{formatDate(reason.date)}</span>: {reason.text}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Latest readiness</CardTitle>
        </CardHeader>
        <CardContent>
          {latest ? (
            <>
              <p className="text-2xl font-semibold">
                {latest.readiness}/100 · {readinessLabel(latest.readiness)}
              </p>
              <p className="text-sm text-muted-foreground">{formatDate(latest.entry_on)}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No complete check-in yet.</p>
          )}
        </CardContent>
      </Card>

      {[7, 28].map((days) => {
        const current = sorted.filter((entry) => entry.entry_on >= addDays(today, 1 - days));
        const previous = sorted.filter((entry) =>
          entry.entry_on < addDays(today, 1 - days) && entry.entry_on >= addDays(today, 1 - days * 2),
        );
        return (
          <Card key={days}>
            <CardHeader>
              <CardTitle>{days}-day averages vs previous {days} days</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {METRICS.map((key) => {
                const now = average(current, key);
                const before = average(previous, key);
                return (
                  <div key={key} className="grid gap-1 rounded-md border p-3">
                    <p className="text-sm font-medium">{CHECK_IN_LABELS[key]}</p>
                    <p className="text-lg font-semibold">{now ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{trendLabel(now, before, key)}</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader>
          <CardTitle>Readiness · last 28 days</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <div className="flex h-40 items-end gap-1" role="img" aria-label="Daily readiness scores for the last 28 days">
            {Array.from({ length: 28 }, (_, i) => {
              const date = addDays(today, i - 27);
              const entry = last28.find((item) => item.entry_on === date);
              return (
                <div
                  key={date}
                  className="flex h-full flex-1 items-end"
                  title={`${formatDate(date)}: ${entry?.readiness ?? "No score"}`}
                >
                  <div
                    className={entry?.readiness != null ? "w-full rounded-t bg-primary" : "w-full bg-muted"}
                    style={{ height: entry?.readiness == null ? "2px" : `${entry.readiness}%` }}
                  />
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {formatDate(addDays(today, -27))} — {formatDate(today)} · hover bars for scores
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top sore areas · last 28 days</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-1.5">
          {topAreas.length ? topAreas.map(([area, count]) => (
            <Badge key={area} variant="secondary">
              {area} ({count})
            </Badge>
          )) : (
            <p className="text-sm text-muted-foreground">No sore areas reported.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Check-in history</CardTitle>
        </CardHeader>
        <CardContent>
          {sorted.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  {["Date", "Readiness", "Sleep (h)", "Sleep quality", "Soreness", "Areas", "Stress", "Energy", "Mood", "Note"].map((label) => (
                    <TableHead key={label}>{label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((entry) => (
                  <TableRow key={entry.entry_on}>
                    <TableCell>{formatDate(entry.entry_on)}</TableCell>
                    <TableCell>{entry.readiness ?? "—"}</TableCell>
                    <TableCell>{entry.sleep_hours ?? "—"}</TableCell>
                    <TableCell>{entry.sleep_quality ?? "—"}</TableCell>
                    <TableCell>{entry.soreness ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {entry.soreness_areas.map((area) => (
                          <Badge key={area} variant="secondary">
                            {area}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{entry.stress ?? "—"}</TableCell>
                    <TableCell>{entry.energy ?? "—"}</TableCell>
                    <TableCell>{entry.mood ?? "—"}</TableCell>
                    <TableCell className="max-w-xs whitespace-normal">{entry.notes ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No check-ins yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
