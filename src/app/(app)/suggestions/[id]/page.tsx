import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ApproveProgressSummaryForm,
  ApproveSuggestionForm,
  ApproveWorkoutSuggestionForm,
  RejectSuggestionForm,
} from "@/components/suggestions/suggestion-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { friendlySuggestionError } from "@/lib/ai/service-core";
import { GOAL_STATUS_LABELS, progressNote, progressSummaryInputSchema, progressSummarySchema } from "@/lib/ai/progress-summary";
import {
  adjustMacrosSchema,
  MACRO_DISCLAIMER,
  SUGGESTION_LABELS,
  writeWorkoutInputSchema,
  writeWorkoutSchema,
} from "@/lib/ai/suggestions";
import { today } from "@/lib/program-dates";
import { createClient } from "@/lib/supabase/server";
import { formatDate, toKg, type Units } from "@/lib/units";
import { Whiteboard } from "@/app/(app)/programs/workouts/whiteboard";

type Props = { params: Promise<{ id: string }> };
type MacroKey = "calories" | "protein_g" | "carbs_g" | "fat_g";
const MACROS: { key: MacroKey; label: string; unit: string }[] = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein_g", label: "Protein", unit: "g" },
  { key: "carbs_g", label: "Carbs", unit: "g" },
  { key: "fat_g", label: "Fat", unit: "g" },
];

export default async function SuggestionPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: suggestion } = await supabase.from("ai_suggestions").select("*").eq("id", id).maybeSingle();
  if (!suggestion) notFound();

  const macrosType = suggestion.suggestion_type === "adjust_macros";
  const workoutType = suggestion.suggestion_type === "write_workout";
  const proposal = macrosType ? adjustMacrosSchema.safeParse(suggestion.proposal) : null;
  const final = macrosType ? adjustMacrosSchema.safeParse(suggestion.final) : null;
  const shown = suggestion.status === "approved" || suggestion.status === "edited" ? (final?.success ? final.data : null) : proposal?.success ? proposal.data : null;
  const rationale = suggestion.status === "approved" || suggestion.status === "edited"
    ? (final?.success ? final.data.rationale : "")
    : (proposal?.success ? proposal.data.rationale : "");
  const summaryType = suggestion.suggestion_type === "progress_summary";
  const decided = suggestion.status === "approved" || suggestion.status === "edited";
  const summaryParsed = summaryType ? progressSummarySchema.safeParse(decided ? suggestion.final : suggestion.proposal) : null;
  const shownSummary = summaryParsed?.success ? summaryParsed.data : null;
  const summaryInput = summaryType ? progressSummaryInputSchema.safeParse(suggestion.input) : null;
  const goalTitles = new Map((summaryInput?.success ? summaryInput.data.goals : []).map((goal) => [goal.id, goal.title]));
  const workoutProposal = workoutType ? writeWorkoutSchema.safeParse(suggestion.proposal) : null;
  const workoutFinal = workoutType ? writeWorkoutSchema.safeParse(suggestion.final) : null;
  const shownWorkout =
    suggestion.status === "approved" || suggestion.status === "edited"
      ? workoutFinal?.success
        ? workoutFinal.data
        : null
      : workoutProposal?.success
        ? workoutProposal.data
        : null;
  const workoutInput = workoutType ? writeWorkoutInputSchema.safeParse(suggestion.input) : null;
  const workoutContext = workoutInput?.success ? workoutInput.data : null;
  const entry =
    workoutType && workoutContext?.mode === "adjust"
      ? "Adjust workout"
      : SUGGESTION_LABELS[suggestion.suggestion_type];
  const units: Units = workoutContext?.units ?? "lb";
  const libraryNames = new Map((workoutContext?.library ?? []).map((movement) => [movement.id, movement.name]));
  const proposedMovements =
    shownWorkout?.movements.map(({ movement_id, load, ...movement }) => ({
      ...movement,
      movement_id,
      name: libraryNames.get(movement_id) ?? "Unknown movement",
      load_kg: load == null ? null : toKg(load, units),
    })) ?? [];
  const currentWorkout = workoutContext?.current_workout;
  const currentMovements =
    currentWorkout?.movements.map(({ load, ...movement }) => ({
      ...movement,
      load_kg: load == null ? null : toKg(load, units),
    })) ?? [];
  const todayValue = today();
  const [athleteResult, targetResult] = await Promise.all([
    suggestion.athlete_id
      ? supabase.from("athletes").select("id, first_name, last_name").eq("id", suggestion.athlete_id).maybeSingle()
      : Promise.resolve({ data: null }),
    suggestion.athlete_id
      ? supabase
          .from("nutrition_targets")
          .select("calories, protein_g, carbs_g, fat_g")
          .eq("athlete_id", suggestion.athlete_id)
          .lte("start_date", todayValue)
          .or(`end_date.is.null,end_date.gte.${todayValue}`)
          .order("start_date", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const athlete = athleteResult.data;
  const current = targetResult.data;
  const resultCount =
    workoutContext?.mode === "adjust" && workoutContext.workout_id
      ? ((await supabase
          .from("workout_results")
          .select("id", { count: "exact", head: true })
          .eq("workout_id", workoutContext.workout_id)).count ?? 0)
      : 0;
  const defaultSaveAs = resultCount > 0 ? "new" : "update";
  const statusVariant = suggestion.status === "failed" ? "destructive" : suggestion.status === "pending" ? "secondary" : "outline";

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link href="/suggestions">← All suggestions</Link>
      </Button>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{entry}</h1>
        <p className="mt-1 text-muted-foreground">
          {athlete ? (
            <Link href={`/athletes/${athlete.id}`} className="hover:underline">{athlete.first_name} {athlete.last_name}</Link>
          ) : workoutType ? "Coach WOD request" : "Athlete unavailable"}
          {" · "}{formatDate(suggestion.created_at.slice(0, 10))}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant}>{suggestion.status}</Badge>
          <span className="text-sm text-muted-foreground">Model: {suggestion.model ?? "—"}</span>
        </div>
      </div>

      {macrosType && shown && (
        <Card className="mb-6 pb-0">
          <CardHeader><CardTitle>Target comparison</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Macro</TableHead>
                  <TableHead>Current</TableHead>
                  <TableHead>{suggestion.status === "pending" ? "Proposed" : "Final"}</TableHead>
                  <TableHead>Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MACROS.map(({ key, label, unit }) => {
                  const proposedValue = shown[key];
                  const currentValue = current?.[key] ?? null;
                  const change = currentValue == null
                    ? "New target"
                    : `${proposedValue - currentValue > 0 ? "+" : ""}${proposedValue - currentValue} ${unit}`;
                  return (
                    <TableRow key={key}>
                      <TableCell className="pl-4 font-medium">{label}</TableCell>
                      <TableCell>{currentValue == null ? "No target" : `${currentValue} ${unit}`}</TableCell>
                      <TableCell>{proposedValue} {unit}</TableCell>
                      <TableCell>{change}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {macrosType && rationale && (
        <Card className="mb-6">
          <CardHeader><CardTitle>Why this was suggested</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <p className="whitespace-pre-line">{rationale}</p>
            <p className="text-xs text-muted-foreground">{MACRO_DISCLAIMER}</p>
          </CardContent>
        </Card>
      )}

      {summaryType && shownSummary && (
        <Card className="mb-6 pb-0">
          <CardHeader>
            <CardTitle>{decided ? "Saved summary" : "Summary"}</CardTitle>
            <p className="whitespace-pre-line">{shownSummary.summary}</p>
          </CardHeader>
          <CardContent className="p-0">
            {shownSummary.goals.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Goal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>How it&apos;s tracking</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shownSummary.goals.map((goal) => (
                    <TableRow key={goal.goal_id}>
                      <TableCell className="pl-4 font-medium">{goalTitles.get(goal.goal_id) ?? "Goal"}</TableCell>
                      <TableCell>
                        <Badge variant={goal.status === "behind" ? "destructive" : goal.status === "no_data" ? "outline" : "secondary"}>
                          {GOAL_STATUS_LABELS[goal.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-normal">{goal.note}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="px-4 pb-4 text-sm text-muted-foreground">This athlete has no active goals.</p>
            )}
          </CardContent>
        </Card>
      )}

      {workoutType && workoutContext && (
        <Card className="mb-6">
          <CardHeader><CardTitle>Coach request</CardTitle></CardHeader>
          <CardContent className="whitespace-pre-wrap">{workoutContext.request}</CardContent>
        </Card>
      )}

      {workoutType && shownWorkout && (
        <div className={`mb-6 grid gap-4 ${workoutContext?.mode === "adjust" ? "xl:grid-cols-2" : ""}`}>
          {workoutContext?.mode === "adjust" && currentWorkout && (
            <section className="grid content-start gap-2">
              <h2 className="font-semibold">Current WOD</h2>
              <Whiteboard
                workout={{
                  title: currentWorkout.title,
                  workout_type: currentWorkout.workout_type,
                  time_cap_seconds: currentWorkout.time_cap_seconds,
                  rounds: currentWorkout.rounds,
                  description: currentWorkout.description,
                  notes: currentWorkout.notes,
                }}
                movements={currentMovements}
                units={units}
                howToHref={(id) => `/programs/movements/${id}`}
              />
            </section>
          )}
          <section className="grid content-start gap-2">
            <h2 className="font-semibold">{workoutContext?.mode === "adjust" ? "Proposed WOD" : "WOD proposal"}</h2>
            <Whiteboard
              workout={{
                title: shownWorkout.title,
                workout_type: shownWorkout.workout_type,
                time_cap_seconds: shownWorkout.time_cap_minutes == null ? null : shownWorkout.time_cap_minutes * 60,
                rounds: shownWorkout.rounds,
                description: shownWorkout.description,
                notes: shownWorkout.notes,
              }}
              movements={proposedMovements}
              units={units}
              howToHref={(id) => `/programs/movements/${id}`}
            />
          </section>
        </div>
      )}

      {workoutType && shownWorkout?.rationale && (
        <Card className="mb-6">
          <CardHeader><CardTitle>Why this was suggested</CardTitle></CardHeader>
          <CardContent className="whitespace-pre-line">{shownWorkout.rationale}</CardContent>
        </Card>
      )}

      {suggestion.status === "failed" && (
        <Card className="mb-6">
          <CardHeader><CardTitle>Suggestion unavailable</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">{friendlySuggestionError(suggestion.error)}</CardContent>
        </Card>
      )}

      {suggestion.status === "pending" && macrosType && proposal?.success && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Review and approve</CardTitle>
            <p className="text-sm text-muted-foreground">
              You can edit these values before approving. Approval creates a new target starting today and keeps the old one in history.
            </p>
          </CardHeader>
          <CardContent className="grid gap-5">
            <ApproveSuggestionForm id={suggestion.id} values={proposal.data} />
            <div className="border-t pt-4">
              <RejectSuggestionForm id={suggestion.id} />
            </div>
          </CardContent>
        </Card>
      )}

      {suggestion.status === "pending" && summaryType && shownSummary && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Review and save</CardTitle>
            <p className="text-sm text-muted-foreground">
              You can edit the summary first. Saving adds it, with the goal lines above, to the end of the athlete&apos;s coach notes.
              Nothing is saved until you click save.
            </p>
          </CardHeader>
          <CardContent className="grid gap-5">
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Preview the note</summary>
              <pre className="mt-2 font-sans whitespace-pre-wrap">{progressNote(shownSummary, suggestion.input)}</pre>
            </details>
            <ApproveProgressSummaryForm id={suggestion.id} summary={shownSummary.summary} />
            <div className="border-t pt-4">
              <RejectSuggestionForm id={suggestion.id} />
            </div>
          </CardContent>
        </Card>
      )}

      {suggestion.status === "pending" && workoutType && workoutProposal?.success && workoutContext && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Review and approve</CardTitle>
            <p className="text-sm text-muted-foreground">
              Review the proposed WOD. Nothing changes until you approve it.
            </p>
          </CardHeader>
          <CardContent className="grid gap-5">
            <ApproveWorkoutSuggestionForm
              id={suggestion.id}
              mode={workoutContext.mode}
              defaultSaveAs={defaultSaveAs}
              resultCount={resultCount}
            />
            <div className="border-t pt-4">
              <RejectSuggestionForm id={suggestion.id} />
            </div>
          </CardContent>
        </Card>
      )}

      {(suggestion.status === "approved" || suggestion.status === "edited" || suggestion.status === "rejected") && (
        <Card>
          <CardHeader><CardTitle>Decision</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <p>Status: <span className="capitalize">{suggestion.status}</span></p>
            <p>Decided: {suggestion.decided_at ? formatDate(suggestion.decided_at.slice(0, 10)) : "—"}</p>
            {athlete && macrosType && <p><Link href={`/nutrition/${athlete.id}`} className="underline underline-offset-4">Open athlete&apos;s nutrition page</Link></p>}
            {athlete && summaryType && suggestion.status !== "rejected" && (
              <p>
                Saved to the athlete&apos;s notes.{" "}
                <Link href={`/athletes/${athlete.id}`} className="underline underline-offset-4">Open athlete profile</Link>
              </p>
            )}
            {suggestion.status === "rejected" && (
              <p>This suggestion was rejected. No {workoutType ? "WOD" : summaryType ? "note" : "target"} was changed.</p>
            )}
            {workoutType && suggestion.status !== "rejected" && suggestion.target_id && (
              <p>
                WOD saved.{" "}
                <Link href={`/programs/workouts/${suggestion.target_id}`} className="underline underline-offset-4">
                  Open saved WOD
                </Link>
              </p>
            )}
            {macrosType && suggestion.status !== "rejected" && shown && (
              <p>
                Final targets: {shown.calories} kcal · Protein {shown.protein_g}g · Carbs {shown.carbs_g}g · Fat {shown.fat_g}g
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {suggestion.suggestion_type === "movement_guide" && suggestion.input && typeof suggestion.input === "object" && !Array.isArray(suggestion.input) && typeof suggestion.input.movement_id === "string" ? (
        <Link href={`/programs/movements/${encodeURIComponent(suggestion.input.movement_id)}`} className="underline underline-offset-4">Review on the movement page</Link>
      ) : !macrosType && !workoutType && !summaryType && <p className="text-sm text-muted-foreground">This suggestion type isn&apos;t ready yet.</p>}
    </>
  );
}
