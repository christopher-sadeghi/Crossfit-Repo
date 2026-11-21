import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";

import { ProgramsNav } from "./programs-nav";

export default function Page() {
  return (
    <>
      <PageHeader title="Programs" description="Build WODs, plan programs and assign them to athletes." />
      <ProgramsNav active="/programs" />
      <ComingSoon ticket="7 (Programs, calendar and assignments)" />
    </>
  );
}
