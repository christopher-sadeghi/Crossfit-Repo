import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export async function progressAccess(athleteId: string) {
  if (!z.uuid().safeParse(athleteId).success) throw new Error("Choose a valid athlete.");
  const viewer = await getViewer();
  if (!viewer || viewer.kind === "none") throw new Error("Please log in again.");
  if (viewer.kind === "athlete" && viewer.athleteId !== athleteId) throw new Error("You can't access this athlete.");
  const supabase = await createClient();
  const { data: athlete, error } = await supabase.from("athletes").select("id, coach_id, status").eq("id", athleteId).maybeSingle();
  if (error || !athlete || (viewer.kind === "coach" ? athlete.coach_id !== viewer.id : athlete.coach_id !== viewer.coachId || athlete.status !== "active")) {
    throw new Error("You can't access this athlete.");
  }
  return { supabase, viewer, athlete };
}
