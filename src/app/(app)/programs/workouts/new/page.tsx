import { PageHeader } from "@/components/layout/page-header";

import { loadBuilderData } from "../load-builder-data";
import { WodBuilder } from "../wod-builder";

export default async function NewWorkoutPage() {
  const { units, movementOptions } = await loadBuilderData();
  return (
    <>
      <PageHeader title="New WOD" />
      <WodBuilder units={units} movementOptions={movementOptions} />
    </>
  );
}
