import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { getViewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/time-zone";
import { formatHeadline } from "@/app/(app)/programs/workouts/whiteboard";
import type { Tables } from "@/lib/supabase/database.types";

import { AthleteResultForm } from "./result-form";

type Props = {
  params: Promise<{ workoutId: string }>;
  searchParams: Promise<{ result?: string; date?: string }>;
};

type EditableResult = Pick<
  Tables<"workout_results">,
  | "id"
  | "workout_id"
  | "performed_on"
  | "time_seconds"
  | "rounds"
  | "reps"
  | "load_kg"
  | "is_rx"
  | "notes"
  | "rpe"
  | "energy"
  | "soreness"
  | "logged_by"
>;

export default async function AthleteLogResultPage({ params, searchParams }: Props) {
  const [{ workoutId }, { result: resultId, date: requestedDate }] = await Promise.all([params, searchParams]);
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.kind === "coach") redirect("/");
  if (viewer.kind === "none") redirect("/no-access");

  const supabase = await createClient();
  const [{ data: workout }, { data: authData }] = await Promise.all([
    supabase
      .from("workouts")
      .select("id, title, workout_type, time_cap_seconds, rounds")
      .eq("id", workoutId)
      .maybeSingle(),
    supabase.auth.getClaims(),
  ]);
  if (!workout) notFound();
  const { data: canView } = await supabase.rpc("athlete_can_view_workout", { p_workout_id: workoutId });
  if (!canView) notFound();

  let existingResult: EditableResult | null = null;
  if (resultId) {
    const parsedId = z.string().uuid().safeParse(resultId);
    const userId = authData?.claims?.sub;
    if (!parsedId.success || typeof userId !== "string") notFound();

    const { data } = await supabase
      .from("workout_results")
      .select(
        "id, workout_id, performed_on, time_seconds, rounds, reps, load_kg, is_rx, notes, rpe, energy, soreness, logged_by",
      )
      .eq("id", parsedId.data)
      .eq("workout_id", workout.id)
      .eq("athlete_id", viewer.athleteId)
      .eq("logged_by", userId)
      .maybeSingle();
    if (!data) notFound();
    existingResult = data;
  }

  const todayIso = await getToday();
  const minDate = new Date(`${todayIso}T00:00:00Z`);
  minDate.setUTCDate(minDate.getUTCDate() - 14);
  const minDateIso = minDate.toISOString().slice(0, 10);
  const minDateForInput =
    existingResult && existingResult.performed_on < minDateIso
      ? existingResult.performed_on
      : minDateIso;
  const requestedDateValue =
    typeof requestedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? new Date(`${requestedDate}T00:00:00Z`)
      : null;
  const defaultDate =
    requestedDateValue &&
    !Number.isNaN(requestedDateValue.getTime()) &&
    requestedDateValue.toISOString().slice(0, 10) === requestedDate &&
    requestedDate >= minDateIso &&
    requestedDate <= todayIso
      ? requestedDate
      : todayIso;

  return (
    <div className="grid gap-4">
      <Link href="/athlete" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Today
      </Link>
      <header className="grid gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{workout.title}</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="secondary">{formatHeadline(workout)}</Badge>
          <span>{existingResult ? "Edit your result" : "Log your result"}</span>
        </div>
      </header>
      <AthleteResultForm
        workoutId={workout.id}
        workoutType={workout.workout_type}
        today={todayIso}
        minDate={minDateForInput}
        defaultDate={defaultDate}
        units={viewer.units}
        existingResult={existingResult}
      />
    </div>
  );
}
