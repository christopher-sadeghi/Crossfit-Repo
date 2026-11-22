const PAGE_SIZE = 100;

/**
 * @param {import("@supabase/supabase-js").SupabaseClient<import("./supabase/database.types").Database>} supabase
 * @param {boolean} reset
 */
export async function loadDemoDataWithClipCleanup(supabase, reset) {
  /** @type {string[]} */
  const paths = [];
  if (reset) {
    const { data: auth } = await supabase.auth.getClaims();
    const coachId = auth?.claims?.sub;
    if (!coachId) return { data: null, error: { message: "You must be logged in." }, clipError: null };

    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data: guides, error } = await supabase.from("movement_guides")
        .select("clip_path, movement:movements!movement_guides_movement_id_fkey!inner(coach_id)")
        .eq("coach_id", coachId)
        .eq("movement.coach_id", coachId)
        .not("clip_path", "is", null)
        .order("movement_id")
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) return { data: null, error, clipError: null };
      for (const { clip_path } of guides) {
        if (clip_path) paths.push(clip_path);
      }
      if (guides.length < PAGE_SIZE) break;
    }
  }

  const { data, error } = await supabase.rpc("load_demo_data", { reset });
  if (error) return { data, error, clipError: null };

  let clipError = null;
  for (let offset = 0; offset < paths.length; offset += PAGE_SIZE) {
    const { error } = await supabase.storage.from("movement-demos").remove(paths.slice(offset, offset + PAGE_SIZE));
    clipError ??= error;
  }
  return { data, error: null, clipError };
}
