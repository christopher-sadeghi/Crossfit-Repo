import { cookies } from "next/headers";
import { cache } from "react";

import { today } from "@/lib/program-dates";

/** The viewer's IANA time zone, set by `TimeZoneSync` from the browser. Falls back to UTC. */
export const getTimeZone = cache(async () => {
  const tz = (await cookies()).get("tz")?.value;
  if (tz) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return tz;
    } catch {}
  }
  return "UTC";
});

/** Today's date (YYYY-MM-DD) in the viewer's time zone. */
export async function getToday() {
  return today(await getTimeZone());
}
