import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

export async function loadWorkoutLibrary(supabase: SupabaseClient<Database>, excludeProgramId?: string) {
  const { data, error } = await supabase
    .from("workouts")
    .select("id, title, program_id, programs(name)")
    .is("athlete_id", null)
    .order("title");

  if (error) throw error;

  return (data ?? [])
    .filter((workout) => workout.program_id !== excludeProgramId)
    .map((workout) => ({
      id: workout.id,
      title: workout.program_id && workout.programs
        ? `${workout.title} · ${workout.programs.name}`
        : workout.title,
    }));
}
