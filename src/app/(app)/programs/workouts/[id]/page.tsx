import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestWorkoutSuggestionForm } from "@/components/suggestions/suggestion-forms";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCoach } from "@/lib/coach";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/time-zone";
import { compareScores } from "@/lib/results";
import { formatDate, formatScore } from "@/lib/units";

import { WORKOUT_TYPE_LABELS } from "../../options";
import { DeleteResultButton, LogResultForm } from "../log-result-form";
import { Whiteboard } from "../whiteboard";
import { WorkoutButtons } from "../workout-buttons";

export default async function WorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [coach, { data: workout }, { data: resultRows }, { data: athletes }] = await Promise.all([
    getCoach(),
    supabase
      .from("workouts")
      .select("id, title, workout_type, time_cap_seconds, rounds, description, notes, athlete_id, scheduled_on, week_number, day_number, program_id, athletes(id, first_name, last_name), programs(name), workout_movements(position, sets, reps, load_kg, distance_m, calories, duration_seconds, notes, movements(name))")
      .eq("id", id)
      .order("position", { referencedTable: "workout_movements" })
      .maybeSingle(),
    supabase
      .from("workout_results")
      .select("id, performed_on, time_seconds, rounds, reps, load_kg, is_rx, notes, logged_by, rpe, athletes(id, first_name, last_name, user_id)")
      .eq("workout_id", id),
    supabase.from("athletes").select("id, first_name, last_name").eq("status", "active").order("first_name").order("last_name"),
  ]);
  if (!workout) notFound();

  const units = coach?.units ?? "lb";
  const results = (resultRows ?? []).sort(compareScores(workout.workout_type));
  const resultCount = results.length;

  const movements = workout.workout_movements.map(({ movements: mv, ...m }) => ({ ...m, name: mv?.name ?? "" }));

  return (
    <>
      <Link href="/programs/workouts" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> WODs
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{workout.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{WORKOUT_TYPE_LABELS[workout.workout_type]}</Badge>
            {workout.athlete_id && (
              <>
                <Badge variant="outline">One-off</Badge>
                {workout.athletes && (
                  <Link href={`/athletes/${workout.athletes.id}`} className="hover:underline">
                    {workout.athletes.first_name} {workout.athletes.last_name}
                  </Link>
                )}
              </>
            )}
            {workout.programs?.name && (
              <Link href={`/programs/${workout.program_id}`} className="hover:underline">
                {workout.programs.name}
                {workout.week_number && workout.day_number ? ` · Week ${workout.week_number}, Day ${workout.day_number}` : ""}
              </Link>
            )}
            {workout.scheduled_on && <span>· {formatDate(workout.scheduled_on)}</span>}
            <span>· {resultCount} results logged</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/programs/workouts/${workout.id}/edit`}>
              <Pencil /> Edit
            </Link>
          </Button>
          <WorkoutButtons id={workout.id} resultCount={resultCount} />
        </div>
      </div>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Ask AI to adjust</CardTitle>
          <p className="text-sm text-muted-foreground">
            Describe a change and review the proposal before it updates or copies this WOD.
          </p>
        </CardHeader>
        <CardContent>
          <RequestWorkoutSuggestionForm workoutId={workout.id} />
        </CardContent>
      </Card>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,42rem)_1fr]">
        <Whiteboard workout={workout} movements={movements} units={units} />
        <Card className="content-start">
          <CardHeader>
            <CardTitle>Log a result</CardTitle>
          </CardHeader>
          <CardContent>
            <LogResultForm
              workoutId={workout.id}
              workoutType={workout.workout_type}
              units={units}
              today={await getToday()}
              athletes={(athletes ?? []).map((a) => ({ id: a.id, name: `${a.first_name} ${a.last_name}` }))}
            />
          </CardContent>
        </Card>
      </div>
      <Card className="mt-6 pb-0">
        <CardHeader>
          <CardTitle>Leaderboard</CardTitle>
          <p className="text-sm text-muted-foreground">Rx results rank ahead of scaled ones.</p>
        </CardHeader>
        <CardContent className="p-0">
          {results.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 pl-4">#</TableHead>
                  <TableHead>Athlete</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Rx / Scaled</TableHead>
                  <TableHead>Effort</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r, i) => {
                  const name = r.athletes ? `${r.athletes.first_name} ${r.athletes.last_name}` : "Athlete";
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="pl-4 font-medium">{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        <div className="flex flex-wrap items-center gap-2">
                          {r.athletes ? (
                            <Link href={`/athletes/${r.athletes.id}?tab=workouts`} className="hover:underline">
                              {name}
                            </Link>
                          ) : (
                            name
                          )}
                          {r.logged_by != null && r.logged_by !== coach?.id && <Badge variant="secondary">Logged by athlete</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>{formatScore(r, units)}</TableCell>
                      <TableCell>
                        <Badge variant={r.is_rx ? "default" : "outline"}>{r.is_rx ? "Rx" : "Scaled"}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.rpe != null ? `RPE ${r.rpe}/10` : ""}</TableCell>
                      <TableCell>{formatDate(r.performed_on)}</TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">{r.notes ?? ""}</TableCell>
                      <TableCell>
                        <DeleteResultButton id={r.id} label={`${name}'s result`} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="p-8 text-center text-muted-foreground">No results logged yet.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
