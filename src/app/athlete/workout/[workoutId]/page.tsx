import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/time-zone";
import { loadAthleteSchedule } from "@/lib/athlete-schedule";
import { loadLiftMaxes } from "@/lib/benchmarks";
import { workoutVersion } from "@/lib/workout-version";
import type { Tables } from "@/lib/supabase/database.types";
import { WorkoutMode } from "./workout-mode";

type ScheduledWorkout = Tables<"workouts"> & {
  workout_movements: (Tables<"workout_movements"> & { movements: { id: string; name: string } | null })[];
};

export default async function WorkoutPage({ params, searchParams }: {
  params: Promise<{ workoutId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.kind === "coach") redirect("/");
  if (viewer.kind === "none") redirect("/no-access");
  const [{ workoutId }, query, today] = await Promise.all([params, searchParams, getToday()]);
  const date = query.date ?? today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) notFound();
  const supabase = await createClient();
  const schedule = await loadAthleteSchedule<ScheduledWorkout>(supabase, viewer.athleteId, { from: date, to: date },
    "id, source_workout_id, title, workout_type, time_cap_seconds, rounds, description, notes, week_number, day_number, workout_movements(movement_id, position, sets, reps, load_kg, distance_m, calories, duration_seconds, notes, movements(id, name))");
  const workout = schedule.find((item) => item.workout.id === workoutId)?.workout;
  if (!workout) notFound();
  const [{ data: scaling, error }, maxes, results] = await Promise.all([
    supabase.from("athlete_workout_scalings").select("modifications, details, athlete_adjusted_at, coach_modifications, coach_details").eq("athlete_id", viewer.athleteId).eq("workout_id", workoutId).maybeSingle(),
    loadLiftMaxes(supabase, viewer.athleteId),
    supabase.from("workout_results").select("created_at").eq("athlete_id", viewer.athleteId).eq("workout_id", workoutId).eq("performed_on", date).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (error) throw new Error("Couldn't load your workout version.");
  if (results.error) throw new Error("Couldn't check your saved workout results.");
  const version = workoutVersion({ ...workout, movements: [...workout.workout_movements].sort((a, b) => a.position - b.position).map((m) => ({ ...m, name: m.movements?.name ?? "Movement" })) }, scaling, date);
  return <WorkoutMode athleteId={viewer.athleteId} date={date} units={viewer.units} workout={version} latestResultCreatedAt={results.data?.created_at ?? null} maxes={maxes.map(({ movement_id, oneRmKg }) => ({ movement_id, oneRmKg }))} />;
}
