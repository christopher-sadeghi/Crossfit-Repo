import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";

export default function Page() {
  return (
    <>
      <PageHeader title="Athletes" description="Your roster, profiles, injuries and history." />
      <ComingSoon ticket="5 (Athlete roster)" />
    </>
  );
}
