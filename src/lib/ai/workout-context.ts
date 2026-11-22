import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/lib/supabase/database.types";
import type { Units } from "@/lib/units";

export const workoutLibraryEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  measure: z.string(),
  easier_movement_id: z.string().uuid().nullish(),
  harder_movement_id: z.string().uuid().nullish(),
});

export async function loadWorkoutMovementLibrary(supabase: SupabaseClient<Database>) {
  const [movements, guides] = await Promise.all([
    supabase.from("movements").select("id, name, category, measure, easier_movement_id, harder_movement_id").order("name"),
    supabase.from("movement_guides").select("movement_id, easier_movement_id, harder_movement_id")
      .or("easier_movement_id.not.is.null,harder_movement_id.not.is.null"),
  ]);
  if (movements.error) throw movements.error;
  if (guides.error) throw guides.error;
  const overrides = new Map(guides.data.map((guide) => [guide.movement_id, guide]));
  const ids = new Set(movements.data.map(({ id }) => id));
  return movements.data.map((movement) => {
    const override = overrides.get(movement.id);
    const easier = override?.easier_movement_id ?? movement.easier_movement_id;
    const harder = override?.harder_movement_id ?? movement.harder_movement_id;
    return {
      ...movement,
      easier_movement_id: easier && ids.has(easier) ? easier : null,
      harder_movement_id: harder && ids.has(harder) ? harder : null,
    };
  });
}

export function ageOn(birthDate: string, asOf: string) {
  const birth = new Date(`${birthDate}T00:00:00Z`);
  const date = new Date(`${asOf}T00:00:00Z`);
  let age = date.getUTCFullYear() - birth.getUTCFullYear();
  if (
    date.getUTCMonth() < birth.getUTCMonth() ||
    (date.getUTCMonth() === birth.getUTCMonth() && date.getUTCDate() < birth.getUTCDate())
  )
    age -= 1;
  return age;
}

export async function loadWorkoutContext(supabase: SupabaseClient<Database>) {
  const [{ data: coach, error: coachError }, library] = await Promise.all([
    supabase.from("coaches").select("units").maybeSingle(),
    loadWorkoutMovementLibrary(supabase),
  ]);
  if (coachError || !coach) throw coachError ?? new Error("Coach not found.");

  return { units: coach.units as Units, library };
}
