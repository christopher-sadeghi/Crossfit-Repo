import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { scaleWorkoutDetailsSchema } from "@/lib/ai/scale-workout";
import { SCHEDULE_LABEL, loadAthleteSchedule } from "@/lib/athlete-schedule";
import { getToday } from "@/lib/time-zone";
import { createClient } from "@/lib/supabase/server";
import { feedbackSummary } from "@/lib/feedback";
import { formatDate, formatScore } from "@/lib/units";
import { getViewer } from "@/lib/viewer";

import { formatHeadline, formatMovementLine, Whiteboard, type WhiteboardWorkout } from "../(app)/programs/workouts/whiteboard";
import { AthleteResultForm } from "./log/[workoutId]/result-form";
import { ScrollIntoView } from "./scroll-into-view";

type TodayWorkout = WhiteboardWorkout & {
  id: string;
  source_workout_id: string | null;
  week_number: number | null;
  day_number: number | null;
  workout_movements: {
    position: number;
    sets: number | null;
    reps: number | null;
    load_kg: number | null;
    distance_m: number | null;
    calories: number | null;
    duration_seconds: number | null;
    notes: string | null;
    movements: { id: string; name: string } | null;
  }[];
};

export default async function AthleteTodayPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.kind === "coach") redirect("/");
  if (viewer.kind === "none") redirect("/no-access");

  const supabase = await createClient();
  const currentDate = await getToday();
  const recentStart = new Date(`${currentDate}T00:00:00Z`);
  recentStart.setUTCDate(recentStart.getUTCDate() - 7);
  const recentStartIso = recentStart.toISOString().slice(0, 10);
  const scheduled = await loadAthleteSchedule<TodayWorkout>(
    supabase,
    viewer.athleteId,
    { from: recentStartIso, to: "9999-12-31" },
    "id, source_workout_id, title, workout_type, time_cap_seconds, rounds, description, notes, week_number, day_number, workout_movements(position, sets, reps, load_kg, distance_m, calories, duration_seconds, notes, movements(id, name))",
  );

  const todayWods = scheduled
    .filter((item) => item.date === currentDate)
    .sort((a, b) => a.workout.title.localeCompare(b.workout.title));
  const recentWods = scheduled
    .filter((item) => item.date >= recentStartIso && item.date < currentDate)
    .sort((a, b) => b.date.localeCompare(a.date) || a.workout.title.localeCompare(b.workout.title));
  const upcoming = scheduled
    .filter((item) => item.date > currentDate)
    .slice(0, 5);
  const todayWorkoutIds = todayWods.map((item) => item.workout.id);
  const workoutIds = [
    ...new Set(
      [...todayWods, ...recentWods].flatMap((item) =>
        [item.workout.id, item.workout.source_workout_id].filter((id): id is string => Boolean(id)),
      ),
    ),
  ];
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
  const resultForWorkout = (workout: TodayWorkout) =>
    resultByWorkout.get(workout.id) ??
    (workout.source_workout_id ? resultByWorkout.get(workout.source_workout_id) : undefined);
  const todayResultForWorkout = (workout: TodayWorkout) =>
    todayResultByWorkout.get(workout.id) ??
    (workout.source_workout_id ? todayResultByWorkout.get(workout.source_workout_id) : undefined);
  const recentWithoutResults = recentWods.filter((item) => !resultForWorkout(item.workout));
  const { data: scalings } = todayWorkoutIds.length
    ? await supabase
        .from("athlete_workout_scalings")
        .select("workout_id, modifications, details")
        .eq("athlete_id", viewer.athleteId)
        .in("workout_id", todayWorkoutIds)
    : { data: [] };
  const { data: todayJournal } = await supabase
    .from("athlete_journal_entries")
    .select("entry_on")
    .eq("athlete_id", viewer.athleteId)
    .eq("entry_on", currentDate)
    .maybeSingle();
  const scalingByWorkout = new Map(
    (scalings ?? []).map((scaling) => [scaling.workout_id, scaling]),
  );

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Today&apos;s WOD</h1>
        {todayWods.length ? (
          todayWods.map((item) => {
            const workout = item.workout;
            const movements = [...(workout.workout_movements ?? [])]
              .sort((a, b) => a.position - b.position)
              .map(({ movements: movement, ...item }) => ({
                ...item,
                movement_id: movement?.id,
                name: movement?.name ?? "",
              }));
            const scaling = scalingByWorkout.get(workout.id);
            const scalingDetails = scaling ? scaleWorkoutDetailsSchema.safeParse(scaling.details) : null;
            const todayResult = todayResultForWorkout(workout);

            return (
              <div key={workout.id} className="grid gap-3">
                <p className="text-sm text-muted-foreground">{SCHEDULE_LABEL(item)}</p>
                <Whiteboard workout={workout} movements={movements} units={viewer.units} howToHref={(id) => `/athlete/movements/${id}`} />
                {scaling && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Your scaling</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 text-sm">
                      <p className="whitespace-pre-line">{scaling.modifications}</p>
                      {scalingDetails?.success && (
                        <ul className="grid gap-2">
                          {scalingDetails.data.movements.map((movement, index) => (
                            <li key={`${movement.movement_id}-${index}`}>
                              <p>{formatMovementLine({
                                name: movement.movement_name,
                                sets: movement.sets,
                                reps: movement.reps,
                                load_kg: movement.load_kg,
                                distance_m: movement.distance_m,
                                calories: movement.calories,
                                duration_seconds: movement.duration_seconds,
                                notes: null,
                              }, viewer.units)}</p>
                              <p className="text-xs text-muted-foreground">{movement.reason}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                )}
                {todayResult ? (
                  <Card id={`result-${workout.id}`} className="scroll-mt-4">
                    {saved === workout.id && <ScrollIntoView targetId={`result-${workout.id}`} />}
                    <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
                      <CardTitle className="text-sm">Your result</CardTitle>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/athlete/log/${todayResult.workout_id}?result=${todayResult.id}`}>Edit result</Link>
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

      <Card>
        <CardContent className="flex items-center justify-between gap-3 py-4">
          <div className="min-w-0">
            <p className="font-medium">Daily journal</p>
            <p className="text-xs text-muted-foreground">
              {todayJournal ? "Logged for today." : "Sleep and habits, about 30 seconds. Optional."}
            </p>
          </div>
          <Button asChild size="sm" variant={todayJournal ? "outline" : "default"}>
            <Link href="/athlete/journal">{todayJournal ? "Edit" : "Fill in"}</Link>
          </Button>
        </CardContent>
      </Card>

      {recentWithoutResults.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">Recent</h2>
          {recentWithoutResults.map((item) => (
            <Card key={`${item.programId ?? item.source}-${item.workout.id}`}>
              <CardContent className="flex items-start justify-between gap-3 py-4">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{formatDate(item.date)}</p>
                  <p className="font-medium">{item.workout.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {SCHEDULE_LABEL(item)}
                    {formatHeadline(item.workout) ? ` · ${formatHeadline(item.workout)}` : ""}
                  </p>
                </div>
                <Button asChild size="sm">
                  <Link href={`/athlete/log/${item.workout.id}?date=${item.date}`}>Log result</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">Coming up</h2>
          {upcoming.map((item) => (
            <Card key={`${item.programId ?? item.source}-${item.workout.id}`}>
              <CardContent className="flex items-start gap-3 py-4">
                <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{formatDate(item.date)}</p>
                  <p className="font-medium">{item.workout.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {SCHEDULE_LABEL(item)}
                    {formatHeadline(item.workout) ? ` · ${formatHeadline(item.workout)}` : ""}
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
