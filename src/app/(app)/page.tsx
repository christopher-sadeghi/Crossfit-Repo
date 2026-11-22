import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";
import { getCoach } from "@/lib/coach";
import { checkDriftingAthletes, checkMissedWorkouts } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const coach = await getCoach();
  if (coach) {
    const supabase = await createClient();
    await Promise.all([checkMissedWorkouts(supabase, coach), checkDriftingAthletes(supabase, coach)]);
  }
  const firstName = coach?.fullName.split(" ")[0];

  return (
    <>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        description="Today's workouts, pending AI suggestions and athletes who need attention."
      />
      <ComingSoon ticket="15 (Dashboard)" />
    </>
  );
}
