type ScalingRow = {
  modifications: string;
  details: unknown;
  athlete_adjusted_at: string | null;
  coach_modifications: string | null;
  coach_details: unknown;
};

/** An athlete change only counts on the day it was made; after that the coach's scaling (if any) applies again. */
export function effectiveScaling<T extends ScalingRow>(row: T | null | undefined, today: string): T | null {
  if (!row) return null;
  if (!row.athlete_adjusted_at) return row;
  const details = row.details as { scheduled_on?: unknown } | null;
  if (details?.scheduled_on === today) return row;
  if (row.coach_modifications == null) return null;
  return {
    ...row,
    modifications: row.coach_modifications,
    details: row.coach_details,
    athlete_adjusted_at: null,
    coach_modifications: null,
    coach_details: null,
  };
}
