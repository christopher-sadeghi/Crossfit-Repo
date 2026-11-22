import { redirect } from "next/navigation";

import { ActivityForm } from "@/components/activity-form";
import { ActivityList } from "@/components/activity-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { feedbackSummary } from "@/lib/feedback";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/time-zone";
import { gymSessionLoad } from "@/lib/training-load";
import { loadActivities } from "@/lib/training-load-data";
import { formatDate, formatScore } from "@/lib/units";
import { getViewer } from "@/lib/viewer";

import { AthleteResultControls } from "./result-controls";
import { AthleteConsistencyCard } from "../consistency-card";

export default async function AthleteHistoryPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.kind === "coach") redirect("/");
  if (viewer.kind === "none") redirect("/no-access");

  const supabase = await createClient();
  const [{ data: claims }, { data: results }, today, activities] = await Promise.all([
    supabase.auth.getClaims(),
    supabase
      .from("workout_results")
      .select(
        "id, workout_id, performed_on, time_seconds, rounds, reps, load_kg, is_rx, notes, logged_by, rpe, energy, sleep_hours, soreness, pain_notes, workouts(title, workout_type, time_cap_seconds)",
      )
      .eq("athlete_id", viewer.athleteId)
      .order("performed_on", { ascending: false })
      .order("created_at", { ascending: false }),
    getToday(),
    loadActivities(supabase, viewer.athleteId),
  ]);
  const userId = claims?.claims?.sub;

  return (
    <div className="grid gap-3">
      <h1 className="text-xl font-semibold tracking-tight">Training history</h1>
      <AthleteConsistencyCard athleteId={viewer.athleteId} />
      <Card>
        <CardHeader><CardTitle>Outside activity history</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <details>
            <summary className="w-fit cursor-pointer font-medium underline underline-offset-4">Log activity</summary>
            <div className="mt-3"><ActivityForm athleteId={viewer.athleteId} today={today} units={viewer.units} /></div>
          </details>
          <ActivityList activities={activities} today={today} units={viewer.units} />
        </CardContent>
      </Card>
      <h2 className="text-lg font-semibold">Workout history</h2>
      {results?.length ? (
        results.map((result) => {
          const session = gymSessionLoad(result, result.workouts);
          return (
          <Card key={result.id}>
            <CardContent className="grid gap-2 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="grid gap-1">
                  <h2 className="font-medium">{result.workouts?.title ?? "Workout"}</h2>
                  {result.logged_by === userId ? (
                    <Badge variant="secondary" className="w-fit">You logged this</Badge>
                  ) : (
                    <Badge variant="outline" className="w-fit">Logged by coach</Badge>
                  )}
                </div>
                <Badge variant={result.is_rx ? "default" : "outline"}>{result.is_rx ? "Rx" : "Scaled"}</Badge>
              </div>
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{formatDate(result.performed_on)}</span>
                <span className="font-medium">{formatScore(result, viewer.units)}</span>
              </div>
              <p className="text-sm text-muted-foreground">{Math.round(session.load)} load{session.estimated && " (estimated)"}</p>
              {feedbackSummary(result) && (
                <p className="text-sm text-muted-foreground">{feedbackSummary(result)}</p>
              )}
              {result.notes && (
                <p className="whitespace-pre-line text-sm text-muted-foreground">
                  {result.notes}
                </p>
              )}
              {result.pain_notes && (
                <div className="rounded-md border border-amber-300/70 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
                  <p className="font-medium">Pain or discomfort</p>
                  <p className="mt-1 whitespace-pre-line">{result.pain_notes}</p>
                </div>
              )}
              {result.logged_by === userId && typeof userId === "string" && (
                <AthleteResultControls
                  resultId={result.id}
                  workoutId={result.workout_id}
                  workoutTitle={result.workouts?.title ?? "Workout"}
                />
              )}
            </CardContent>
          </Card>
          );
        })
      ) : (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No results logged yet.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
