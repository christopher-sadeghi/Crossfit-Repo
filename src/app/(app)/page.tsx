import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";
import { getCoach } from "@/lib/coach";

export default async function DashboardPage() {
  const coach = await getCoach();
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
