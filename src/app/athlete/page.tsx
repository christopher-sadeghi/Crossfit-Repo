import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { programDate, today } from "@/lib/program-dates";
import { createClient } from "@/lib/supabase/server";
import { feedbackSummary } from "@/lib/feedback";
import { formatDate, formatScore } from "@/lib/units";
import { getViewer } from "@/lib/viewer";

import { formatHeadline, Whiteboard } from "../(app)/programs/workouts/whiteboard";
import { AthleteResultForm } from "./log/[workoutId]/result-form";

export default async function AthleteTodayPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.kind === "coach") redirect("/");
  if (viewer.kind === "none") redirect("/no-access");

  const supabase = await createClient();
  const { data: assignments } = await supabase
    .from("program_assignments")
    .select(
      "start_date, programs(id, name, workouts(id, title, workout_type, time_cap_seconds, rounds, description, notes, week_number, day_number, workout_movements(position, sets, reps, load_kg, distance_m, calories, duration_seconds, notes, movements(name))))",
    )
    .eq("athlete_id", viewer.athleteId);

  const currentDate = today();
  const scheduled = (assignments ?? []).flatMap((assignment) => {
    const program = assignment.programs;
    if (!program) return [];

    return program.workouts
      .filter((workout) => workout.week_number != null && workout.day_number != null)
      .map((workout) => ({
        ...workout,
        programName: program.name,
        date: programDate(assignment.start_date, workout.week_number!, workout.day_number!),
      }));
  });

  const todayWods = scheduled
    .filter((workout) => workout.date === currentDate)
    .sort((a, b) => a.title.localeCompare(b.title));
  const recentStart = new Date(`${currentDate}T00:00:00Z`);
  recentStart.setUTCDate(recentStart.getUTCDate() - 7);
  const recentStartIso = recentStart.toISOString().slice(0, 10);
  const recentWods = scheduled
    .filter((workout) => workout.date >= recentStartIso && workout.date < currentDate)
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
  const upcoming = scheduled
    .filter((workout) => workout.date > currentDate)
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
    .slice(0, 5);
  const todayWorkoutIds = todayWods.map((workout) => workout.id);
  const workoutIds = [...new Set([...todayWods, ...recentWods].map((workout) => workout.id))];
  const [{ data: claims }, { data: athleteResults }] = workoutIds.length
    ? await Promise.all([
        supabase.auth.getClaims(),
        supabase
          .from("workout_results")
          .select(
            "id, workout_id, performed_on, logged_by, created_at, time_seconds, rounds, reps, load_kg, is_rx, notes, rpe, energy, sleep_hours, soreness",
          )
          .eq("athlete_id", viewer.athleteId)
          .in("workout_id", workoutIds)
          .order("created_at", { ascending: false }),
      ])
    : [{ data: null }, { data: [] }];
  const userId = claims?.claims?.sub;
  const resultByWorkout = new Map<string, NonNullable<typeof athleteResults>[number]>();
  const todayResultByWorkout = new Map<string, NonNullable<typeof athleteResults>[number]>();
  for (const result of athleteResults ?? []) {
    if (!resultByWorkout.has(result.workout_id)) resultByWorkout.set(result.workout_id, result);
    if (
      result.performed_on === currentDate &&
      result.logged_by === userId &&
      !todayResultByWorkout.has(result.workout_id)
    ) {
      todayResultByWorkout.set(result.workout_id, result);
    }
  }
  const recentWithoutResults = recentWods.filter((workout) => !resultByWorkout.has(workout.id));
  const { data: scalings } = todayWorkoutIds.length
    ? await supabase
        .from("athlete_workout_scalings")
        .select("workout_id, modifications")
        .eq("athlete_id", viewer.athleteId)
        .in("workout_id", todayWorkoutIds)
    : { data: [] };
  const scalingByWorkout = new Map(
    (scalings ?? []).map((scaling) => [scaling.workout_id, scaling.modifications]),
  );

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Today&apos;s WOD</h1>
        {todayWods.length ? (
          todayWods.map((workout) => {
            const movements = [...(workout.workout_movements ?? [])]
              .sort((a, b) => a.position - b.position)
              .map(({ movements: movement, ...item }) => ({
                ...item,
                name: movement?.name ?? "",
              }));
            const scaling = scalingByWorkout.get(workout.id);
            const todayResult = todayResultByWorkout.get(workout.id);

            return (
              <div key={workout.id} className="grid gap-3">
                <p className="text-sm text-muted-foreground">{workout.programName}</p>
                <Whiteboard workout={workout} movements={movements} units={viewer.units} />
                {scaling && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Your scaling</CardTitle>
                    </CardHeader>
                    <CardContent className="whitespace-pre-line text-sm">{scaling}</CardContent>
                  </Card>
                )}
                {todayResult ? (
                  <Card>
                    <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
                      <CardTitle className="text-sm">Your result</CardTitle>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/athlete/log/${workout.id}?result=${todayResult.id}`}>Edit result</Link>
                      </Button>
                    </CardHeader>
                    <CardContent className="grid gap-1 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{formatScore(todayResult, viewer.units)}</span>
                        <Badge variant={todayResult.is_rx ? "default" : "outline"}>
                          {todayResult.is_rx ? "Rx" : "Scaled"}
                        </Badge>
                      </div>
                      {feedbackSummary(todayResult) && (
                        <p className="text-muted-foreground">{feedbackSummary(todayResult)}</p>
                      )}
                      {todayResult.notes && <p className="text-muted-foreground">{todayResult.notes}</p>}
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Log your result</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <AthleteResultForm
                        workoutId={workout.id}
                        workoutType={workout.workout_type}
                        today={currentDate}
                        minDate={currentDate}
                        defaultDate={currentDate}
                        units={viewer.units}
                        existingResult={null}
                        inline
                      />
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })
        ) : (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              No workout scheduled today.
            </CardContent>
          </Card>
        )}
      </section>

      {recentWithoutResults.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">Recent</h2>
          {recentWithoutResults.map((workout) => (
            <Card key={`${workout.programName}-${workout.id}`}>
              <CardContent className="flex items-start justify-between gap-3 py-4">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{formatDate(workout.date)}</p>
                  <p className="font-medium">{workout.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {workout.programName}
                    {formatHeadline(workout) ? ` · ${formatHeadline(workout)}` : ""}
                  </p>
                </div>
                <Button asChild size="sm">
                  <Link href={`/athlete/log/${workout.id}?date=${workout.date}`}>Log result</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">Coming up</h2>
          {upcoming.map((workout) => (
            <Card key={workout.id}>
              <CardContent className="flex items-start gap-3 py-4">
                <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{formatDate(workout.date)}</p>
                  <p className="font-medium">{workout.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {workout.programName}
                    {formatHeadline(workout) ? ` · ${formatHeadline(workout)}` : ""}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}
