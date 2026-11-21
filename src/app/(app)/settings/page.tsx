import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { getCoach } from "@/lib/coach";

import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const coach = await getCoach();

  return (
    <>
      <PageHeader title="Settings" description={coach?.email} />
      <Card>
        <CardContent className="pt-6">
          <SettingsForm
            fullName={coach?.fullName ?? ""}
            gymName={coach?.gymName ?? ""}
            units={coach?.units ?? "lb"}
          />
        </CardContent>
      </Card>
    </>
  );
}
