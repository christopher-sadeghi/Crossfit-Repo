export function workoutPrefill(params: Record<string, unknown>): Record<string, string> {
  const values: Record<string, string> = {};
  const number = (key: string, maximum: number, integer = true) => {
    const raw = params[key];
    if (typeof raw !== "string" || !/^\d+(?:\.\d+)?$/.test(raw)) return;
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0 && value <= maximum && (!integer || Number.isInteger(value))) return value;
  };
  const time = number("time_seconds", 86400);
  if (time !== undefined) {
    values.minutes = String(Math.floor(time / 60));
    values.seconds = String(time % 60);
  }
  for (const key of ["rounds", "reps", "load"]) {
    const value = number(key, key === "load" ? 10000 : 100000, key !== "load");
    if (value !== undefined) values[key] = String(value);
  }
  if (params.is_rx === "rx" || params.is_rx === "scaled") values.is_rx = params.is_rx;
  if (typeof params.notes === "string") values.notes = params.notes.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, 500);
  return values;
}
