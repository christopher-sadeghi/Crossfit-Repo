"use client";

import { Badge } from "@/components/ui/badge";
import {
  partsSummary,
  type LiftPrSetLocation,
  type ResultPart,
} from "@/lib/result-parts";
import { fromKg, type Units } from "@/lib/units";

export function WorkoutResultPartsDisplay({
  parts,
  units,
  newPrSets,
  open = false,
}: {
  parts: ResultPart[];
  units: Units;
  newPrSets?: LiftPrSetLocation[];
  open?: boolean;
}) {
  if (!parts.length) return null;
  const prSets = new Set(
    (newPrSets ?? []).map((set) => `${set.position}:${set.set_index}`),
  );
  return (
    <details open={open} className="text-sm">
      <summary className="cursor-pointer font-medium underline underline-offset-4">
        Parts: {partsSummary(parts, units)}
      </summary>
      <div className="mt-3 grid gap-3">
        {parts.map((part) => (
          <section
            key={`${part.position}-${part.movement_id}`}
            className="rounded-md border p-3"
          >
            <h3 className="font-medium">{part.name}</h3>
            {part.sets.length ? (
              <ul className="mt-2 grid gap-1 text-muted-foreground">
                {part.sets.map((set, setIndex) => (
                  <li
                    key={setIndex}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <span>
                      Set {setIndex + 1}: {set.reps ?? "—"} reps
                      {set.load_kg == null
                        ? ""
                        : ` · ${fromKg(set.load_kg, units)} ${units}`}
                      {!set.done && " · Missed"}
                    </span>
                    {prSets.has(`${part.position}:${setIndex}`) && (
                      <Badge>New PR</Badge>
                    )}
                  </li>
                ))}
              </ul>
            ) : part.score ? (
              <p className="mt-1 text-muted-foreground">
                {[
                  part.score.time_seconds == null
                    ? ""
                    : `${Math.floor(part.score.time_seconds / 60)}:${String(part.score.time_seconds % 60).padStart(2, "0")}`,
                  part.score.rounds == null && part.score.reps == null
                    ? ""
                    : `${part.score.rounds ?? 0} rounds${part.score.reps == null ? "" : ` + ${part.score.reps} reps`}`,
                  part.score.calories == null ? "" : `${part.score.calories} cal`,
                  part.score.distance_m == null ? "" : `${part.score.distance_m} m`,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Score not entered"}
              </p>
            ) : null}
            {part.notes && (
              <p className="mt-2 whitespace-pre-line text-muted-foreground">
                {part.notes}
              </p>
            )}
          </section>
        ))}
      </div>
    </details>
  );
}
