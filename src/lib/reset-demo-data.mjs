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

    const photoError = await removeProgressPhotos(supabase, coachId);
    if (photoError) return { data: null, error: photoError, clipError: null };
    const videoError = await removeFormVideos(supabase, coachId);
    if (videoError) return { data: null, error: videoError, clipError: null };

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

/**
 * @param {import("@supabase/supabase-js").SupabaseClient<import("./supabase/database.types").Database>} supabase
 * @param {string} coachId
 */
export function removeProgressPhotos(supabase, coachId) {
  return removeCoachFiles(supabase, coachId, "progress-photos", "progress_photos");
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient<import("./supabase/database.types").Database>} supabase
 * @param {string} coachId
 */
export function removeFormVideos(supabase, coachId) {
  return removeCoachFiles(supabase, coachId, "form-videos", "form_reviews");
}

/**
 * Files first, then rows: database cascades never remove Storage objects.
 * @param {import("@supabase/supabase-js").SupabaseClient<import("./supabase/database.types").Database>} supabase
 * @param {string} coachId
 * @param {"progress-photos" | "form-videos"} bucketId
 * @param {"progress_photos" | "form_reviews"} table
 */
async function removeCoachFiles(supabase, coachId, bucketId, table) {
  const bucket = supabase.storage.from(bucketId);
  /** @type {string[]} */
  const prefixes = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data: folders, error } = await bucket.list(coachId, {
      limit: PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" },
    });
    if (error) return error;
    for (const folder of folders) {
      prefixes.push(`${coachId}/${folder.name}`);
    }
    if (folders.length < PAGE_SIZE) break;
  }
  /** @type {string[]} */
  const paths = [];
  for (const prefix of prefixes) {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data: files, error: listError } = await bucket.list(prefix, {
        limit: PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" },
      });
      if (listError) return listError;
      paths.push(...files.map((file) => `${prefix}/${file.name}`));
      if (files.length < PAGE_SIZE) break;
    }
  }
  for (let offset = 0; offset < paths.length; offset += PAGE_SIZE) {
    const { error } = await bucket.remove(paths.slice(offset, offset + PAGE_SIZE));
    if (error) return error;
  }
  const { error } = await supabase.from(table).delete().eq("coach_id", coachId);
  return error;
}
