import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { getCoach } from "@/lib/coach";
import { createClient } from "@/lib/supabase/server";

import { DemoDataCard } from "./demo-data-card";

import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const coach = await getCoach();
  const supabase = await createClient();
  const { count } = await supabase
    .from("athletes")
    .select("id", { count: "exact", head: true });

  return (
    <>
      <PageHeader title="Settings" description={coach?.email} />
      <Card>
        <CardContent className="pt-6">
          <SettingsForm
            fullName={coach?.fullName ?? ""}
            gymName={coach?.gymName ?? ""}
            units={coach?.units ?? "lb"}
            driftDays={coach?.driftDays ?? 5}
          />
        </CardContent>
      </Card>
      <div className="mt-6">
        <DemoDataCard hasAthletes={(count ?? 0) > 0} />
      </div>
    </>
  );
}
