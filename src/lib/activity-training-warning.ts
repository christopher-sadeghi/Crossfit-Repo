import type { SupabaseClient } from "@supabase/supabase-js";

import { LOW_READINESS } from "@/lib/check-in";
import { notify } from "@/lib/notifications";
import type { Database } from "@/lib/supabase/database.types";
import { getToday } from "@/lib/time-zone";
import { loadDate, shouldWarnAboutLoad } from "@/lib/training-load";
import { loadTrainingLoad } from "@/lib/training-load-data";

type Client = SupabaseClient<Database>;

export async function checkTrainingLoad(supabase: Client, athleteId: string, asOf?: string) {
  try {
    const today = asOf ?? await getToday();
    const [{ data: athlete, error: athleteError }, load] = await Promise.all([
      supabase.from("athletes").select("first_name, last_name, coaches(load_warning_ratio)").eq("id", athleteId).single(),
      loadTrainingLoad(supabase, athleteId, today, 4),
    ]);
    if (athleteError) throw athleteError;
    if (load.ratio == null || !shouldWarnAboutLoad(load.acute, load.ratio, athlete.coaches?.load_warning_ratio)) return;
    const { data: latest, error } = await supabase.from("athlete_journal_entries").select("readiness")
      .eq("athlete_id", athleteId).lte("entry_on", today).not("readiness", "is", null)
      .order("entry_on", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    const low = latest?.readiness != null && latest.readiness < LOW_READINESS;
    const monday = loadDate(today, (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7);
    await notify(supabase, {
      athleteId,
      kind: "high_training_load",
      title: `${athlete.first_name} ${athlete.last_name}: high training load${low ? " + low readiness" : ""}`,
      body: `The last 7 days were ${load.ratio.toFixed(2)}× the 28-day weekly average.${low ? ` Latest check-in readiness was low (${latest.readiness}/100).` : ""}`,
      link: `/athletes/${athleteId}?tab=load`,
      dedupeKey: `training-load:${athleteId}:${monday}${low ? ":low-readiness" : ""}`,
    });
  } catch (error) {
    console.error("Training load warning check failed:", error);
  }
}

export async function checkCoachTrainingLoad(supabase: Client, coachId: string) {
  try {
    const today = await getToday();
    const { data, error } = await supabase.from("athletes").select("id").eq("coach_id", coachId).eq("status", "active");
    if (error) throw error;
    for (let index = 0; index < data.length; index += 10) {
      await Promise.all(data.slice(index, index + 10).map(({ id }) => checkTrainingLoad(supabase, id, today)));
    }
  } catch (error) {
    console.error("Coach training load checks failed:", error);
  }
}
