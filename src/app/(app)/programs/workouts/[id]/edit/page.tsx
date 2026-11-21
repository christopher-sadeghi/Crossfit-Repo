import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { getToday } from "@/lib/time-zone";
import { createClient } from "@/lib/supabase/server";

import { loadBuilderData } from "../../load-builder-data";
import { WodBuilder, type OneOff } from "../../wod-builder";

export default async function EditWorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ units, movementOptions }, { data: workout }] = await Promise.all([
    loadBuilderData(),
    supabase
      .from("workouts")
      .select("id, title, workout_type, time_cap_seconds, rounds, description, notes, athlete_id, scheduled_on, athletes(first_name, last_name), movements:workout_movements(movement_id, position, sets, reps, load_kg, distance_m, calories, duration_seconds, notes)")
      .eq("id", id)
      .order("position", { referencedTable: "workout_movements" })
      .maybeSingle(),
  ]);
  if (!workout) notFound();
  const oneOff: OneOff | undefined =
    workout.athlete_id && workout.athletes
      ? {
          athleteId: workout.athlete_id,
          athleteName: `${workout.athletes.first_name} ${workout.athletes.last_name}`,
          date: workout.scheduled_on ?? await getToday(),
        }
      : undefined;

  return (
    <>
      <PageHeader title={`Edit ${workout.title}`} />
      <WodBuilder workout={workout} units={units} movementOptions={movementOptions} oneOff={oneOff} />
    </>
  );
}
