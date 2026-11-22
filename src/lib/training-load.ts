export const DEFAULT_LOAD_WARNING_RATIO = 1.5;
export const MIN_WARNING_LOAD = 1000;

export function sessionLoad(durationMinutes: number, rpe: number) {
  return durationMinutes * rpe;
}

export function gymSessionLoad(
  result: { time_seconds: number | null; rpe: number | null },
  workout: { workout_type: string; time_cap_seconds: number | null } | null,
) {
  const positive = (seconds: number | null | undefined) => seconds != null && seconds > 0 ? seconds : null;
  const timeScore = positive(result.time_seconds);
  const cap = positive(workout?.time_cap_seconds);
  const fixedDuration = workout?.workout_type === "amrap" || workout?.workout_type === "emom";
  const seconds = (fixedDuration ? cap ?? timeScore : timeScore ?? cap) ??
    (workout?.workout_type === "amrap" ? 20 * 60 : 45 * 60);
  return {
    load: sessionLoad(seconds / 60, result.rpe ?? 6),
    estimated: result.rpe == null || (timeScore == null && (!fixedDuration || cap == null)),
  };
}

export type LoadSession = { date: string; load: number; kind: "gym" | "outside"; estimated?: boolean };

export function loadDate(asOf: string, daysAgo: number) {
  const date = new Date(`${asOf}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

export function summarizeLoad(sessions: LoadSession[], asOf: string, weeks = 8) {
  const weekly = Array.from({ length: weeks }, (_, index) => ({
    from: loadDate(asOf, (weeks - index) * 7 - 1),
    to: loadDate(asOf, (weeks - index - 1) * 7),
    gym: 0,
    outside: 0,
    estimatedGymSessions: 0,
  }));
  const from7 = loadDate(asOf, 6);
  const from28 = loadDate(asOf, 27);
  let acute = 0;
  let total28 = 0;
  let estimatedGymSessions28 = 0;
  for (const session of sessions) {
    if (session.date > asOf) continue;
    if (session.date >= from7) acute += session.load;
    if (session.date >= from28) {
      total28 += session.load;
      if (session.kind === "gym" && session.estimated) estimatedGymSessions28++;
    }
    const week = weekly.find(({ from, to }) => session.date >= from && session.date <= to);
    if (!week) continue;
    week[session.kind] += session.load;
    if (session.kind === "gym" && session.estimated) week.estimatedGymSessions++;
  }
  const chronic = total28 / 4;
  return { acute, chronic, ratio: chronic > 0 ? acute / chronic : null, weekly, estimatedGymSessions28 };
}

export function shouldWarnAboutLoad(acute: number, ratio: number | null, threshold = DEFAULT_LOAD_WARNING_RATIO) {
  return acute >= MIN_WARNING_LOAD && ratio != null && ratio > threshold;
}
