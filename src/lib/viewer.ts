import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { Units } from "@/lib/units";

export type CoachViewer = {
  kind: "coach";
  id: string;
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
    .select("id, full_name, gym_name, units")
    .eq("id", userId)
    .maybeSingle();

  if (coach) {
    return {
      kind: "coach",
      id: coach.id,
      email,
      fullName: coach.full_name ?? "",
      gymName: coach.gym_name ?? "",
      units: coach.units,
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
