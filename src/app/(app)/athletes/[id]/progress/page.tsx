import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { RequestProgressSummaryForm } from "@/components/suggestions/request-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCoach } from "@/lib/coach";
import { addDays, targetOn, totals } from "@/lib/nutrition";
import { getToday } from "@/lib/time-zone";
import { formatGoalValue, GOAL_TYPE_LABELS, goalProgress, loadPrsByMovement, TRACKING_LABELS } from "@/lib/progress";
import { loadLiftMaxes } from "@/lib/benchmarks";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatWeight, fromKg, type Units } from "@/lib/units";

import { MacroChart, PrChart, WeightChart } from "./charts";
import { DeleteMetricButton, GoalControls, GoalForm, MetricForm } from "./forms";
import { GoalBar } from "./goal-bar";

const MACRO_DAYS = 28;
const shortDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

type Props = { params: Promise<{ id: string }> };

export default async function AthleteProgressPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const coach = await getCoach();
  const units: Units = coach?.units ?? "lb";
  const now = await getToday();
  const since = addDays(now, -(MACRO_DAYS - 1));

  const [liftMaxes, athleteRes, metricsRes, goalsRes, resultsRes, movementsRes, targetsRes, foodRes] = await Promise.all([
    loadLiftMaxes(supabase, id),
    supabase.from("athletes").select("id, first_name, last_name").eq("id", id).maybeSingle(),
    supabase.from("body_metrics").select("id, measured_on, weight_kg, body_fat_pct, notes").eq("athlete_id", id).order("measured_on", { ascending: false }).order("created_at", { ascending: false }),
    supabase
      .from("goals")
      .select("id, title, goal_type, movement_id, metric, unit, start_value, target_value, target_date, status, achieved_at, movements(name)")
      .eq("athlete_id", id)
      .order("status")
      .order("target_date", { nullsFirst: false }),
    supabase.from("workout_results").select("performed_on, load_kg, reps, rounds, workouts(workout_type, workout_movements(movement_id))").eq("athlete_id", id),
    supabase.from("movements").select("id, name").order("name"),
    supabase.from("nutrition_targets").select("calories, protein_g, carbs_g, fat_g, start_date, end_date").eq("athlete_id", id),
    supabase.from("food_logs").select("logged_on, calories, protein_g, carbs_g, fat_g").eq("athlete_id", id).gte("logged_on", since).lte("logged_on", now),
  ]);

  const athlete = athleteRes.data;
  if (!athlete) notFound();
  const metrics = metricsRes.data ?? [];
  const goals = goalsRes.data ?? [];
  const results = resultsRes.data ?? [];
  const movements = movementsRes.data ?? [];
  const targets = targetsRes.data ?? [];
  const food = foodRes.data ?? [];

  const weightData = [...metrics]
    .reverse()
    .map((m) => ({
      date: shortDate(m.measured_on),
      weight: m.weight_kg == null ? null : fromKg(Number(m.weight_kg), units),
      bodyFat: m.body_fat_pct == null ? null : Number(m.body_fat_pct),
    }));

  const movementNames = new Map(movements.map((m) => [m.id, m.name]));
  const prData = [...loadPrsByMovement(results)]
    .map(([movementId, kg]) => ({ movement: movementNames.get(movementId) ?? "Unknown", load: fromKg(kg, units) }))
    .sort((a, b) => b.load - a.load);

  const macroDays = Array.from({ length: MACRO_DAYS }, (_, i) => addDays(since, i)).map((d) => {
    const rows = food.filter((f) => f.logged_on === d);
    const sum = rows.length ? totals(rows) : null;
    return { d, date: shortDate(d), sum, target: targetOn(targets, d) };
  });
  const hasMacros = macroDays.some((d) => d.sum || d.target);

  const name = `${athlete.first_name} ${athlete.last_name}`;
  const progressData = { metrics, results, liftMaxes };

  return (
    <>
      <Link href={`/athletes/${athlete.id}?tab=goals`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {name}
      </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Progress & goals</h1>
        <p className="mt-1 text-muted-foreground">{name}&apos;s body metrics, goals and trends.</p>
      </div>

      <section aria-label="Charts" className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Body weight</CardTitle>
          </CardHeader>
          <CardContent>
            {weightData.length ? <WeightChart data={weightData} units={units} /> : <Empty text="Log a measurement below to start this chart." />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Personal records by movement</CardTitle>
            <p className="text-sm text-muted-foreground">Heaviest load logged on strength or single-movement WODs.</p>
          </CardHeader>
          <CardContent>{prData.length ? <PrChart data={prData} units={units} /> : <Empty text="No loaded results logged yet." />}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Calories vs target</CardTitle>
            <p className="text-sm text-muted-foreground">Last {MACRO_DAYS} days.</p>
          </CardHeader>
          <CardContent>
            {hasMacros ? (
              <MacroChart label="Calories" unit="" data={macroDays.map((d) => ({ date: d.date, intake: d.sum?.calories ?? null, target: d.target?.calories ?? null }))} />
            ) : (
              <Empty text="No food logged or targets set in this period." />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Protein vs target</CardTitle>
            <p className="text-sm text-muted-foreground">Last {MACRO_DAYS} days.</p>
          </CardHeader>
          <CardContent>
            {hasMacros ? (
              <MacroChart label="Protein" unit="g" data={macroDays.map((d) => ({ date: d.date, intake: d.sum ? Math.round(d.sum.protein) : null, target: d.target?.protein_g ?? null }))} />
            ) : (
              <Empty text="No food logged or targets set in this period." />
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-label="Goals" className="mb-6 grid gap-4">
        <h2 className="text-lg font-semibold">Goals</h2>
        <Card>
          <CardHeader>
            <CardTitle>AI progress summary</CardTitle>
            <p className="text-sm text-muted-foreground">
              A short note on how {athlete.first_name} is tracking toward each goal. You review it, then choose whether to save it to their notes.
            </p>
          </CardHeader>
          <CardContent>
            <RequestProgressSummaryForm athleteId={athlete.id} />
          </CardContent>
        </Card>
        {goals.length === 0 && <p className="text-sm text-muted-foreground">No goals yet. Add one below.</p>}
        <div className="grid gap-4 lg:grid-cols-2">
          {goals.map((g) => {
            const p = goalProgress(g, progressData);
            const kgGoal = g.unit === "kg";
            const display = (v: number | null) => (v == null ? null : kgGoal ? fromKg(Number(v), units) : Number(v));
            return (
              <Card key={g.id} className={g.status === "active" ? undefined : "opacity-80"}>
                <CardContent className="grid gap-3">
                  <GoalControls
                    athleteId={athlete.id}
                    units={units}
                    movements={movements}
                    status={g.status}
                    goal={{
                      id: g.id,
                      title: g.title,
                      goal_type: g.goal_type,
                      tracking: p.tracking,
                      movement_id: g.movement_id,
                      metric: g.metric,
                      unit: g.unit,
                      start_value: display(g.start_value),
                      target_value: display(g.target_value),
                      target_date: g.target_date,
                    }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{g.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {GOAL_TYPE_LABELS[g.goal_type]}
                          {g.movements?.name && ` · ${g.movements.name}`}
                          {g.metric && ` · ${g.metric}`}
                          {g.target_date && ` · by ${formatDate(g.target_date)}`}
                        </p>
                      </div>
                      <Badge variant={g.status === "achieved" ? "default" : g.status === "active" ? "secondary" : "outline"} className="capitalize">
                        {g.status === "abandoned" ? "Closed" : g.status}
                      </Badge>
                    </div>
                    <GoalBar pct={p.pct} label={g.title} />
                    <p className="text-sm">
                      <span className="text-muted-foreground">Start</span> {formatGoalValue(g.start_value, g.unit, units)} ·{" "}
                      <span className="text-muted-foreground">Now</span> <strong>{formatGoalValue(p.current, g.unit, units)}</strong> ·{" "}
                      <span className="text-muted-foreground">Target</span> {formatGoalValue(g.target_value, g.unit, units)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.tracking === "manual"
                        ? "Not tracked automatically. Mark it achieved when it's done."
                        : p.current == null
                          ? `${TRACKING_LABELS[p.tracking]}: no data yet.`
                          : TRACKING_LABELS[p.tracking]}
                      {g.status === "active" && p.reached && <strong className="text-foreground"> Target reached. Mark it achieved?</strong>}
                    </p>
                  </GoalControls>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Add a goal</CardTitle>
          </CardHeader>
          <CardContent>
            <GoalForm athleteId={athlete.id} units={units} movements={movements} />
          </CardContent>
        </Card>
      </section>

      <section aria-label="Body metrics" className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Log body metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <MetricForm athleteId={athlete.id} today={now} units={units} />
          </CardContent>
        </Card>
        <Card className="pb-0">
          <CardHeader>
            <CardTitle>Measurement history</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {metrics.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Date</TableHead>
                    <TableHead>Weight</TableHead>
                    <TableHead>Body fat</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="pl-4">{formatDate(m.measured_on)}</TableCell>
                      <TableCell>{formatWeight(m.weight_kg, units)}</TableCell>
                      <TableCell>{m.body_fat_pct == null ? "—" : `${m.body_fat_pct}%`}</TableCell>
                      <TableCell className="max-w-40 truncate text-muted-foreground">{m.notes ?? ""}</TableCell>
                      <TableCell className="w-12 text-right">
                        <DeleteMetricButton id={m.id} label={formatDate(m.measured_on)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="px-6 pb-6 text-sm text-muted-foreground">No measurements yet.</p>
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="flex h-64 items-center justify-center text-center text-sm text-muted-foreground">{text}</p>;
}
