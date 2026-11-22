import { ConsistencySummary } from "@/components/consistency-summary";
import { loadConsistency } from "@/lib/consistency-data";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/time-zone";

export async function AthleteConsistencyCard({ athleteId, compact = false }: { athleteId: string; compact?: boolean }) {
  const supabase = await createClient();
  const { stats } = await loadConsistency(supabase, athleteId, await getToday());
  return <ConsistencySummary stats={stats} compact={compact} />;
}
