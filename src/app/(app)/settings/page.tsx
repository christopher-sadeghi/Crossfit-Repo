import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { NotificationSettings } from "@/components/notifications/email-settings";
import { PushSettings } from "@/components/notifications/push-settings";
import { Card, CardContent } from "@/components/ui/card";
import { getCoach } from "@/lib/coach";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_LOAD_WARNING_RATIO } from "@/lib/training-load";

import { DemoDataCard } from "./demo-data-card";
import { DemoDataSection } from "./demo-data-section";

import { SettingsForm } from "./settings-form";
import { AssistantSettings } from "./assistant-settings";
import { CoachesCard } from "./coaches-card";
import { PaymentsCard } from "./payments-card";
import { WaiverCard } from "./waiver-card";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ stripe?: string }> }) {
  const { stripe } = await searchParams;
  const coach = await getCoach();
  const supabase = await createClient();
  const { count } = coach?.role === "owner" ? await supabase
    .from("athletes")
    .select("id", { count: "exact", head: true }) : { count: null };

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
            loadWarningRatio={coach?.loadWarningRatio ?? DEFAULT_LOAD_WARNING_RATIO}
            role={coach?.role ?? "coach"}
          />
        </CardContent>
      </Card>
      <CoachesCard />
      <PaymentsCard stripeReturn={stripe} />
      <WaiverCard />
      <AssistantSettings />
      <div className="mt-6"><NotificationSettings /></div>
      <div className="mt-6"><PushSettings role="coach" /></div>
      <Card className="mt-6">
        <CardContent>
          <Link href="/settings/ai-history" className="font-medium underline underline-offset-4">AI history</Link>
          <p className="mt-1 text-sm text-muted-foreground">View pending, decided and failed AI suggestions.</p>
        </CardContent>
      </Card>
      {coach?.role === "owner" && <DemoDataSection>
        <DemoDataCard hasAthletes={(count ?? 0) > 0} />
      </DemoDataSection>}
    </>
  );
}
