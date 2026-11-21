import { getCoach } from "@/lib/coach";
import { createClient } from "@/lib/supabase/server";

export async function loadBuilderData() {
  const supabase = await createClient();
  const [coach, { data: movements }] = await Promise.all([
    getCoach(),
    supabase.from("movements").select("id, name, category").order("name"),
  ]);
  return { units: coach?.units ?? "lb", movementOptions: movements ?? [] };
}
