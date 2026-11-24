import { z } from "zod";

export const SECTION_FORMATS = [
  "strength",
  "for_time",
  "amrap",
  "emom",
  "other",
] as const;

export const workoutSectionSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    format: z.enum(SECTION_FORMATS),
    time_cap_seconds: z.number().int().min(1).max(10800).nullable(),
    rounds: z.number().int().min(1).max(100).nullable(),
  })
  .strict();

export const workoutSectionsSchema = z.array(workoutSectionSchema).max(10);

export type WorkoutSection = z.infer<typeof workoutSectionSchema>;

type MovementWithSection = { section?: number | null };

export function normalizeSections<T extends MovementWithSection>(
  sections: unknown,
  movements: T[],
): { sections: WorkoutSection[]; movements: (T & { section: number | null })[] } {
  const parsedSections = workoutSectionsSchema.safeParse(sections);
  if (!parsedSections.success)
    throw new Error("Sections must contain at most 10 valid section definitions.");

  if (parsedSections.data.length === 0) {
    return {
      sections: [],
      movements: movements.map((movement) => ({ ...movement, section: null })),
    };
  }

  let previousSection = 0;
  const assigned = movements.map((movement) => {
    const section = movement.section ?? previousSection;
    if (
      !Number.isInteger(section) ||
      section < 0 ||
      section >= parsedSections.data.length
    )
      throw new Error("Each movement must refer to an existing section.");
    previousSection = section;
    return { movement, section };
  });

  assigned.sort((a, b) => a.section - b.section);
  const usedSections = [...new Set(assigned.map(({ section }) => section))];
  const remappedSections = new Map(
    usedSections.map((section, index) => [section, index]),
  );

  return {
    sections: usedSections.map((section) => parsedSections.data[section]),
    movements: assigned.map(({ movement, section }) => ({
      ...movement,
      section: remappedSections.get(section)!,
    })),
  };
}

export type SectionGroup<T> = {
  section: WorkoutSection | null;
  index: number | null;
  items: { movement: T; position: number }[];
};

export function groupBySection<T>(
  movements: T[],
  sections: unknown,
): SectionGroup<T>[] {
  const items = movements.map((movement, index) => ({
    movement,
    position:
      typeof (movement as { position?: unknown }).position === "number"
        ? (movement as { position: number }).position
        : index,
  }));
  const fallback = (): SectionGroup<T>[] => [
    { section: null, index: null, items },
  ];
  const parsedSections = workoutSectionsSchema.safeParse(sections);
  if (!parsedSections.success || parsedSections.data.length === 0)
    return fallback();

  const groups = new Map<number, { movement: T; position: number }[]>();
  for (const item of items) {
    const section = (item.movement as { section?: unknown }).section;
    if (
      typeof section !== "number" ||
      !Number.isInteger(section) ||
      section < 0 ||
      section >= parsedSections.data.length
    )
      return fallback();
    const group = groups.get(section) ?? [];
    group.push(item);
    groups.set(section, group);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, groupItems]) => ({
      section: parsedSections.data[index],
      index,
      items: groupItems,
    }));
}

export function formatSectionHeadline(section: WorkoutSection | null): string {
  if (!section) return "";
  const minutes = section.time_cap_seconds
    ? `${Math.round((section.time_cap_seconds / 60) * 10) / 10} min`
    : "";
  switch (section.format) {
    case "for_time": {
      const headline =
        section.rounds && section.rounds > 1
          ? `${section.rounds} Rounds For Time`
          : "For Time";
      return minutes ? `${headline} · ${minutes} cap` : headline;
    }
    case "amrap":
      return `AMRAP ${minutes}`.trim();
    case "emom":
      return `EMOM ${minutes}`.trim();
    case "strength":
      return "Strength";
    default: {
      const rounds =
        section.rounds && section.rounds > 1
          ? `${section.rounds} Rounds`
          : "";
      return [rounds, minutes ? `${minutes} cap` : ""]
        .filter(Boolean)
        .join(" · ");
    }
  }
}
