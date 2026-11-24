import type { WorkoutSection } from "@/lib/workout-sections";

export type TimerConfig = (
  | { mode: "for_time"; capSeconds?: number }
  | { mode: "amrap"; durationSeconds: number }
  | { mode: "emom"; intervalSeconds: number; intervals: number }
  | { mode: "tabata"; work: number; rest: number; rounds: number }
  | { mode: "rest"; seconds: number }
) & { readySeconds?: number };
export type TimerView = { phase: "countdown" | "work" | "rest" | "done"; displaySeconds: number; index: number; remaining: number | null };

export function timerForSection(
  section: Pick<WorkoutSection, "format" | "time_cap_seconds">,
): TimerConfig | null {
  const capSeconds = section.time_cap_seconds;
  if (capSeconds == null) return null;
  switch (section.format) {
    case "amrap":
      return { mode: "amrap", durationSeconds: capSeconds };
    case "for_time":
      return { mode: "for_time", capSeconds };
    case "emom": {
      const intervals = capSeconds / 60;
      return Number.isInteger(intervals) && intervals >= 1
        ? { mode: "emom", intervalSeconds: 60, intervals }
        : null;
    }
    default:
      return null;
  }
}

export function timerDuration(config: TimerConfig) {
  switch (config.mode) {
    case "for_time": return config.capSeconds ?? Infinity;
    case "amrap": return config.durationSeconds;
    case "emom": return config.intervalSeconds * config.intervals;
    case "tabata": return (config.work + config.rest) * config.rounds;
    case "rest": return config.seconds;
  }
}

export function timerView(config: TimerConfig, elapsedMs: number): TimerView {
  const duration = timerDuration(config);
  const ready = config.readySeconds ?? 10;
  if (!Number.isFinite(elapsedMs) || ready < 0 || !(duration > 0)) throw new Error("Invalid timer");
  const elapsed = Math.max(0, elapsedMs / 1000);
  if (elapsed < ready) return { phase: "countdown", displaySeconds: Math.ceil(ready - elapsed), index: 0, remaining: Number.isFinite(duration) ? duration : null };
  const workElapsed = elapsed - ready;
  const remaining = Number.isFinite(duration) ? Math.max(0, duration - workElapsed) : null;
  if (workElapsed >= duration) return { phase: "done", displaySeconds: 0, index: config.mode === "emom" ? config.intervals - 1 : config.mode === "tabata" ? config.rounds - 1 : 0, remaining: 0 };
  if (config.mode === "emom") return { phase: "work", displaySeconds: Math.ceil(config.intervalSeconds - workElapsed % config.intervalSeconds), index: Math.floor(workElapsed / config.intervalSeconds), remaining };
  if (config.mode === "tabata") {
    const cycle = config.work + config.rest;
    const position = workElapsed % cycle;
    const rest = position >= config.work;
    return { phase: rest ? "rest" : "work", displaySeconds: Math.ceil((rest ? cycle : config.work) - position), index: Math.floor(workElapsed / cycle), remaining };
  }
  return { phase: config.mode === "rest" ? "rest" : "work", displaySeconds: config.mode === "for_time" ? Math.floor(workElapsed) : Math.ceil(remaining!), index: 0, remaining };
}

export type TimerCue = { atMs: number; kind: "beep" | "start" | "finish" };
export function crossedCues(config: TimerConfig, previousMs: number, elapsedMs: number): TimerCue[] {
  if (elapsedMs <= previousMs) return [];
  const events: TimerCue[] = [];
  const ready = config.readySeconds ?? 10;
  const duration = timerDuration(config);
  const add = (seconds: number, kind: TimerCue["kind"]) => {
    const atMs = seconds * 1000;
    if (seconds >= 0 && atMs > previousMs && atMs <= elapsedMs) events.push({ atMs, kind });
  };
  for (let i = 3; i > 0; i--) if (ready >= i) add(ready - i, "beep");
  add(ready, "start");
  const boundaries: number[] = [];
  if (config.mode === "emom") for (let i = 1; i < config.intervals; i++) boundaries.push(i * config.intervalSeconds);
  if (config.mode === "tabata") for (let i = 0; i < config.rounds; i++) {
    boundaries.push(i * (config.work + config.rest) + config.work);
    if (i > 0) boundaries.push(i * (config.work + config.rest));
  }
  if (Number.isFinite(duration)) boundaries.push(duration);
  for (const boundary of boundaries) {
    for (let i = 3; i > 0; i--) if (boundary >= i) add(ready + boundary - i, "beep");
    add(ready + boundary, boundary === duration ? "finish" : "start");
  }
  return [...new Map(events.sort((a, b) => a.atMs - b.atMs).map((event) => [event.atMs, event])).values()];
}

export type TimerClock = { startedAt: number | null; pausedAt: number | null; accumulated: number };
export function elapsedTime(clock: TimerClock, now: number) {
  return clock.accumulated + (clock.startedAt == null ? 0 : Math.max(0, (clock.pausedAt ?? now) - clock.startedAt));
}

export function defaultTimer(workout: { workout_type: string; time_cap_seconds: number | null; rounds: number | null; title: string; description?: string | null }): TimerConfig {
  switch (workout.workout_type) {
    case "for_time": return { mode: "for_time", capSeconds: workout.time_cap_seconds ?? undefined };
    case "amrap": return { mode: "amrap", durationSeconds: workout.time_cap_seconds ?? 1200 };
    case "emom": return { mode: "emom", intervalSeconds: 60, intervals: workout.rounds ?? Math.max(1, Math.floor((workout.time_cap_seconds ?? 600) / 60)) };
    case "strength": return { mode: "rest", seconds: 120 };
    default: return /tabata/i.test(`${workout.title} ${workout.description ?? ""}`) ? { mode: "tabata", work: 20, rest: 10, rounds: 8 } : { mode: "for_time" };
  }
}
