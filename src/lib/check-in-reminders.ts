const WINDOW_MS = 15 * 60_000;

export function isReminderTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):(?:00|15|30|45)(?::00)?$/.test(value);
}

export function isReminderTimeZone(value: string): boolean {
  if (!value || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch { return false; }
}

export function reminderDue(now: Date, remindAt: string, timeZone: string): { due: boolean; localDate: string } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  function wallTime(date: Date) {
    const parts = Object.fromEntries(formatter.formatToParts(date).map(({ type, value }) => [type, value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, instant: Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    ) };
  }
  const localDate = wallTime(now).date;
  if (!isReminderTime(remindAt)) return { due: false, localDate };
  const wall = Date.parse(`${localDate}T${remindAt.length === 5 ? remindAt + ":00" : remindAt}Z`);
  const offsets = new Set<number>();
  for (const hours of [-36, 0, 36]) {
    const sample = wall + hours * 3_600_000;
    offsets.add(wallTime(new Date(sample)).instant - sample);
  }
  const candidates = [...offsets].map((offset) => {
    const instant = wall - offset;
    return { instant, shift: wallTime(new Date(instant)).instant - wall };
  });
  const exact = candidates.filter(({ shift }) => shift === 0).map(({ instant }) => instant);
  // A gap uses the pre-transition offset; an overlap uses the earlier instant.
  const target = exact.length ? Math.min(...exact) : candidates
    .filter(({ shift }) => shift > 0).sort((a, b) => a.shift - b.shift)[0]?.instant;
  return { due: target !== undefined && now.getTime() >= target && now.getTime() < target + WINDOW_MS, localDate };
}

export function checkInReminderDecision({
  reminder, now, hasCheckedIn = false, hasSkipped = false, alreadySent = false, pushCategories,
}: {
  reminder: { remind_at: string | null; time_zone: string };
  now: Date; hasCheckedIn?: boolean; hasSkipped?: boolean; alreadySent?: boolean; pushCategories?: readonly string[];
}): { send: boolean; push: boolean } {
  const send = reminder.remind_at !== null && !hasCheckedIn && !hasSkipped && !alreadySent
    && reminderDue(now, reminder.remind_at, reminder.time_zone).due;
  return { send, push: send && (pushCategories === undefined || pushCategories.includes("reminders")) };
}
