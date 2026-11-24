"use client";

import { Badge } from "@/components/ui/badge";
import {
  partsSummary,
  type LiftPrSetLocation,
  type ResultPart,
  type SectionScore,
} from "@/lib/result-parts";
import { fromKg, type Units } from "@/lib/units";
import {
  formatSectionHeadline,
  groupBySection,
  type WorkoutSection,
} from "@/lib/workout-sections";

function formatRoundsReps(
  rounds: number | undefined,
  reps: number | undefined,
): string {
  if (rounds == null) return reps == null ? "" : `${reps} reps`;
  return `${rounds} rounds${reps == null ? "" : ` + ${reps} reps`}`;
}

export function WorkoutResultPartsDisplay({
  parts,
  units,
  newPrSets,
  sections,
  movements = [],
  sectionScores = [],
  open = false,
}: {
  parts: ResultPart[];
  units: Units;
  newPrSets?: LiftPrSetLocation[];
  sections?: WorkoutSection[];
  movements?: { position?: number; section?: number | null }[];
  sectionScores?: SectionScore[];
  open?: boolean;
}) {
  if (!parts.length && !sectionScores.length) return null;
  const prSets = new Set(
    (newPrSets ?? []).map((set) => `${set.position}:${set.set_index}`),
  );
  const groups = groupBySection(
    parts.map((part) => ({
      ...part,
      section:
        movements.find((movement) => movement.position === part.position + 1)
          ?.section ?? movements[part.position]?.section ?? null,
    })),
    sections,
  );
  return (
    <details open={open} className="text-sm">
      <summary className="cursor-pointer font-medium underline underline-offset-4">
        {parts.length ? `Parts: ${partsSummary(parts, units)}` : "Workout details"}
      </summary>
      <div className="mt-3 grid gap-3">
        {groups.map((group) => {
          const sectionScore = sectionScores.find((score) => score.section === group.index);
          return (
            <div key={group.index ?? "legacy"} className="grid gap-2">
              {group.section && (
                <h3 className="border-b pb-1 font-semibold">
                  {group.section.title}
                  {formatSectionHeadline(group.section) && ` · ${formatSectionHeadline(group.section)}`}
                </h3>
              )}
              {sectionScore && (
                <div className="rounded-md bg-muted/50 p-3">
                  <h4 className="font-medium">Section score</h4>
                  <p className="mt-1 text-muted-foreground">
                    {[
                      sectionScore.score.time_seconds == null
                        ? ""
                        : `${Math.floor(sectionScore.score.time_seconds / 60)}:${String(sectionScore.score.time_seconds % 60).padStart(2, "0")}`,
                      formatRoundsReps(sectionScore.score.rounds, sectionScore.score.reps),
                      sectionScore.score.calories == null ? "" : `${sectionScore.score.calories} cal`,
                      sectionScore.score.distance_m == null ? "" : `${sectionScore.score.distance_m} m`,
                    ].filter(Boolean).join(" · ") || "Score not entered"}
                  </p>
                  {sectionScore.notes && <p className="mt-1 whitespace-pre-line text-muted-foreground">{sectionScore.notes}</p>}
                </div>
              )}
              {group.items.map(({ movement: part }) => (
                <section
                  key={`${part.position}-${part.movement_id}`}
                  className="rounded-md border p-3"
                >
                  <h4 className="font-medium">{part.name}</h4>
                  {part.sets.length ? (
                    <ul className="mt-2 grid gap-1 text-muted-foreground">
                      {part.sets.map((set, setIndex) => (
                        <li key={setIndex} className="flex flex-wrap items-center gap-2">
                          <span>
                            Set {setIndex + 1}: {set.reps ?? "—"} reps
                            {set.load_kg == null ? "" : ` · ${fromKg(set.load_kg, units)} ${units}`}
                            {!set.done && " · Missed"}
                          </span>
                          {prSets.has(`${part.position}:${setIndex}`) && <Badge>New PR</Badge>}
                        </li>
                      ))}
                    </ul>
                  ) : part.score ? (
                    <p className="mt-1 text-muted-foreground">
                      {[
                        part.score.time_seconds == null ? "" : `${Math.floor(part.score.time_seconds / 60)}:${String(part.score.time_seconds % 60).padStart(2, "0")}`,
                        formatRoundsReps(part.score.rounds, part.score.reps),
                        part.score.calories == null ? "" : `${part.score.calories} cal`,
                        part.score.distance_m == null ? "" : `${part.score.distance_m} m`,
                      ].filter(Boolean).join(" · ") || "Score not entered"}
                    </p>
                  ) : part.load_kg != null ? (
                    <p className="mt-1 text-muted-foreground">Weight used: {fromKg(part.load_kg, units)} {units}</p>
                  ) : null}
                  {part.notes && <p className="mt-2 whitespace-pre-line text-muted-foreground">{part.notes}</p>}
                </section>
              ))}
            </div>
          );
        })}
      </div>
    </details>
  );
}
