import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";

export default function Page() {
  return (
    <>
      <PageHeader title="Nutrition" description="Macro targets and daily food logs." />
      <ComingSoon ticket="9 (Nutrition)" />
    </>
  );
}
