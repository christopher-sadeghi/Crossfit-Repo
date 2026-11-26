import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestWorkoutSuggestionForm } from "@/components/suggestions/request-forms";
import { RemoveWorkoutScalingForm, ScaleWorkoutRequestForm } from "@/components/suggestions/scale-workout-controls";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { scaleWorkoutDetailsSchema } from "@/lib/ai/scale-workout";
import { getCoach } from "@/lib/coach";
import { loadFormReviews } from "@/lib/form-review-data";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/time-zone";
import { compareScores } from "@/lib/results";
import { loadResultPrSetLocations } from "@/lib/result-part-prs";
import { resultPartsSchema, sectionScoresSchema } from "@/lib/result-parts";
import { workoutSectionsSchema } from "@/lib/workout-sections";
import { formatDate, formatScore } from "@/lib/units";
import { WorkoutResultPartsDisplay } from "@/components/workout-result-parts-display";

import { WORKOUT_TYPE_LABELS } from "../../options";
import { DeleteResultButton, LogResultForm } from "../log-result-form";
import { Whiteboard } from "../whiteboard";
import { WorkoutButtons } from "../workout-buttons";

export default async function WorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [coach, { data: workout }, { data: resultRows }, { data: athletes }, { data: scalingRows }] = await Promise.all([
    getCoach(),
    supabase
      .from("workouts")
      .select("id, title, workout_type, time_cap_seconds, rounds, description, notes, sections, athlete_id, scheduled_on, week_number, day_number, program_id, athletes(id, first_name, last_name), programs(name), workout_movements(position, sets, reps, load_kg, distance_m, calories, duration_seconds, notes, section, movements(id, name))")
      .eq("id", id)
      .order("position", { referencedTable: "workout_movements" })
      .maybeSingle(),
    supabase
      .from("workout_results")
      .select("id, performed_on, time_seconds, rounds, reps, load_kg, is_rx, notes, logged_by, rpe, parts, section_scores, athletes(id, first_name, last_name, user_id)")
      .eq("workout_id", id),
    supabase.from("athletes").select("id, first_name, last_name").eq("status", "active").order("first_name").order("last_name"),
    supabase
      .from("athlete_workout_scalings")
      .select("id, athlete_id, modifications, details, coach_modifications, coach_details, athlete_suggestion_id, athlete_adjusted_at")
      .eq("workout_id", id)
      .order("updated_at", { ascending: false }),
  ]);
  if (!workout) notFound();

  const parsedSections = workoutSectionsSchema.safeParse(workout.sections);
  const sections = parsedSections.success ? parsedSections.data : [];
  const units = coach?.units ?? "lb";
  const results = (resultRows ?? []).sort(compareScores(workout.workout_type));
  const resultCount = results.length;
  const [formReviews, prSetsByResult, today] = await Promise.all([
    loadFormReviews(supabase, { resultIds: results.map((result) => result.id) }),
    loadResultPrSetLocations(supabase, results),
    getToday(),
  ]);

  const movements = workout.workout_movements.map(({ movements: mv, ...m }) => ({
    ...m,
    movement_id: mv?.id ?? "",
    name: mv?.name ?? "",
  }));
  const baseVersion = {
    movements,
    rounds: workout.rounds,
    time_cap_seconds: workout.time_cap_seconds,
    workout_type: workout.workout_type,
    sections,
  };
  const scalingAthleteIds = [...new Set((scalingRows ?? []).map((row) => row.athlete_id))];
  const { data: scalingAthletes } = scalingAthleteIds.length
    ? await supabase.from("athletes").select("id, first_name, last_name").in("id", scalingAthleteIds)
    : { data: [] };
  const scalingAthleteNames = new Map(
    (scalingAthletes ?? []).map((athlete) => [athlete.id, `${athlete.first_name} ${athlete.last_name}`]),
  );

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
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Scale for athlete…</CardTitle>
          <p className="text-sm text-muted-foreground">Review the athlete-specific proposal before saving it.</p>
        </CardHeader>
        <CardContent>
          <ScaleWorkoutRequestForm
            workoutId={workout.id}
            athletes={(athletes ?? []).map((athlete) => ({ id: athlete.id, name: `${athlete.first_name} ${athlete.last_name}` }))}
            lockedAthlete={
              workout.athlete_id
                ? { id: workout.athlete_id, name: workout.athletes ? `${workout.athletes.first_name} ${workout.athletes.last_name}` : "Assigned athlete" }
                : null
            }
          />
        </CardContent>
      </Card>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,42rem)_1fr]">
        <Whiteboard workout={{ ...workout, sections }} movements={movements} units={units} howToHref={(id) => `/programs/movements/${id}`} />
        <Card className="content-start">
          <CardHeader>
            <CardTitle>Log a result</CardTitle>
          </CardHeader>
          <CardContent>
            <LogResultForm
              workoutId={workout.id}
              workoutType={workout.workout_type}
              units={units}
              today={today}
              athletes={(athletes ?? []).map((a) => ({ id: a.id, name: `${a.first_name} ${a.last_name}` }))}
              baseVersion={baseVersion}
              scalings={scalingRows ?? []}
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
                  <TableHead className="whitespace-normal">Athlete</TableHead>
                  <TableHead className="whitespace-normal">Score</TableHead>
                  <TableHead className="hidden sm:table-cell">Rx / Scaled</TableHead>
                  <TableHead className="hidden sm:table-cell">Effort</TableHead>
                  <TableHead className="hidden sm:table-cell">Date</TableHead>
                  <TableHead className="hidden sm:table-cell">Notes</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r, i) => {
                  const name = r.athletes ? `${r.athletes.first_name} ${r.athletes.last_name}` : "Athlete";
                  const parts = resultPartsSchema.safeParse(r.parts);
                  const sectionScores = sectionScoresSchema.safeParse(r.section_scores);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="pl-4 font-medium">{i + 1}</TableCell>
                      <TableCell className="font-medium whitespace-normal">
                        <div className="flex flex-wrap items-center gap-2">
                          {r.athletes ? (
                            <Link href={`/athletes/${r.athletes.id}?tab=workouts`} className="hover:underline">
                              {name}
                            </Link>
                          ) : (
                            name
                          )}
                          {r.logged_by != null && r.logged_by !== coach?.id && <Badge variant="secondary">Logged by athlete</Badge>}
                          {formReviews.filter((review) => review.workout_result_id === r.id).map((review) => <Link key={review.id} href={`/form-checks/${review.id}`}><Badge variant={review.status === "reviewed" ? "outline" : "default"}>{review.status === "reviewed" ? "Form video" : "Form video · review"}</Badge></Link>)}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="grid gap-2">
                          <span>{formatScore(r, units)}</span>
                          {parts.success && (
                            <WorkoutResultPartsDisplay
                              parts={parts.data}
                              sections={sections}
                              movements={movements}
                              sectionScores={sectionScores.success ? sectionScores.data : []}
                              units={units}
                              newPrSets={prSetsByResult.get(r.id)}
                            />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant={r.is_rx ? "default" : "outline"}>{r.is_rx ? "Rx" : "Scaled"}</Badge>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">{r.rpe != null ? `RPE ${r.rpe}/10` : ""}</TableCell>
                      <TableCell className="hidden sm:table-cell">{formatDate(r.performed_on)}</TableCell>
                      <TableCell className="hidden max-w-xs truncate text-muted-foreground sm:table-cell">{r.notes ?? ""}</TableCell>
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
      <Card className="mt-6">
        <CardHeader><CardTitle>Scaled versions</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          {(scalingRows ?? []).length ? (scalingRows ?? []).map((scaling) => {
            const details = scaleWorkoutDetailsSchema.safeParse(scaling.details);
            const suggestionId = details.success ? details.data.suggestion_id : null;
            const athleteName = scalingAthleteNames.get(scaling.athlete_id) ?? "Athlete";
            return (
              <div key={scaling.id} className="flex flex-wrap items-start justify-between gap-4 border-b pb-4 last:border-0 last:pb-0">
                <div className="grid gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/athletes/${scaling.athlete_id}`} className="font-medium hover:underline">{athleteName}</Link>
                    {scaling.athlete_adjusted_at && <Badge variant="secondary">Adjusted by athlete</Badge>}
                  </div>
                  <p className="whitespace-pre-line text-sm text-muted-foreground">{scaling.modifications}</p>
                  {scaling.athlete_suggestion_id ? (
                    <Link href={`/suggestions/${scaling.athlete_suggestion_id}`} className="text-sm underline">Review, edit, or undo the athlete&apos;s change</Link>
                  ) : suggestionId && <Link href={`/suggestions/${suggestionId}`} className="text-sm underline">View AI suggestion</Link>}
                </div>
                {!scaling.athlete_adjusted_at && <RemoveWorkoutScalingForm id={scaling.id} />}
              </div>
            );
          }) : <p className="text-sm text-muted-foreground">No scaled versions yet.</p>}
        </CardContent>
      </Card>
    </>
  );
}
