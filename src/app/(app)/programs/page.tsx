import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";

export default function Page() {
  return (
    <>
      <PageHeader title="Programs" description="Build WODs, plan programs and assign them to athletes." />
      <ComingSoon ticket="6–7 (WOD builder and programs)" />
    </>
  );
}
