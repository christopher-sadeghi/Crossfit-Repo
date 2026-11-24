"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Enums } from "@/lib/supabase/database.types";
import { fromKgPrecise, type Units } from "@/lib/units";
import {
  initialPartsDirty,
  shouldResetParts,
  type LiftPrCandidate,
  type ResultPart,
  type ResultPartMovement,
  type SectionScore,
} from "@/lib/result-parts";
import {
  formatSectionHeadline,
  groupBySection,
  type WorkoutSection,
} from "@/lib/workout-sections";

type ScoreKey = "time_seconds" | "rounds" | "reps" | "calories" | "distance_m";
type DraftSet = { reps: string; load: string; done: boolean };
type DraftPart = {
  position: number;
  movement_id: string;
  name: string;
  sets: DraftSet[];
  score: Partial<Record<ScoreKey, string>>;
  load: string;
  notes: string;
  notesExpanded: boolean;
};
type PartSubmission = Omit<ResultPart, "sets" | "score" | "notes"> & {
  sets: { reps: number | null; load_kg: number | null; done: boolean }[];
  score?: Partial<Record<ScoreKey, number>>;
  notes?: string;
};

function toDraftParts(parts: ResultPart[], units: Units): DraftPart[] {
  return parts.map((part) => ({
    position: part.position,
    movement_id: part.movement_id,
    name: part.name,
    sets: part.sets.map((set) => ({
      reps: set.reps == null ? "" : String(set.reps),
      load: set.load_kg == null ? "" : String(fromKgPrecise(set.load_kg, units)),
      done: set.done,
    })),
    score: Object.fromEntries(
      Object.entries(part.score ?? {}).map(([key, value]) => [key, String(value)]),
    ) as Partial<Record<ScoreKey, string>>,
    load: part.load_kg == null ? "" : String(fromKgPrecise(part.load_kg, units)),
    notes: part.notes ?? "",
    notesExpanded: Boolean(part.notes?.trim()),
  }));
}

function fromRawParts(raw: string): DraftPart[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const records = parsed.filter(
      (part): part is Record<string, unknown> =>
        part != null && typeof part === "object" && !Array.isArray(part),
    );
    if (records.length !== parsed.length) return null;
    return records.map((part) => {
      const score =
        part.score != null &&
        typeof part.score === "object" &&
        !Array.isArray(part.score)
          ? (part.score as Record<string, unknown>)
          : {};
      const sets = Array.isArray(part.sets)
        ? part.sets.map((rawSet: unknown) => {
            if (
              rawSet == null ||
              typeof rawSet !== "object" ||
              Array.isArray(rawSet)
            )
              return { reps: "", load: "", done: false };
            const set = rawSet as Record<string, unknown>;
            return {
              reps: set.reps == null ? "" : String(set.reps),
              load: set.load_kg == null ? "" : String(set.load_kg),
              done: Boolean(set.done),
            };
          })
        : [];
      return {
        position: Number(part.position),
        movement_id: String(part.movement_id),
        name: String(part.name),
        sets,
        load: part.load_kg == null ? "" : String(part.load_kg),
        score: Object.fromEntries(
          Object.entries(score).map(([key, value]) => [key, String(value)]),
        ) as Partial<Record<ScoreKey, string>>,
        notes: typeof part.notes === "string" ? part.notes : "",
        notesExpanded:
          typeof part.notes === "string" && Boolean(part.notes.trim()),
      };
    });
  } catch {
    return null;
  }
}

function serializeParts(parts: DraftPart[]): PartSubmission[] {
  return parts.map((part) => {
    const score = Object.fromEntries(
      Object.entries(part.score)
        .filter(([, value]) => value !== "")
        .map(([key, value]) => [key, Number(value)]),
    ) as Partial<Record<ScoreKey, number>>;
    return {
      position: part.position,
      movement_id: part.movement_id,
      name: part.name,
      sets: part.sets.map((set) => ({
        reps: set.reps === "" ? null : Number(set.reps),
        load_kg: set.load === "" ? null : Number(set.load),
        done: set.done,
      })),
      ...(part.load === "" ? {} : { load_kg: Number(part.load) }),
      ...(Object.keys(score).length ? { score } : {}),
      ...(part.notes.trim() ? { notes: part.notes.trim() } : {}),
    };
  });
}

type DraftSectionScore = {
  section: number;
  score: Partial<Record<ScoreKey, string>>;
  notes: string;
  notesExpanded: boolean;
};

function toDraftSectionScores(scores: SectionScore[] = []): DraftSectionScore[] {
  return scores.map(({ section, score, notes }) => ({
    section,
    score: Object.fromEntries(
      Object.entries(score).map(([key, value]) => [key, String(value)]),
    ) as Partial<Record<ScoreKey, string>>,
    notes: notes ?? "",
    notesExpanded: Boolean(notes?.trim()),
  }));
}

function fromRawSectionScores(raw: string): DraftSectionScore[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item))
        throw new Error("invalid section score");
      const record = item as Record<string, unknown>;
      const score =
        record.score && typeof record.score === "object" && !Array.isArray(record.score)
          ? (record.score as Record<string, unknown>)
          : {};
      return {
        section: Number(record.section),
        score: Object.fromEntries(
          Object.entries(score).map(([key, value]) => [key, String(value)]),
        ) as Partial<Record<ScoreKey, string>>,
        notes: typeof record.notes === "string" ? record.notes : "",
        notesExpanded: typeof record.notes === "string" && Boolean(record.notes.trim()),
      };
    });
  } catch {
    return null;
  }
}

function serializeSectionScores(scores: DraftSectionScore[]): SectionScore[] {
  return scores.map(({ section, score, notes }) => ({
    section,
    score: Object.fromEntries(
      Object.entries(score)
        .filter(([, value]) => value !== "")
        .map(([key, value]) => [key, Number(value)]),
    ),
    ...(notes.trim() ? { notes: notes.trim() } : {}),
  }));
}

function sectionScoreKeys(
  section: WorkoutSection,
  movements: ResultPartMovement[],
): ScoreKey[] {
  const keys: ScoreKey[] =
    section.format === "for_time"
      ? ["time_seconds", "reps"]
      : section.format === "amrap"
        ? ["rounds", "reps"]
        : section.format === "emom"
          ? ["rounds"]
          : section.format === "other"
            ? ["time_seconds", "rounds", "reps"]
            : [];
  if (movements.some((movement) => movement.calories != null))
    keys.push("calories");
  if (movements.some((movement) => movement.distance_m != null))
    keys.push("distance_m");
  return [...new Set(keys)];
}

function scoreKeys(
  movement: ResultPartMovement | undefined,
  workoutType: Enums<"workout_type">,
): ScoreKey[] {
  const fields: ScoreKey[] = [];
  if (movement?.duration_seconds != null || workoutType === "for_time")
    fields.push("time_seconds");
  if (workoutType === "for_time") fields.push("reps");
  if (workoutType === "amrap" || workoutType === "emom")
    fields.push("rounds", "reps");
  if (movement?.calories != null) fields.push("calories");
  if (movement?.distance_m != null) fields.push("distance_m");
  if (workoutType === "other" && fields.length === 0)
    fields.push("time_seconds", "rounds", "reps");
  return [...new Set(fields)];
}

const SCORE_LABELS: Record<ScoreKey, string> = {
  time_seconds: "Time (seconds)",
  rounds: "Rounds",
  reps: "Reps",
  calories: "Calories",
  distance_m: "Distance (m)",
};

export function ResultPartsEditor({
  initialParts,
  movements,
  units,
  workoutType,
  inputId,
  initialRawParts,
  handoffToken,
  newPrSets = [],
  templateParts,
  resetKey,
  sections,
  initialSectionScores = [],
  initialRawSectionScores,
}: {
  initialParts: ResultPart[];
  movements: ResultPartMovement[];
  units: Units;
  workoutType: Enums<"workout_type">;
  inputId: string;
  initialRawParts?: string;
  handoffToken?: string;
  newPrSets?: Pick<LiftPrCandidate, "position" | "set_index">[];
  templateParts?: ResultPart[];
  resetKey?: string;
  sections?: WorkoutSection[];
  initialSectionScores?: SectionScore[];
  initialRawSectionScores?: string;
}) {
  const [parts, setParts] = useState(() => toDraftParts(initialParts, units));
  const [sectionScores, setSectionScores] = useState(() =>
    toDraftSectionScores(initialSectionScores),
  );
  const [dirty, setDirty] = useState(() =>
    initialPartsDirty(initialParts, templateParts),
  );
  const activeTemplate = templateParts ?? initialParts;
  const previousTemplate = useRef({ parts: activeTemplate, resetKey });
  const definitions = useMemo(
    () => new Map(movements.map((movement, position) => [position, movement])),
    [movements],
  );
  const sectionGroups = groupBySection(
    parts.map((part) => ({
      ...part,
      section: definitions.get(part.position)?.section ?? null,
    })),
    sections,
  );

  useEffect(() => {
    const shouldReset =
      previousTemplate.current.resetKey !== resetKey ||
      shouldResetParts(previousTemplate.current.parts, activeTemplate, dirty);
    previousTemplate.current = { parts: activeTemplate, resetKey };
    if (!shouldReset) return;
    setParts(toDraftParts(activeTemplate, units));
    setDirty(false);
  }, [activeTemplate, dirty, resetKey, units]);

  useEffect(() => {
    if (initialRawParts) {
      const submitted = fromRawParts(initialRawParts);
      if (submitted) {
        setParts(submitted);
        setDirty(true);
      }
      return;
    }
    if (!handoffToken) return;
    try {
      const key = `workout-result-parts:${handoffToken}`;
      const raw = sessionStorage.getItem(key);
      sessionStorage.removeItem(key);
      if (raw) {
        const handoff = fromRawParts(raw);
        if (handoff) {
          setParts(handoff);
          setDirty(true);
        }
      }
    } catch {
      return;
    }
  }, [handoffToken, initialRawParts]);

  useEffect(() => {
    if (!initialRawSectionScores) return;
    const submitted = fromRawSectionScores(initialRawSectionScores);
    if (submitted) {
      setSectionScores(submitted);
      setDirty(true);
    }
  }, [initialRawSectionScores]);

  useEffect(() => {
    if (initialRawSectionScores !== undefined || !handoffToken) return;
    try {
      const key = `workout-result-sections:${handoffToken}`;
      const raw = sessionStorage.getItem(key);
      sessionStorage.removeItem(key);
      if (raw) {
        const handoff = fromRawSectionScores(raw);
        if (handoff) {
          setSectionScores(handoff);
          setDirty(true);
        }
      }
    } catch {
      return;
    }
  }, [handoffToken, initialRawSectionScores]);

  const updateParts = (update: (current: DraftPart[]) => DraftPart[]) => {
    setDirty(true);
    setParts(update);
  };

  const updateSet = (
    position: number,
    setIndex: number,
    update: Partial<DraftSet>,
  ) =>
    updateParts((current) =>
      current.map((part) =>
        part.position !== position
          ? part
          : {
              ...part,
              sets: part.sets.map((set, index) =>
                index === setIndex ? { ...set, ...update } : set,
              ),
            },
      ),
    );

  const rawParts = JSON.stringify(serializeParts(parts));
  const rawSectionScores = JSON.stringify(serializeSectionScores(sectionScores));
  const updateSectionScore = (section: number, key: ScoreKey, value: string) => {
    setDirty(true);
    setSectionScores((current) => {
      const existing = current.find((score) => score.section === section);
      if (existing)
        return current.map((score) =>
          score.section === section
            ? { ...score, score: { ...score.score, [key]: value } }
            : score,
        );
      return [...current, { section, score: { [key]: value }, notes: "", notesExpanded: false }];
    });
  };
  const updateSectionNotes = (section: number, notes: string, expanded?: boolean) => {
    setDirty(true);
    setSectionScores((current) => {
      const existing = current.find((score) => score.section === section);
      if (existing)
        return current.map((score) =>
          score.section === section
            ? { ...score, notes, ...(expanded == null ? {} : { notesExpanded: expanded }) }
            : score,
        );
      return [...current, {
        section,
        score: {},
        notes,
        notesExpanded: expanded ?? Boolean(notes.trim()),
      }];
    });
  };

  return (
    <section className="grid gap-3">
      <h2 className="text-base font-semibold">Parts</h2>
      <input type="hidden" name="parts" value={rawParts} />
      <input type="hidden" name="section_scores" value={rawSectionScores} />
      {sectionGroups.flatMap((group) => [
        ...(group.section
          ? [
              <div key={`section-${group.index}`} className="grid gap-3 rounded-lg border border-amber-500/40 bg-amber-50/40 p-3 dark:bg-amber-950/10">
                <div>
                  <h3 className="font-semibold">{group.section.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {formatSectionHeadline(group.section)}
                  </p>
                </div>
                {group.section.format !== "strength" && group.index != null && (() => {
                  const score = sectionScores.find((item) => item.section === group.index);
                  const fields = sectionScoreKeys(
                    group.section!,
                    group.items
                      .map(({ movement }) => definitions.get(movement.position))
                      .filter((movement): movement is ResultPartMovement => Boolean(movement)),
                  );
                  return (
                    <fieldset className="grid gap-3">
                      <legend className="text-sm font-medium">Section score</legend>
                      <div className="grid grid-cols-2 gap-2">
                        {fields.map((field) => (
                          <label key={field} className="grid gap-1 text-xs text-muted-foreground">
                            {SCORE_LABELS[field]}
                            <Input
                              type="number"
                              min="0"
                              step={field === "calories" || field === "distance_m" ? "any" : "1"}
                              value={score?.score[field] ?? ""}
                              onChange={(event) => updateSectionScore(group.index!, field, event.target.value)}
                            />
                          </label>
                        ))}
                      </div>
                      {score?.notes?.trim() || score?.notesExpanded ? (
                        <div className="grid gap-1">
                          <Label htmlFor={`${inputId}-section-${group.index}-notes`}>Section notes</Label>
                          <Textarea
                            id={`${inputId}-section-${group.index}-notes`}
                            maxLength={300}
                            rows={2}
                            value={score?.notes ?? ""}
                            onChange={(event) => updateSectionNotes(group.index!, event.currentTarget.value, true)}
                            onBlur={(event) => {
                              if (event.currentTarget.value.trim()) return;
                              updateSectionNotes(group.index!, "", false);
                            }}
                          />
                        </div>
                      ) : (
                        <Button type="button" variant="link" className="h-auto w-fit justify-start p-0" onClick={() => updateSectionNotes(group.index!, "", true)}>
                          Add note
                        </Button>
                      )}
                    </fieldset>
                  );
                })()}
              </div>,
            ]
          : []),
        ...group.items.map(({ movement: part }, partIndex) => {
        const movement = definitions.get(part.position);
        const section = sections?.[movement?.section ?? -1];
        const sectionedConditioning = Boolean(section && section.format !== "strength");
        const fields = sectionedConditioning ? [] : scoreKeys(movement, workoutType);
        return (
          <details
            key={`${part.position}-${part.movement_id}`}
            open={partIndex === 0}
            className="rounded-lg border p-3"
          >
            <summary className="cursor-pointer font-medium">{part.name}</summary>
            <div className="mt-3 grid gap-3">
              {part.sets.length ? (
                <>
                  <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1.1fr)_auto_auto] items-end gap-1.5 px-1 text-xs font-medium text-muted-foreground">
                    <span>Set</span>
                    <span>Reps</span>
                    <span>Weight ({units})</span>
                    <span>Done</span>
                    <span className="sr-only">Actions</span>
                  </div>
                  <div className="grid gap-2">
                    {part.sets.map((set, setIndex) => (
                      <div
                        key={setIndex}
                        className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1.1fr)_auto_auto] items-center gap-1.5 rounded-md bg-muted/40 p-2"
                      >
                        <div className="grid min-w-0 gap-0.5">
                          <span className="whitespace-nowrap text-xs font-medium">
                            Set {setIndex + 1}
                          </span>
                          {newPrSets.some(
                            (candidate) =>
                              candidate.position === part.position &&
                              candidate.set_index === setIndex,
                          ) && (
                            <Badge className="h-4 w-fit px-1 py-0 text-[10px]">
                              New PR
                            </Badge>
                          )}
                        </div>
                        <div className="min-w-0">
                          <Input
                            id={`${inputId}-${part.position}-${setIndex}-reps`}
                            aria-label={`Set ${setIndex + 1} reps`}
                            type="number"
                            min="0"
                            max="1000"
                            step="1"
                            className="h-11 min-w-0 px-2"
                            value={set.reps}
                            onChange={(event) =>
                              updateSet(part.position, setIndex, {
                                reps: event.currentTarget.value,
                              })
                            }
                          />
                        </div>
                        <div className="min-w-0">
                          <Input
                            id={`${inputId}-${part.position}-${setIndex}-load`}
                            aria-label={`Set ${setIndex + 1} weight (${units})`}
                            type="number"
                            min="0"
                            max="2000"
                            step="any"
                            className="h-11 min-w-0 px-2"
                            value={set.load}
                            onChange={(event) =>
                              updateSet(part.position, setIndex, {
                                load: event.currentTarget.value,
                              })
                            }
                          />
                        </div>
                        <label className="flex h-11 items-center justify-center">
                          <input
                            type="checkbox"
                            aria-label={`Set ${setIndex + 1} done`}
                            checked={set.done}
                            onChange={(event) =>
                              updateSet(part.position, setIndex, {
                                done: event.currentTarget.checked,
                              })
                            }
                          />
                        </label>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-11 shrink-0"
                          aria-label={`Remove set ${setIndex + 1}`}
                          disabled={part.sets.length <= 1}
                          onClick={() =>
                            updateParts((current) =>
                              current.map((item) =>
                                item.position === part.position
                                  ? {
                                      ...item,
                                      sets: item.sets.filter(
                                        (_, index) => index !== setIndex,
                                      ),
                                    }
                                  : item,
                              ),
                            )
                          }
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-fit"
                    disabled={part.sets.length >= 100}
                    onClick={() =>
                      updateParts((current) =>
                        current.map((item) =>
                          item.position === part.position
                            ? {
                                ...item,
                                sets: [
                                  ...item.sets,
                                  { reps: "", load: "", done: true },
                                ],
                              }
                            : item,
                        ),
                      )
                    }
                  >
                    Add set
                  </Button>
                </>
              ) : fields.length ? (
                <div className="grid grid-cols-2 gap-2">
                  {fields.map((field) => (
                    <div className="grid gap-1" key={field}>
                      <Label htmlFor={`${inputId}-${part.position}-${field}`}>
                        {SCORE_LABELS[field]}
                      </Label>
                      <Input
                        id={`${inputId}-${part.position}-${field}`}
                        type="number"
                        min="0"
                        step={field === "time_seconds" || field === "rounds" || field === "reps" ? "1" : "any"}
                        value={part.score[field] ?? ""}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          updateParts((current) =>
                            current.map((item) =>
                              item.position === part.position
                                ? {
                                    ...item,
                                    score: {
                                      ...item.score,
                                      [field]: value,
                                    },
                                  }
                                : item,
                            ),
                          );
                        }}
                      />
                    </div>
                  ))}
                </div>
              ) : sectionedConditioning ? null : (
                <p className="text-sm text-muted-foreground">Score-only part</p>
              )}
              {sectionedConditioning && movement?.load_kg != null && (
                <label className="grid max-w-xs gap-1 text-xs text-muted-foreground">
                  Weight used ({units})
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={part.load}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      updateParts((current) =>
                        current.map((item) =>
                          item.position === part.position
                            ? { ...item, load: value }
                            : item,
                        ),
                      );
                    }}
                  />
                </label>
              )}
              {part.notes.trim() || part.notesExpanded ? (
                <div className="grid gap-1">
                  <Label htmlFor={`${inputId}-${part.position}-notes`}>Part notes</Label>
                  <Textarea
                    id={`${inputId}-${part.position}-notes`}
                    maxLength={300}
                    rows={2}
                    value={part.notes}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      updateParts((current) =>
                        current.map((item) =>
                          item.position === part.position
                            ? { ...item, notes: value }
                            : item,
                        ),
                      );
                    }}
                    onBlur={(event) => {
                      if (event.currentTarget.value.trim()) return;
                      updateParts((current) =>
                        current.map((item) =>
                          item.position === part.position
                            ? { ...item, notesExpanded: false }
                            : item,
                        ),
                      );
                    }}
                  />
                </div>
              ) : (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto w-fit justify-start p-0"
                  onClick={() =>
                    updateParts((current) =>
                      current.map((item) =>
                        item.position === part.position
                          ? { ...item, notesExpanded: true }
                          : item,
                      ),
                    )
                  }
                >
                  Add note
                </Button>
              )}
            </div>
          </details>
        );
      }),
      ])}
      {parts.length === 0 && (
        <p className="text-sm text-muted-foreground">No workout parts are available.</p>
      )}
    </section>
  );
}
