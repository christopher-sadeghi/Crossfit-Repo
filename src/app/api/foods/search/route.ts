import { z } from "zod";

import { searchOff, searchUsda } from "@/lib/food-db/providers";
import { foodLookupLimit } from "@/lib/food-db/rate-limit";
import { getViewer } from "@/lib/viewer";

export async function GET(request: Request) {
  const viewer = await getViewer();
  if (viewer?.kind !== "coach" && viewer?.kind !== "athlete") return Response.json({ error: "Please sign in to search foods." }, { status: 401 });
  const limitedAccount = foodLookupLimit(viewer.kind === "coach" ? `coach:${viewer.id}` : `athlete:${viewer.athleteId}`);
  if (limitedAccount) return limitedAccount;
  const parsed = z.object({ q: z.string().trim().min(2).max(100), source: z.enum(["all", "usda", "off"]).default("all") }).safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "Enter 2–100 characters and choose a valid food source." }, { status: 400 });
  const { q, source } = parsed.data;
  const results = await Promise.all([...(source !== "off" ? [searchUsda(q)] : []), ...(source !== "usda" ? [searchOff(q)] : [])]);
  const successes = results.filter(r => r.ok);
  const limited = results.some(r => !r.ok && r.reason === "rate_limit");
  if (!successes.length) return Response.json({ error: limited ? "Food search is busy right now — please try again shortly or enter the food manually." : "Food search isn't available right now — you can enter the food manually." }, { status: 503 });
  return Response.json({ items: successes.flatMap(r => r.items), ...(successes.length < results.length ? { notice: limited ? "One food source is busy right now. Showing results from the other source." : "One food source isn't available right now. Showing results from the other source." } : {}) });
}
