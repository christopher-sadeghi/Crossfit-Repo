import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatScore } from "@/lib/units";
import { getViewer } from "@/lib/viewer";

export default async function AthleteHistoryPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.kind === "coach") redirect("/");
  if (viewer.kind === "none") redirect("/no-access");

  const supabase = await createClient();
  const { data: results } = await supabase
    .from("workout_results")
    .select(
      "id, performed_on, time_seconds, rounds, reps, load_kg, is_rx, notes, workouts(title, workout_type)",
    )
    .eq("athlete_id", viewer.athleteId)
    .order("performed_on", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <div className="grid gap-3">
      <h1 className="text-xl font-semibold tracking-tight">Workout history</h1>
      {results?.length ? (
        results.map((result) => (
          <Card key={result.id}>
            <CardContent className="grid gap-2 py-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-medium">{result.workouts?.title ?? "Workout"}</h2>
                <Badge variant={result.is_rx ? "default" : "outline"}>
                  {result.is_rx ? "Rx" : "Scaled"}
                </Badge>
              </div>
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{formatDate(result.performed_on)}</span>
                <span className="font-medium">{formatScore(result, viewer.units)}</span>
              </div>
              {result.notes && (
                <p className="whitespace-pre-line text-sm text-muted-foreground">
                  {result.notes}
                </p>
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
