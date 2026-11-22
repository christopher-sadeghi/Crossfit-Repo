import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadAthleteBenchmarks } from "@/lib/benchmarks";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/time-zone";
import { formatDate, formatScore, formatWeight, type Units } from "@/lib/units";
import { BenchmarkResultForm, DeleteBenchmarkResult } from "./benchmark-forms";
import { BenchmarkTrend } from "./benchmark-trend";

export default async function BenchmarksTab({
  athleteId,
  units,
}: {
  athleteId: string;
  units: Units;
}) {
  const supabase = await createClient();
  const today = await getToday();
  const [benchmarks, { data: auth }] = await Promise.all([
    loadAthleteBenchmarks(supabase, athleteId, today),
    supabase.auth.getUser(),
  ]);
  const attempted = benchmarks
    .filter((b) => b.attempts.length)
    .sort((a, b) => Number(b.retestDue) - Number(a.retestDue));
  const due = attempted.filter((b) => b.retestDue);
  return (
    <div className="grid min-w-0 gap-4">
      {due.length > 0 && (
        <Card className="border-amber-500/50">
          <CardHeader>
            <CardTitle>Due for retest</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {due.map((b) => (
              <p key={b.id} className="text-sm">
                <Badge variant="outline">Retest due</Badge>{" "}
                <strong>{b.name}</strong> · Last tested{" "}
                {formatDate(b.last!.performed_on)} · Every {b.retestWeeks} weeks
              </p>
            ))}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Log a benchmark</CardTitle>
        </CardHeader>
        <CardContent>
          <BenchmarkResultForm
            benchmarks={benchmarks}
            athleteId={athleteId}
            today={today}
            units={units}
          />
        </CardContent>
      </Card>
      {!attempted.length && (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No benchmark attempts yet. Log a result above, or complete a matching
          scheduled workout.
        </p>
      )}
      {attempted.map((b) => (
        <Card key={b.id} className="min-w-0">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>{b.name}</CardTitle>
              {b.retestDue && <Badge variant="outline">Retest due</Badge>}
            </div>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {b.description}
            </p>
          </CardHeader>
          <CardContent className="grid min-w-0 gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">
                Best: {formatScore(b.best!, units)}
              </span>
              <Badge variant={b.best!.is_rx ? "default" : "outline"}>
                {b.best!.is_rx ? "Rx" : "Scaled"}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {b.attempts.length}{" "}
                {b.attempts.length === 1 ? "attempt" : "attempts"}
              </span>
            </div>
            {b.kind === "lift" && (
              <div className="grid grid-cols-2 gap-2 rounded-md bg-muted p-3 text-sm">
                {(
                  [
                    ["1RM", b.bestActual.one],
                    ["3RM", b.bestActual.three],
                    ["5RM", b.bestActual.five],
                  ] as const
                ).map(([label, attempt]) => (
                  <p key={label}>
                    {label}:{" "}
                    <strong>
                      {attempt?.load_kg == null
                        ? "—"
                        : formatWeight(attempt.load_kg, units)}
                    </strong>
                  </p>
                ))}
                <p>
                  Est. 1RM:{" "}
                  <strong>
                    {b.best?.estimatedOneRmKg == null
                      ? "—"
                      : formatWeight(b.best.estimatedOneRmKg, units)}
                  </strong>
                </p>
                <p className="col-span-2 text-xs text-muted-foreground">
                  Epley estimate for sets of 1–10 reps only.
                </p>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Last attempt: {formatDate(b.last!.performed_on)} ·{" "}
              {formatScore(b.last!, units)} · {b.last!.is_rx ? "Rx" : "Scaled"}
              {b.retestWeeks != null &&
                ` · Retest every ${b.retestWeeks} weeks`}
            </p>
            <BenchmarkTrend
              points={b.trendPoints}
              lift={b.kind === "lift"}
              workoutType={b.workout_type}
              units={units}
            />
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                Attempt history ({b.attempts.length})
              </summary>
              <ul className="mt-3 grid gap-3">
                {[...b.attempts].reverse().map((a) => (
                  <li
                    key={`${a.source}-${a.id}`}
                    className="grid gap-2 rounded-md border p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span>
                        {formatDate(a.performed_on)} ·{" "}
                        <strong>{formatScore(a, units)}</strong>
                        {a.rep_max != null && ` × ${a.rep_max} reps`}
                      </span>
                      <Badge variant={a.is_rx ? "default" : "outline"}>
                        {a.is_rx ? "Rx" : "Scaled"}
                      </Badge>
                      {a.isPr && <Badge>New PR!</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {a.source === "direct"
                        ? "Direct entry"
                        : "Scheduled workout"}
                    </p>
                    {a.notes && (
                      <p className="whitespace-pre-wrap">{a.notes}</p>
                    )}
                    {a.source === "direct" &&
                      "logged_by" in a &&
                      a.logged_by === auth.user?.id && (
                        <DeleteBenchmarkResult id={a.id} />
                      )}
                  </li>
                ))}
              </ul>
            </details>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
