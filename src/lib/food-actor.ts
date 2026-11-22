import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getViewer } from "@/lib/viewer";

export async function actor(athleteId: string) {
  const viewer = await getViewer();
  if (!z.string().uuid().safeParse(athleteId).success) return null;
  if (viewer?.kind === "coach") return { athleteId, coachId: viewer.id, isAthlete: false };
  if (viewer?.kind === "athlete" && viewer.athleteId === athleteId) return { athleteId, coachId: viewer.coachId, isAthlete: true };
  return null;
}

export function revalidateFood(athleteId: string, suggestionId?: string) {
  revalidatePath(`/nutrition/${athleteId}`);
  revalidatePath("/nutrition");
  revalidatePath(`/athletes/${athleteId}`);
  revalidatePath("/athlete/nutrition");
  revalidatePath("/settings/ai-history");
  if (suggestionId) revalidatePath(`/suggestions/${suggestionId}`);
}
