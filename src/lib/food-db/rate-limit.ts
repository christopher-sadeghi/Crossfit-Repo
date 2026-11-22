import "server-only";

const minute = 60_000;
const day = 24 * 60 * minute;
const state = globalThis as typeof globalThis & { foodLookupRequests?: Map<string, number[]> };
// Best-effort per server instance; shared by text and barcode lookups, including cache hits.
const requests = state.foodLookupRequests ??= new Map<string, number[]>();

export function foodLookupLimit(account: string, now = Date.now()): Response | null {
  for (const [key, times] of requests) {
    if (times[times.length - 1] <= now - day) requests.delete(key);
  }
  const times = (requests.get(account) ?? []).filter(time => time > now - day);
  const recent = times.filter(time => time > now - minute);
  const daily = times.length >= 300;
  if (daily || recent.length >= 30) {
    const retry = Math.max(1, Math.ceil(((daily ? times[0] + day : recent[0] + minute) - now) / 1000));
    return Response.json({ error: daily ? "You've reached today's food search limit — try again tomorrow or enter the food manually." : "You're searching very fast — wait a minute or enter the food manually." }, { status: 429, headers: { "Retry-After": String(retry) } });
  }
  times.push(now);
  requests.set(account, times);
  return null;
}
