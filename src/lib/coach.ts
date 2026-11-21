import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/** The logged-in coach's profile, fetched once per request. */
export const getCoach = cache(async () => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return null;

  const { data: coach } = await supabase
    .from("coaches")
    .select("id, full_name, gym_name, units")
    .eq("id", userId)
    .maybeSingle();

  return {
    id: userId,
    email: (claims.claims.email as string | undefined) ?? "",
    fullName: coach?.full_name ?? "",
    gymName: coach?.gym_name ?? "",
    units: coach?.units ?? "lb",
  };
});
