import type { SupabaseClient } from "@supabase/supabase-js";

import { MOVEMENT_DEMO_BUCKET, type MovementDemo, type MovementOption } from "@/lib/movement-guides";
import type { Database, Tables } from "@/lib/supabase/database.types";

export async function loadMovementDemoSource(supabase: SupabaseClient<Database>, id: string, coachId: string) {
  const [movement, guide] = await Promise.all([
    supabase.from("movements").select("*").eq("id", id).maybeSingle(),
    supabase.from("movement_guides").select("*").eq("movement_id", id).eq("coach_id", coachId).maybeSingle(),
  ]);
  if (movement.error || guide.error) throw new Error("Couldn't load the movement demo.");
  return movement.data ? { movement: movement.data, guide: guide.data } : null;
}

export function movementDemoValues(movement: Tables<"movements">, guide: Tables<"movement_guides"> | null) {
  return {
    cues: guide?.cues ?? movement.demo_cues,
    common_mistakes: guide?.common_mistakes ?? movement.demo_common_faults,
    easier_versions: guide?.easier_versions ?? [],
    harder_versions: guide?.harder_versions ?? [],
    easier_movement_id: guide?.easier_movement_id ?? movement.easier_movement_id,
    harder_movement_id: guide?.harder_movement_id ?? movement.harder_movement_id,
  };
}

export async function buildMovementDemo(
  supabase: SupabaseClient<Database>,
  { movement, guide }: NonNullable<Awaited<ReturnType<typeof loadMovementDemoSource>>>,
  options?: MovementOption[],
): Promise<MovementDemo> {
  const values = movementDemoValues(movement, guide);
  const ids = [values.easier_movement_id, values.harder_movement_id].filter((id): id is string => id !== null);
  const [library, clip] = await Promise.all([
    options ?? (ids.length ? supabase.from("movements").select("id, name").in("id", ids).then(({ data, error }) => {
      if (error) throw error;
      return data;
    }) : []),
    guide?.clip_path ? supabase.storage.from(MOVEMENT_DEMO_BUCKET).createSignedUrl(guide.clip_path, 3600) : null,
  ]);
  return {
    name: movement.name,
    videoUrl: guide?.video_url ?? movement.demo_video_url,
    clipUrl: clip?.data?.signedUrl ?? null,
    guide: values,
    easier: library.find(({ id }) => id === values.easier_movement_id) ?? null,
    harder: library.find(({ id }) => id === values.harder_movement_id) ?? null,
  };
}
