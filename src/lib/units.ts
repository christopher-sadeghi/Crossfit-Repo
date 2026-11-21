export type Units = "lb" | "kg";

const LB_PER_KG = 2.20462;

export function formatWeight(kg: number | null | undefined, units: Units) {
  if (kg == null) return "—";
  const value = units === "lb" ? kg * LB_PER_KG : kg;
  return `${value.toFixed(units === "lb" ? 0 : 1)} ${units}`;
}

export function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export function formatScore(
  r: { time_seconds: number | null; rounds: number | null; reps: number | null; load_kg: number | null },
  units: Units,
) {
  if (r.time_seconds != null) return formatDuration(r.time_seconds);
  if (r.load_kg != null) return formatWeight(r.load_kg, units);
  if (r.rounds != null) return r.reps ? `${r.rounds} rounds + ${r.reps}` : `${r.rounds} rounds`;
  if (r.reps != null) return `${r.reps} reps`;
  return "—";
}

export function formatDate(date: string) {
  return new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
