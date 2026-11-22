import { ActivityForm } from "@/components/activity-form";
import { ActivityList } from "@/components/activity-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { loadTrainingLoad } from "@/lib/training-load-data";
import { MIN_WARNING_LOAD, shouldWarnAboutLoad } from "@/lib/training-load";
import { formatDate, type Units } from "@/lib/units";

const displayLoad = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 1 });

export function LoadTab({ athleteId, today, defaultDate, units, load, threshold }: {
  athleteId: string;
  today: string;
  defaultDate: string;
  units: Units;
  load: Awaited<ReturnType<typeof loadTrainingLoad>>;
  threshold: number;
}) {
  const peak = Math.max(1, ...load.weekly.map((week) => week.gym + week.outside));
  const warning = shouldWarnAboutLoad(load.acute, load.ratio, threshold);
  const estimatedCount = load.weekly.reduce((sum, week) => sum + week.estimatedGymSessions, 0);

  return (
    <>
      <Card>
        <CardHeader><CardTitle>Training load</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div><dt className="text-sm text-muted-foreground">Last 7 days</dt><dd className="text-xl font-semibold">{displayLoad(load.acute)}</dd></div>
            <div><dt className="text-sm text-muted-foreground">28-day weekly average</dt><dd className="text-xl font-semibold">{displayLoad(load.chronic)}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Acute:chronic ratio</dt><dd className="text-xl font-semibold">{load.ratio == null ? "—" : `${load.ratio.toFixed(2)}×`}</dd></div>
          </dl>
          {warning && <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-sm font-medium">High training load compared with the last 28 days.</p>}
          <p className="text-xs text-muted-foreground">Session load is minutes × RPE. Alerts require at least {displayLoad(MIN_WARNING_LOAD)} load in 7 days and a ratio above {threshold}×.</p>
          {load.estimatedGymSessions28 > 0 && (
            <p className="text-xs text-muted-foreground">The 28-day load includes {load.estimatedGymSessions28} estimated gym {load.estimatedGymSessions28 === 1 ? "session" : "sessions"}.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Weekly load · gym vs outside</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <ul className="grid gap-3">
            {load.weekly.map((week) => (
              <li key={week.to} className="grid gap-1 text-sm">
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                  <span>Week ending {formatDate(week.to)}</span>
                  <span className="text-muted-foreground">Gym {displayLoad(week.gym)}{week.estimatedGymSessions > 0 ? " (incl. estimates)" : ""} · Outside {displayLoad(week.outside)}</span>
                </div>
                <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <span className="bg-primary" style={{ width: `${100 * week.gym / peak}%` }} />
                  <span className="bg-teal-500" style={{ width: `${100 * week.outside / peak}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <div className="flex gap-4 text-xs text-muted-foreground" aria-hidden="true">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary" />Gym</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-teal-500" />Outside</span>
          </div>
          {estimatedCount > 0 && <p className="text-xs text-muted-foreground">Gym estimates use the time cap or a typical duration when no duration is logged, and RPE 6 when no RPE is logged.</p>}
        </CardContent>
      </Card>
      <Card id="log-activity">
        <CardHeader><CardTitle>Log activity</CardTitle></CardHeader>
        <CardContent><ActivityForm key={defaultDate} athleteId={athleteId} today={today} defaultDate={defaultDate} units={units} /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Recent outside activities</CardTitle></CardHeader>
        <CardContent><ActivityList activities={load.activities.slice(0, 12)} today={today} units={units} /></CardContent>
      </Card>
    </>
  );
}
