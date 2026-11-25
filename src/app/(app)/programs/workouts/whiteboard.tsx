import Link from "next/link";

import { MovementDemoSheet } from "@/components/movements/movement-demo-sheet";
import type { Enums } from "@/lib/supabase/database.types";
import { formatDuration, formatWeight, type Units } from "@/lib/units";
import {
  formatSectionHeadline,
  groupBySection,
  type WorkoutSection,
} from "@/lib/workout-sections";

export type WhiteboardWorkout = {
  title: string;
  workout_type: Enums<"workout_type">;
  time_cap_seconds: number | null;
  rounds: number | null;
  description: string | null;
  notes: string | null;
  sections?: WorkoutSection[];
};

export type WhiteboardMovement = {
  movement_id?: string;
  name: string;
  sets: number | null;
  reps: number | null;
  load_kg: number | null;
  distance_m: number | null;
  calories: number | null;
  duration_seconds: number | null;
  notes: string | null;
  section?: number | null;
};

export function formatHeadline(w: Pick<WhiteboardWorkout, "workout_type" | "time_cap_seconds" | "rounds">) {
  const minutes = w.time_cap_seconds ? `${Math.round((w.time_cap_seconds / 60) * 10) / 10} min` : "";
  switch (w.workout_type) {
    case "for_time":
      return w.rounds && w.rounds > 1 ? `${w.rounds} Rounds For Time` : "For Time";
    case "amrap":
      return `AMRAP ${minutes}`.trim();
    case "emom":
      return `EMOM ${minutes}`.trim();
    case "strength":
      return "Strength";
    default:
      return w.rounds && w.rounds > 1 ? `${w.rounds} Rounds` : "";
  }
}

export function formatMovementLine(m: WhiteboardMovement, units: Units) {
  const amount = [
    m.reps != null && (m.sets && m.sets > 1 ? `${m.sets} x ${m.reps}` : `${m.reps}`),
    m.reps == null && m.sets && m.sets > 1 && `${m.sets} sets`,
    m.distance_m != null && `${m.distance_m} m`,
    m.calories != null && `${m.calories} cal`,
    m.duration_seconds != null && formatDuration(m.duration_seconds),
  ]
    .filter(Boolean)
    .join(" ");
  const load = m.load_kg != null ? ` @ ${formatWeight(m.load_kg, units)}` : "";
  return `${amount ? `${amount} ` : ""}${m.name}${load}`;
}

/** The WOD the way a coach would write it on the gym whiteboard. */
export function Whiteboard({
  workout,
  movements,
  units,
  howToHref,
  showDemoSheet,
}: {
  workout: WhiteboardWorkout;
  movements: WhiteboardMovement[];
  units: Units;
  howToHref?: (movementId: string) => string;
  showDemoSheet?: boolean;
}) {
  const headline = formatHeadline(workout);
  const showCap = workout.time_cap_seconds && (workout.workout_type === "for_time" || workout.workout_type === "other");
  const groups = groupBySection(movements, workout.sections);

  return (
    <div className="rounded-xl border-8 border-zinc-300 bg-zinc-900 p-6 font-mono text-zinc-50 shadow-inner dark:border-zinc-700">
      <h2 className="text-2xl font-bold tracking-wide uppercase">{workout.title || "Untitled WOD"}</h2>
      {headline && <p className="mt-1 text-lg text-amber-300">{headline}</p>}
      {workout.description && <p className="mt-3 whitespace-pre-line text-zinc-300">{workout.description}</p>}
      <ul className="mt-4 space-y-1 text-lg">
        {movements.length ? (
          groups.flatMap((group) => [
            ...(group.section
              ? [<li key={`section-${group.index}`} className="border-t border-zinc-700 pt-3 text-base font-bold text-amber-300">
                  {group.section.title}
                  {formatSectionHeadline(group.section) && ` · ${formatSectionHeadline(group.section)}`}
                </li>]
              : []),
            ...group.items.map(({ movement: m, position }) => (
              <li key={position}>
                {m.movement_id && showDemoSheet ? (
                  <MovementDemoSheet movement={{ id: m.movement_id, name: m.name }} className="decoration-amber-300">
                    {formatMovementLine(m, units)}
                  </MovementDemoSheet>
                ) : formatMovementLine(m, units)}
                {m.movement_id && howToHref && <Link href={howToHref(m.movement_id)} aria-label={`How to ${m.name}`} className="ml-3 text-sm text-amber-300 underline underline-offset-4">How to</Link>}
                {m.notes && <span className="ml-2 text-sm text-zinc-400">({m.notes})</span>}
              </li>
            )),
          ])
        ) : (
          <li className="text-zinc-500">Add movements to see them here.</li>
        )}
      </ul>
      {showCap && <p className="mt-4 text-sm text-zinc-400">Time cap: {formatDuration(workout.time_cap_seconds!)}</p>}
      {workout.notes && <p className="mt-4 border-t border-zinc-700 pt-3 text-sm whitespace-pre-line text-zinc-400">{workout.notes}</p>}
    </div>
  );
}
