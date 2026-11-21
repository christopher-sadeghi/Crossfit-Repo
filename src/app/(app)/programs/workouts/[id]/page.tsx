import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCoach } from "@/lib/coach";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/units";

import { WORKOUT_TYPE_LABELS } from "../../options";
import { Whiteboard } from "../whiteboard";
import { WorkoutButtons } from "../workout-buttons";

export default async function WorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [coach, { data: workout }, { count: resultCount }] = await Promise.all([
    getCoach(),
    supabase
      .from("workouts")
      .select("id, title, workout_type, time_cap_seconds, rounds, description, notes, scheduled_on, programs(name), workout_movements(position, sets, reps, load_kg, distance_m, calories, duration_seconds, notes, movements(name))")
      .eq("id", id)
      .order("position", { referencedTable: "workout_movements" })
      .maybeSingle(),
    supabase.from("workout_results").select("id", { count: "exact", head: true }).eq("workout_id", id),
  ]);
  if (!workout) notFound();

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
            {workout.programs?.name && <span>{workout.programs.name}</span>}
            {workout.scheduled_on && <span>· {formatDate(workout.scheduled_on)}</span>}
            <span>· {resultCount ?? 0} results logged</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/programs/workouts/${workout.id}/edit`}>
              <Pencil /> Edit
            </Link>
          </Button>
          <WorkoutButtons id={workout.id} resultCount={resultCount ?? 0} />
        </div>
      </div>
      <div className="max-w-2xl">
        <Whiteboard workout={workout} movements={movements} units={coach?.units ?? "lb"} />
      </div>
    </>
  );
}
