import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import type { Units } from "@/lib/units";

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
  const [{ data: coach, error: coachError }, { data: library, error: libraryError }] = await Promise.all([
    supabase.from("coaches").select("units").maybeSingle(),
    supabase.from("movements").select("id, name, category, measure").order("name"),
  ]);
  if (coachError || !coach) throw coachError ?? new Error("Coach not found.");
  if (libraryError) throw libraryError;

  return { units: coach.units as Units, library: library ?? [] };
}
