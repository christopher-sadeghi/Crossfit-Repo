import { PageHeader } from "@/components/layout/page-header";

import { AthleteForm } from "../athlete-form";

export default function NewAthletePage() {
  return (
    <>
      <PageHeader title="Add athlete" />
      <AthleteForm />
    </>
  );
}
