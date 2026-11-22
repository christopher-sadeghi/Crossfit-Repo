import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CHECK_WITH_COACH_MESSAGE } from "@/lib/ai/athlete-adjust-copy";
import { effectiveScaling } from "@/lib/ai/athlete-adjust-schema";
import { scaleWorkoutDetailsSchema } from "@/lib/ai/scale-workout";
import { SCHEDULE_LABEL, loadAthleteSchedule } from "@/lib/athlete-schedule";
import { CHECK_IN_COLUMNS } from "@/lib/check-in";
import { getToday } from "@/lib/time-zone";
import { createClient } from "@/lib/supabase/server";
import { feedbackSummary } from "@/lib/feedback";
import { formatDate, formatScore } from "@/lib/units";
import { getViewer } from "@/lib/viewer";

import { formatHeadline, formatMovementLine, Whiteboard, type WhiteboardWorkout } from "../(app)/programs/workouts/whiteboard";
import { AthleteResultForm } from "./log/[workoutId]/result-form";
import { AdjustWorkoutForm } from "./adjust-form";
import { CheckInForm } from "./check-in/check-in-form";
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
        .select("workout_id, modifications, details, athlete_adjusted_at, coach_modifications, coach_details")
        .eq("athlete_id", viewer.athleteId)
        .in("workout_id", todayWorkoutIds)
    : { data: [] };
  const { data: todayJournal } = await supabase
    .from("athlete_journal_entries")
    .select(CHECK_IN_COLUMNS)
    .eq("athlete_id", viewer.athleteId)
    .eq("entry_on", currentDate)
    .maybeSingle();
  const scalingByWorkout = new Map(
    (scalings ?? []).map((scaling) => [scaling.workout_id, scaling]),
  );

  return (
    <div className="grid gap-6">
      <CheckInForm key={currentDate} entry={todayJournal} today={currentDate} />
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
            const scaling = effectiveScaling(scalingByWorkout.get(workout.id), currentDate);
            const scalingDetails = scaling ? scaleWorkoutDetailsSchema.safeParse(scaling.details) : null;
            const todayResult = todayResultForWorkout(workout);
            const adjusted = Boolean(scaling?.athlete_adjusted_at);
            const adjustedDetails = adjusted && scalingDetails?.success ? scalingDetails.data : null;
            const adjustedHeadline = adjustedDetails
              ? formatHeadline({
                  workout_type: workout.workout_type,
                  rounds: adjustedDetails.rounds === undefined ? workout.rounds : adjustedDetails.rounds,
                  time_cap_seconds:
                    adjustedDetails.time_cap_seconds === undefined ? workout.time_cap_seconds : adjustedDetails.time_cap_seconds,
                })
              : "";

            return (
              <div key={workout.id} className="grid gap-3">
                <p className="text-sm text-muted-foreground">{SCHEDULE_LABEL(item, "athlete")}</p>
                <Whiteboard workout={workout} movements={movements} units={viewer.units} howToHref={(id) => `/athlete/movements/${id}`} />
                <Link href={`/athlete/messages?link=workout:${workout.id}`} className="text-sm underline underline-offset-4">Message coach about this WOD</Link>
                {scaling && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{adjusted ? "Your adjusted version" : "Your scaling"}</CardTitle>
                      {adjusted && (
                        <p className="text-xs text-muted-foreground">
                          Adjusted by the AI for you today. Your coach has been told and can change or undo it.
                        </p>
                      )}
                    </CardHeader>
                    <CardContent className="grid gap-3 text-sm">
                      {adjustedHeadline && adjustedHeadline !== formatHeadline(workout) && (
                        <p className="font-medium">{adjustedHeadline}</p>
                      )}
                      {adjustedDetails?.time_cap_seconds && adjustedDetails.time_cap_seconds !== workout.time_cap_seconds && workout.workout_type === "for_time" ? (
                        <p className="font-medium">Time cap: {Math.round((adjustedDetails.time_cap_seconds / 60) * 10) / 10} min</p>
                      ) : null}
                      <p className="whitespace-pre-line">{scaling.modifications}</p>
                      {adjustedDetails?.check_with_coach && (
                        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                          {CHECK_WITH_COACH_MESSAGE}
                        </p>
                      )}
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
                      {adjusted && scaling.coach_modifications && (
                        <p className="text-xs text-muted-foreground">Your coach&apos;s scaling was: {scaling.coach_modifications}</p>
                      )}
                    </CardContent>
                  </Card>
                )}
                {!todayResult && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Not feeling 100%?</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <AdjustWorkoutForm workoutId={workout.id} adjusted={Boolean(scaling)} />
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
                    {SCHEDULE_LABEL(item, "athlete")}
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
                    {SCHEDULE_LABEL(item, "athlete")}
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
