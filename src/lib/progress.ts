import type { Enums } from "@/lib/supabase/database.types";
import { formatWeight, type Units } from "@/lib/units";

/** How a goal's current value is worked out. Derived from the goal's metric, unit and movement. */
export const TRACKING = ["body_weight", "body_fat", "max_load", "max_reps", "manual"] as const;
export type Tracking = (typeof TRACKING)[number];
export const TRACKING_LABELS: Record<Tracking, string> = {
  body_weight: "Body weight (from body metrics)",
  body_fat: "Body fat % (from body metrics)",
  max_load: "Heaviest load on a movement (from results)",
  max_reps: "Most reps of a movement (from results)",
  manual: "Not tracked automatically",
};

export const GOAL_TYPES = ["performance", "body_composition", "skill"] as const;
export const GOAL_TYPE_LABELS: Record<Enums<"goal_type">, string> = {
  performance: "Performance",
  body_composition: "Body composition",
  skill: "Skill",
};

type GoalLike = {
  metric: string | null;
  unit: string | null;
  movement_id: string | null;
  start_value: number | null;
  target_value: number | null;
  status: Enums<"goal_status">;
};
export type MetricRow = { measured_on: string; weight_kg: number | null; body_fat_pct: number | null };
export type MovementResult = {
  performed_on: string;
  load_kg: number | null;
  reps: number | null;
  workouts: { workout_type: Enums<"workout_type">; workout_movements: { movement_id: string }[] } | null;
};

export function trackingOf(goal: Pick<GoalLike, "metric" | "unit" | "movement_id">): Tracking {
  const metric = goal.metric?.trim().toLowerCase() ?? "";
  if (metric === "body weight") return "body_weight";
  if (metric === "body fat" || goal.unit === "%") return "body_fat";
  if (goal.movement_id && goal.unit === "kg") return "max_load";
  if (goal.movement_id && goal.unit === "reps") return "max_reps";
  return "manual";
}

/** Most recent body metric that has a value for `key`. */
export function latestMetric<M extends MetricRow>(metrics: M[], key: "weight_kg" | "body_fat_pct") {
  let latest: M | null = null;
  for (const m of metrics) if (m[key] != null && (!latest || m.measured_on > latest.measured_on)) latest = m;
  return latest;
}

/**
 * Load counts from strength WODs or single-movement WODs that include the movement;
 * reps only from single-movement WODs, where every rep belongs to that movement.
 */
function movementScore(r: MovementResult, movementId: string, kind: "load" | "reps") {
  const ids = r.workouts?.workout_movements.map((m) => m.movement_id) ?? [];
  if (!ids.includes(movementId)) return null;
  const solo = ids.length === 1;
  const value = kind === "load" ? (solo || r.workouts?.workout_type === "strength" ? r.load_kg : null) : solo ? r.reps : null;
  return value == null ? null : Number(value);
}

export function bestForMovement(results: MovementResult[], movementId: string, kind: "load" | "reps") {
  let best: number | null = null;
  for (const r of results) {
    const v = movementScore(r, movementId, kind);
    if (v != null && (best == null || v > best)) best = v;
  }
  return best;
}

/** Heaviest load per movement (kg), from strength or single-movement WODs. */
export function loadPrsByMovement(results: MovementResult[]) {
  const best = new Map<string, number>();
  for (const r of results)
    for (const { movement_id } of r.workouts?.workout_movements ?? []) {
      const v = movementScore(r, movement_id, "load");
      if (v != null && v > (best.get(movement_id) ?? 0)) best.set(movement_id, v);
    }
  return best;
}

export function goalProgress(goal: GoalLike, data: { metrics: MetricRow[]; results: MovementResult[] }) {
  const tracking = trackingOf(goal);
  const current =
    tracking === "body_weight"
      ? numberOrNull(latestMetric(data.metrics, "weight_kg")?.weight_kg)
      : tracking === "body_fat"
        ? numberOrNull(latestMetric(data.metrics, "body_fat_pct")?.body_fat_pct)
        : tracking === "max_load" || tracking === "max_reps"
          ? bestForMovement(data.results, goal.movement_id!, tracking === "max_load" ? "load" : "reps")
          : null;

  const { start_value: start, target_value: target } = goal;
  const increasing = start == null || target == null || target >= start;
  const reached = current != null && target != null && (increasing ? current >= target : current <= target);
  let pct: number | null = null;
  if (goal.status === "achieved") pct = 100;
  else if (reached) pct = 100;
  else if (current != null && start != null && target != null && target !== start)
    pct = Math.round(Math.min(1, Math.max(0, (current - start) / (target - start))) * 100);
  return { tracking, current, pct, reached };
}

function numberOrNull(v: number | null | undefined) {
  return v == null ? null : Number(v);
}

/** Goal values in kg are stored in kg and shown in the coach's units. */
export function formatGoalValue(value: number | null | undefined, unit: string | null, units: Units) {
  if (value == null) return "—";
  if (unit === "kg") return formatWeight(value, units);
  const n = Math.round(value * 10) / 10;
  return unit === "%" ? `${n}%` : `${n}${unit ? ` ${unit}` : ""}`;
}
