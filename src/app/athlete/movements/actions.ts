"use server";

import { z } from "zod";

import { buildMovementDemo, loadMovementDemoSource } from "@/lib/movement-demos";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export async function getAthleteMovementDemo(id: string) {
  const viewer = await getViewer();
  if (viewer?.kind !== "athlete" || !z.string().uuid().safeParse(id).success) return null;
  const supabase = await createClient();
  const source = await loadMovementDemoSource(supabase, id, viewer.coachId);
  return source ? buildMovementDemo(supabase, source) : null;
}
