import { addDays } from "./nutrition";

/** Monday of the week containing a local calendar date. */
export function monday(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

/** Calendar date (YYYY-MM-DD) of a program day for an athlete who starts on `start`. */
export function programDate(start: string, week: number, day: number) {
  const d = new Date(`${start.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (week - 1) * 7 + (day - 1));
  return d.toISOString().slice(0, 10);
}

export function today(timeZone = "UTC") {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
