function localDate(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(timestamp);
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function startOfLocalDate(date: string, timeZone: string) {
  const center = Date.parse(`${date}T00:00:00Z`);
  let lo = center - 36 * 3600_000, hi = center + 36 * 3600_000;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (localDate(mid, timeZone) < date) lo = mid + 1;
    else hi = mid;
  }
  return new Date(lo).toISOString();
}

export function assistantDayBounds(today: string, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || !Number.isFinite(Date.parse(`${today}T00:00:00Z`))
    || new Date(`${today}T00:00:00Z`).toISOString().slice(0, 10) !== today)
    throw new Error("Invalid local date.");
  const next = new Date(Date.parse(`${today}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10);
  return { start: startOfLocalDate(today, timeZone), end: startOfLocalDate(next, timeZone) };
}
export const assistantLimitReached = (count: number, limit: number, reserved = false) => reserved ? count > limit : count >= limit;
