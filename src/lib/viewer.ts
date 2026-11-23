import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { Units } from "@/lib/units";

export type CoachViewer = {
  kind: "coach";
  id: string;
  gymId: string;
  role: "owner" | "coach";
  email: string;
  fullName: string;
  gymName: string;
  units: Units;
};

export type AthleteViewer = {
  kind: "athlete";
  athleteId: string;
  coachId: string;
  firstName: string;
  units: Units;
};

export type Viewer = CoachViewer | AthleteViewer | { kind: "none" } | null;

export const getViewer = cache(async (): Promise<Viewer> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const userId = claims?.sub;
  if (typeof userId !== "string" || !claims) return null;

  const email = (claims.email as string | undefined) ?? "";
  const { data: coach } = await supabase
    .from("coaches")
    .select("id, gym_id, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (coach) {
    const { data: owner } = await supabase
      .from("coaches")
      .select("gym_name, units")
      .eq("id", coach.gym_id)
      .maybeSingle();
    return {
      kind: "coach",
      id: coach.id,
      gymId: coach.gym_id,
      role: coach.gym_id === coach.id ? "owner" : "coach",
      email,
      fullName: coach.full_name ?? "",
      gymName: owner?.gym_name ?? "",
      units: owner?.units ?? "lb",
    };
  }

  const { data: athlete } = await supabase
    .from("athletes")
    .select("id, coach_id, first_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (!athlete) return { kind: "none" };

  const { data: coachProfile } = await supabase
    .from("coaches")
    .select("units")
    .eq("id", athlete.coach_id)
    .maybeSingle();

  return {
    kind: "athlete",
    athleteId: athlete.id,
    coachId: athlete.coach_id,
    firstName: athlete.first_name,
    units: coachProfile?.units ?? "lb",
  };
});
