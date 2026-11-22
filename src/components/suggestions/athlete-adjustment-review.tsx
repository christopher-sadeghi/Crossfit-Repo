import Link from "next/link";

import { formatHeadline, formatMovementLine, type WhiteboardMovement } from "@/app/(app)/programs/workouts/whiteboard";
import {
  EditAthleteAdjustmentForm,
  MarkReviewedForm,
  UndoAthleteAdjustmentForm,
} from "@/components/suggestions/athlete-adjustment-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { athleteAdjustInputSchema, athleteAdjustSchema } from "@/lib/ai/athlete-adjust-schema";
import { scaleWorkoutDetailsSchema } from "@/lib/ai/scale-workout";
import { friendlySuggestionError } from "@/lib/ai/service-core";
import type { Tables } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { formatDate, fromKgPrecise, toKg, type Units } from "@/lib/units";

export function athleteAdjustmentStatus(suggestion: Pick<Tables<"ai_suggestions">, "status" | "coach_reviewed_at">) {
  if (suggestion.status === "failed") return { label: "Not applied", variant: "destructive" as const };
  if (suggestion.status === "rejected") return { label: "Undone by coach", variant: "outline" as const };
  if (!suggestion.coach_reviewed_at) return { label: "Applied — needs your review", variant: "secondary" as const };
  return { label: suggestion.status === "edited" ? "Edited by coach" : "Reviewed", variant: "outline" as const };
}

function failureReason(error: string | null) {
  if (!error || error === "in_progress") return "The request didn't finish, so nothing was changed.";
  const known = /^(HarderChangeError|NoChangeError): ([\s\S]*)$/.exec(error);
  if (known) return known[2];
  if (error.startsWith("apply: harder_")) return "The change would have made the workout harder, so the app blocked it. Nothing was changed.";
  return `${friendlySuggestionError(error)} Nothing was changed.`;
}

export async function AthleteAdjustmentReview({ suggestion }: { suggestion: Tables<"ai_suggestions"> }) {
  const supabase = await createClient();
  const input = athleteAdjustInputSchema.safeParse(suggestion.input);
  const [{ data: athlete }, { data: scaling }] = await Promise.all([
    suggestion.athlete_id
      ? supabase.from("athletes").select("id, first_name, last_name, injuries").eq("id", suggestion.athlete_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("athlete_workout_scalings")
      .select("id, modifications, details, coach_modifications")
      .eq("athlete_suggestion_id", suggestion.id)
      .maybeSingle(),
  ]);
  const status = athleteAdjustmentStatus(suggestion);
  const units: Units = input.success ? (input.data.units as Units) : "lb";
  const final = athleteAdjustSchema.safeParse(suggestion.final);
  const activeDetails = scaling ? scaleWorkoutDetailsSchema.safeParse(scaling.details) : null;
  const active = Boolean(scaling && activeDetails?.success);
  const names = new Map((input.success ? input.data.library : []).map(({ id, name }) => [id, name]));

  const asLine = (m: Omit<WhiteboardMovement, "notes">) => formatMovementLine({ ...m, notes: null }, units);
  const rows = input.success
    ? input.data.workout.movements.map((original, index) => {
        const given = input.data.current.movements[index];
        const saved = activeDetails?.success ? activeDetails.data.movements[index] : null;
        const proposed = final.success ? final.data.changes[index] : null;
        const adjusted = saved
          ? { ...saved, name: saved.movement_name }
          : proposed
            ? { ...proposed, name: names.get(proposed.movement_id) ?? "", load_kg: proposed.load == null ? null : toKg(proposed.load, units) }
            : null;
        return {
          original: asLine({ ...original, load_kg: original.load == null ? null : toKg(original.load, units) }),
          given: given ? asLine({ ...given, load_kg: given.load == null ? null : toKg(given.load, units) }) : "—",
          adjusted: adjusted ? asLine(adjusted) : "—",
          reason: saved?.reason ?? proposed?.reason ?? "",
          load: saved?.load_kg == null ? null : fromKgPrecise(saved.load_kg, units),
          name: adjusted?.name ?? original.name,
        };
      })
    : [];
  const workout = input.success ? input.data.workout : null;
  const givenHeadline = workout && input.success
    ? formatHeadline({ workout_type: workout.workout_type, rounds: input.data.current.rounds, time_cap_seconds: input.data.current.time_cap_seconds })
    : "";
  const adjustedRounds = activeDetails?.success ? activeDetails.data.rounds : final.success ? final.data.rounds : undefined;
  const adjustedCap = activeDetails?.success
    ? activeDetails.data.time_cap_seconds
    : final.success && final.data.time_cap_minutes != null ? Math.round(final.data.time_cap_minutes * 60) : undefined;
  const capText = (seconds: number | null | undefined) => (seconds ? `${Math.round((seconds / 60) * 10) / 10} min cap` : "no cap");
  const adjustedHeadline = workout
    ? formatHeadline({ workout_type: workout.workout_type, rounds: adjustedRounds ?? null, time_cap_seconds: adjustedCap ?? null })
    : "";

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link href={suggestion.athlete_id ? `/messages/${suggestion.athlete_id}` : "/messages"}>← Messages</Link>
      </Button>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Athlete adjusted WOD</h1>
        <p className="mt-1 text-muted-foreground">
          {athlete ? (
            <Link href={`/athletes/${athlete.id}`} className="hover:underline">{athlete.first_name} {athlete.last_name}</Link>
          ) : "Athlete"}
          {workout ? ` · ${workout.title}` : ""}
          {" · "}{formatDate(input.success ? input.data.scheduled_on : suggestion.created_at.slice(0, 10))}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant={status.variant}>{status.label}</Badge>
          <span className="text-sm text-muted-foreground">Model: {suggestion.model ?? "—"}</span>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader><CardTitle>What the athlete said</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <p className="whitespace-pre-line">{input.success ? `“${input.data.feeling}”` : "—"}</p>
          {input.success && input.data.mentions_pain && (
            <p className="text-amber-700 dark:text-amber-300">They mentioned pain, so the app told them to check with you.</p>
          )}
          <p className="text-muted-foreground">Injuries on file: {athlete?.injuries || "None recorded"}</p>
        </CardContent>
      </Card>

      {suggestion.status === "failed" ? (
        <Card className="mb-6">
          <CardHeader><CardTitle>Not applied</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">{failureReason(suggestion.error)}</CardContent>
        </Card>
      ) : (
        <>
          <Card className="mb-6 pb-0">
            <CardHeader>
              <CardTitle>Changes</CardTitle>
              {workout && (givenHeadline !== adjustedHeadline || input.success && input.data.current.time_cap_seconds !== adjustedCap) && (
                <p className="text-sm text-muted-foreground">
                  {givenHeadline} ({capText(input.success ? input.data.current.time_cap_seconds : null)}) → {adjustedHeadline} ({capText(adjustedCap)})
                </p>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Original WOD</TableHead>
                    <TableHead>Athlete was given</TableHead>
                    <TableHead>{suggestion.status === "rejected" ? "Athlete's change (undone)" : "Now"}</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => (
                    <TableRow key={index}>
                      <TableCell className="pl-4">{row.original}</TableCell>
                      <TableCell>{row.given}</TableCell>
                      <TableCell>{row.adjusted}</TableCell>
                      <TableCell className="whitespace-normal text-muted-foreground">{row.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader><CardTitle>What the athlete sees</CardTitle></CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <p className="whitespace-pre-line">{scaling?.modifications ?? (final.success ? final.data.summary : "—")}</p>
              {final.success && <p className="whitespace-pre-line text-muted-foreground">{final.data.rationale}</p>}
            </CardContent>
          </Card>

          {active && scaling ? (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Review</CardTitle>
                <p className="text-sm text-muted-foreground">
                  This change is already live for this athlete only. The original WOD is unchanged for everyone else.
                </p>
              </CardHeader>
              <CardContent className="grid gap-6">
                {!suggestion.coach_reviewed_at && <MarkReviewedForm id={suggestion.id} />}
                <div className="grid gap-2 border-t pt-4">
                  <h3 className="font-medium">Edit</h3>
                  <EditAthleteAdjustmentForm
                    id={suggestion.id}
                    summary={scaling.modifications}
                    movements={rows.map(({ name, load }) => ({ name, load }))}
                    units={units}
                  />
                </div>
                <div className="border-t pt-4">
                  <UndoAthleteAdjustmentForm id={suggestion.id} restoresCoachScaling={scaling.coach_modifications != null} />
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="mb-6">
              <CardContent className="grid gap-4 py-4 text-sm text-muted-foreground">
                <p>
                  {suggestion.status === "rejected"
                    ? "You undid this change. The athlete is back on what you gave them."
                    : "This change is no longer active. It was replaced by a newer change or removed."}
                </p>
                {!suggestion.coach_reviewed_at && suggestion.status !== "rejected" && <MarkReviewedForm id={suggestion.id} />}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {input.success && (
        <Link href={`/programs/workouts/${input.data.workout_id}`} className="text-sm underline underline-offset-4">Open the WOD</Link>
      )}
    </>
  );
}
