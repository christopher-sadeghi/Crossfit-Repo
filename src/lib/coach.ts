import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { DEFAULT_LOAD_WARNING_RATIO } from "@/lib/training-load";

/** The logged-in coach's profile, fetched once per request. */
export const getCoach = cache(async () => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return null;

  const { data: coach } = await supabase
    .from("coaches")
    .select("id, gym_id, full_name")
    .eq("id", userId)
    .maybeSingle();
  if (!coach) return null;
  const { data: owner } = await supabase
    .from("coaches")
    .select("gym_name, units, drift_days, load_warning_ratio")
    .eq("id", coach.gym_id)
    .maybeSingle();

  return {
    id: userId,
    gymId: coach.gym_id,
    role: coach.gym_id === coach.id ? "owner" as const : "coach" as const,
    email: (claims.claims.email as string | undefined) ?? "",
    fullName: coach?.full_name ?? "",
    gymName: owner?.gym_name ?? "",
    units: owner?.units ?? "lb",
    driftDays: owner?.drift_days ?? 5,
    loadWarningRatio: owner?.load_warning_ratio ?? DEFAULT_LOAD_WARNING_RATIO,
  };
});
