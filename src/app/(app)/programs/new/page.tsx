import { PageHeader } from "@/components/layout/page-header";

import { ProgramForm } from "../program-form";

export default function NewProgramPage() {
  return (
    <>
      <PageHeader title="New program" description="Set the length now; you'll place WODs on the calendar next." />
      <ProgramForm />
    </>
  );
}
