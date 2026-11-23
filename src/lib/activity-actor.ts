import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export async function getActivityActor(athleteId: string) {
  if (!z.uuid().safeParse(athleteId).success) return null;
  const viewer = await getViewer();
  if (!viewer || viewer.kind === "none") return null;
  const supabase = await createClient();
  if (viewer.kind === "athlete") {
    if (viewer.athleteId !== athleteId) return null;
    const { data } = await supabase.from("athletes").select("id").eq("id", athleteId).eq("status", "active").maybeSingle();
    if (!data) return null;
    return { supabase, coachId: viewer.coachId, units: viewer.units };
  }
  const { data } = await supabase.from("athletes").select("id").eq("id", athleteId).eq("coach_id", viewer.gymId).maybeSingle();
  return data ? { supabase, coachId: viewer.gymId, units: viewer.units } : null;
}
