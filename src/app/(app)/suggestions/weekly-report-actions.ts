"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { COACH_SESSION_ERROR } from "@/lib/ai/coach-session";
import { requestRegisteredSuggestion } from "@/lib/ai/request";
import { aiDailyLimit, aiLimitMessage } from "@/lib/ai/service-core";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/time-zone";
import { getViewer } from "@/lib/viewer";
import { completedReportWeek } from "@/lib/weekly-report";

export async function loadWeeklyReportBatch() {
  const viewer = await getViewer();
  if (viewer?.kind !== "coach") return { error: COACH_SESSION_ERROR };
  const [supabase, today] = await Promise.all([createClient(), getToday()]);
  const athleteIds: string[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from("athletes").select("id")
      .eq("coach_id", viewer.gymId).eq("status", "active").order("id").range(offset, offset + pageSize - 1);
    if (error) return { error: "Couldn't load your active athletes. Please try again." };
    athleteIds.push(...data.map(({ id }) => id));
    if (data.length < pageSize) break;
  }
  return { athleteIds, startOn: completedReportWeek(today).start_on };
}

type BatchResult =
  | { outcome: "drafted" | "skipped" | "failed" }
  | { outcome: "stopped"; message: string };

// A separate request per athlete keeps a long batch within the normal server request timeout.
export async function generateWeeklyReportInBatch(athleteId: string, startOn: string): Promise<BatchResult> {
  const viewer = await getViewer();
  if (viewer?.kind !== "coach") return { outcome: "stopped", message: COACH_SESSION_ERROR };
  const id = z.uuid().safeParse(athleteId);
  if (!id.success) return { outcome: "failed" };
  const today = await getToday();
  if (completedReportWeek(today).start_on !== startOn) {
    return { outcome: "stopped", message: "The report week changed. Start a new batch to continue." };
  }

  const supabase = await createClient();
  const [athlete, alreadyDrafted] = await Promise.all([
    supabase.from("athletes").select("id").eq("id", id.data).eq("coach_id", viewer.gymId).eq("status", "active").maybeSingle(),
    supabase.from("ai_suggestions").select("id").eq("athlete_id", id.data).eq("suggestion_type", "weekly_report")
      .in("status", ["pending", "approved", "edited"]).contains("input", { start_on: startOn }).limit(1).maybeSingle(),
  ]);
  if (athlete.error || alreadyDrafted.error) return { outcome: "failed" };
  if (!athlete.data || alreadyDrafted.data) return { outcome: "skipped" };

  const result = await requestRegisteredSuggestion(supabase, "weekly_report", { athleteId: id.data });
  revalidatePath("/settings/ai-history");
  revalidatePath(`/athletes/${id.data}`);
  if ("id" in result) return { outcome: "drafted" };
  return result.error === aiLimitMessage(aiDailyLimit())
    ? { outcome: "stopped", message: result.error }
    : { outcome: "failed" };
}
