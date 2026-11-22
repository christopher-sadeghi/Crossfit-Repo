import type { SupabaseClient } from "@supabase/supabase-js";

import { LOW_READINESS } from "@/lib/check-in";
import { notify } from "@/lib/notifications";
import type { Database } from "@/lib/supabase/database.types";
import { getToday } from "@/lib/time-zone";
import { loadDate, shouldWarnAboutLoad } from "@/lib/training-load";
import { loadTrainingLoad } from "@/lib/training-load-data";

type Client = SupabaseClient<Database>;

type Athlete = { id: string; first_name: string; last_name: string };

async function warningRatio(supabase: Client, athleteId: string, today: string, threshold?: number) {
  const load = await loadTrainingLoad(supabase, athleteId, today, 4);
  return shouldWarnAboutLoad(load.acute, load.ratio, threshold) ? load.ratio : null;
}

async function notifyTrainingLoad(supabase: Client, athlete: Athlete, today: string, ratio: number) {
  try {
    const { data: latest, error } = await supabase.from("athlete_journal_entries").select("readiness")
      .eq("athlete_id", athlete.id).lte("entry_on", today).not("readiness", "is", null)
      .order("entry_on", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    const low = latest?.readiness != null && latest.readiness < LOW_READINESS;
    const monday = loadDate(today, (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7);
    await notify(supabase, {
      athleteId: athlete.id,
      kind: "high_training_load",
      title: `${athlete.first_name} ${athlete.last_name}: high training load${low ? " + low readiness" : ""}`,
      body: `The last 7 days were ${ratio.toFixed(2)}× the 28-day weekly average.${low ? ` Latest check-in readiness was low (${latest.readiness}/100).` : ""}`,
      link: `/athletes/${athlete.id}?tab=load`,
      dedupeKey: `training-load:${athlete.id}:${monday}${low ? ":low-readiness" : ""}`,
    });
  } catch (error) {
    console.error("Training load warning notification failed:", error);
  }
}

export async function checkTrainingLoad(supabase: Client, athleteId: string, asOf?: string) {
  try {
    const today = asOf ?? await getToday();
    const { data: athlete, error: athleteError } = await supabase.from("athletes")
      .select("id, first_name, last_name, coaches!athletes_coach_id_fkey(load_warning_ratio)").eq("id", athleteId).single();
    if (athleteError) throw athleteError;
    const ratio = await warningRatio(supabase, athleteId, today, athlete.coaches?.load_warning_ratio);
    if (ratio !== null) await notifyTrainingLoad(supabase, athlete, today, ratio);
  } catch (error) {
    console.error("Training load warning check failed:", error);
  }
}

export async function checkCoachTrainingLoad(supabase: Client, athletes: Athlete[], today: string, threshold: number) {
  const warnings = new Map<string, number>();
  for (let index = 0; index < athletes.length; index += 10) {
    await Promise.all(athletes.slice(index, index + 10).map(async (athlete) => {
      const ratio = await warningRatio(supabase, athlete.id, today, threshold);
      if (ratio === null) return;
      warnings.set(athlete.id, ratio);
      await notifyTrainingLoad(supabase, athlete, today, ratio);
    }));
  }
  return warnings;
}
