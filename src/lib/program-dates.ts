/** Calendar date (YYYY-MM-DD) of a program day for an athlete who starts on `start`. */
export function programDate(start: string, week: number, day: number) {
  const d = new Date(`${start.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (week - 1) * 7 + (day - 1));
  return d.toISOString().slice(0, 10);
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}
