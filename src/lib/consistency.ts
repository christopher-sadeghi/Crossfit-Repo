export const DEFAULT_DRIFT_DAYS = 5;
export const DECLINING_MIN_SCHEDULED_DAYS = 4;
export const DECLINING_MIN_PREVIOUS_RATE = 50;
export const DECLINING_RATE_DROP = 25;

export type ConsistencyInput = {
  today: string;
  scheduled: { date: string; workoutId: string }[];
  results: { performed_on: string; workout_id: string }[];
  attendance: { attended_on: string; kind: string }[];
};
export type DayStatus = "completed" | "partial" | "missed" | "pending" | "extra" | "rest";
export type ConsistencyWindow = {
  scheduled: number; completed: number; partial: number; missed: number; rate: number | null;
};
export type ConsistencyStats = {
  windows: Record<7 | 30 | 90, ConsistencyWindow>;
  prev30: ConsistencyWindow;
  currentStreak: number;
  bestStreak: number;
  lastActivityDate: string | null;
  daysSinceActivity: number | null;
  scheduledDaysTotal: number;
  days: { date: string; status: DayStatus }[];
};

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;
const calendarDate = (day: number) => {
  const date = new Date(day * 86_400_000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
};

/** Evaluate calendar days using the caller's local today, never the server clock. */
export function computeConsistency(input: ConsistencyInput): ConsistencyStats {
  const { today } = input;
  const end = dayNumber(today);
  const resultDates = new Set(input.results.filter((r) => r.performed_on <= today).map((r) => r.performed_on));
  const resultWorkouts = new Set(input.results.filter((r) => r.performed_on <= today).map((r) => r.workout_id));
  const attendanceDates = new Set(input.attendance.filter((a) => a.attended_on <= today).map((a) => a.attended_on));
  const activity = new Set([...resultDates, ...attendanceDates]);
  const scheduled = new Map<string, Set<string>>();
  for (const item of input.scheduled) {
    if (item.date > today) continue;
    if (!scheduled.has(item.date)) scheduled.set(item.date, new Set());
    scheduled.get(item.date)!.add(item.workoutId);
  }
  const statuses = new Map<string, DayStatus>();
  let currentStreak = 0;
  let bestStreak = 0;
  for (const [date, workouts] of [...scheduled].sort(([a], [b]) => a.localeCompare(b))) {
    const idMatches = [...workouts].filter((id) => resultWorkouts.has(id)).length;
    const unmatchedSameDayResults = input.results.filter((r) => r.performed_on === date && !workouts.has(r.workout_id)).length;
    const done = Math.min(workouts.size, idMatches + unmatchedSameDayResults);
    const status = attendanceDates.has(date) || done === workouts.size ? "completed"
      : done > 0 ? "partial" : date < today ? "missed" : "pending";
    statuses.set(date, status);
    if (status === "pending") continue;
    currentStreak = status === "missed" ? 0 : currentStreak + 1;
    bestStreak = Math.max(bestStreak, currentStreak);
  }
  const window = (length: number, offset = 0): ConsistencyWindow => {
    const counts = { scheduled: 0, completed: 0, partial: 0, missed: 0 };
    for (const [date, status] of statuses) {
      const age = end - dayNumber(date);
      if (age < offset || age >= offset + length || status === "pending") continue;
      if (status === "completed" || status === "partial" || status === "missed") {
        counts.scheduled++;
        counts[status]++;
      }
    }
    return { ...counts, rate: counts.scheduled ? Math.round(100 * (counts.completed + counts.partial * 0.5) / counts.scheduled) : null };
  };
  const lastActivityDate = [...activity].sort().at(-1) ?? null;
  return {
    windows: { 7: window(7), 30: window(30), 90: window(90) },
    prev30: window(30, 30),
    currentStreak, bestStreak, lastActivityDate,
    scheduledDaysTotal: [...statuses.values()].filter((status) => status !== "pending").length,
    daysSinceActivity: lastActivityDate ? end - dayNumber(lastActivityDate) : null,
    days: Array.from({ length: 90 }, (_, i) => {
      const date = calendarDate(end - 89 + i);
      return { date, status: statuses.get(date) ?? (activity.has(date) ? "extra" : "rest") };
    }),
  };
}

/** Flag inactivity or a substantial decline relative to the preceding 30 days. */
export function drifting(stats: ConsistencyStats, { driftDays = DEFAULT_DRIFT_DAYS }: { driftDays?: number } = {}) {
  const reasons: ("inactive" | "declining")[] = [];
  const inactive = stats.daysSinceActivity !== null ? stats.daysSinceActivity >= driftDays
    : stats.scheduledDaysTotal > 0;
  if (inactive) reasons.push("inactive");
  const last30Rate = stats.windows[30].rate;
  const prev30Rate = stats.prev30.rate;
  if (stats.prev30.scheduled >= DECLINING_MIN_SCHEDULED_DAYS &&
      (prev30Rate ?? 0) >= DECLINING_MIN_PREVIOUS_RATE &&
      stats.windows[30].scheduled > 0 &&
      (prev30Rate ?? 0) - (last30Rate ?? 0) >= DECLINING_RATE_DROP) reasons.push("declining");
  return { drifting: reasons.length > 0, reasons, daysSinceActivity: stats.daysSinceActivity, last30Rate, prev30Rate };
}
