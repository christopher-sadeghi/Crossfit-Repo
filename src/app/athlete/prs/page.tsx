import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { personalRecords } from "@/lib/results";
import { formatDate, formatScore } from "@/lib/units";
import { getViewer } from "@/lib/viewer";
import BenchmarksTab from "@/app/(app)/athletes/[id]/benchmarks-tab";

export default async function AthletePersonalRecordsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.kind === "coach") redirect("/");
  if (viewer.kind === "none") redirect("/no-access");

  const supabase = await createClient();
  const { data: results } = await supabase
    .from("workout_results")
    .select(
      "id, performed_on, time_seconds, rounds, reps, load_kg, is_rx, workouts(title, workout_type)",
    )
    .eq("athlete_id", viewer.athleteId)
    .order("performed_on", { ascending: false })
    .order("created_at", { ascending: false });
  const records = personalRecords(results ?? []);

  return (
    <div className="grid gap-3">
      <h1 className="text-xl font-semibold tracking-tight">Benchmarks & personal records</h1>
      <BenchmarksTab athleteId={viewer.athleteId} units={viewer.units} />
      <h2 className="mt-4 text-lg font-semibold">Workout personal records</h2>
      {records.length ? (
        records.map((record) => (
          <Card key={record.id}>
            <CardContent className="grid gap-2 py-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-medium">{record.workouts?.title}</h2>
                <Badge variant={record.is_rx ? "default" : "outline"}>
                  {record.is_rx ? "Rx" : "Scaled"}
                </Badge>
              </div>
              <div className="flex justify-between gap-3 text-sm">
                <span className="font-semibold">{formatScore(record, viewer.units)}</span>
                <span className="text-muted-foreground">{formatDate(record.performed_on)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {record.attempts} {record.attempts === 1 ? "attempt" : "attempts"}
              </p>
            </CardContent>
          </Card>
        ))
      ) : (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No personal records yet.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
