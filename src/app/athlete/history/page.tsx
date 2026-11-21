import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { feedbackSummary } from "@/lib/feedback";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatScore } from "@/lib/units";
import { getViewer } from "@/lib/viewer";

import { AthleteResultControls } from "./result-controls";

export default async function AthleteHistoryPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.kind === "coach") redirect("/");
  if (viewer.kind === "none") redirect("/no-access");

  const supabase = await createClient();
  const [{ data: claims }, { data: results }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase
      .from("workout_results")
      .select(
        "id, workout_id, performed_on, time_seconds, rounds, reps, load_kg, is_rx, notes, logged_by, rpe, energy, sleep_hours, soreness, pain_notes, workouts(title, workout_type)",
      )
      .eq("athlete_id", viewer.athleteId)
      .order("performed_on", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  const userId = claims?.claims?.sub;

  return (
    <div className="grid gap-3">
      <h1 className="text-xl font-semibold tracking-tight">Workout history</h1>
      {results?.length ? (
        results.map((result) => (
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
        ))
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
