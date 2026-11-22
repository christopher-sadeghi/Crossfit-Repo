import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

import { EmailSettingsForm } from "./email-settings-form";

export async function NotificationSettings() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (typeof userId !== "string") return null;
  const { data, error } = await supabase.from("notification_settings").select("email_enabled, email_frequency").eq("user_id", userId).maybeSingle();

  return (
    <Card>
      <CardHeader><CardTitle>Notifications</CardTitle></CardHeader>
      <CardContent>
        {error ? <p role="alert" className="text-sm text-destructive">Couldn&apos;t load notification preferences. Please reload to try again.</p> : <EmailSettingsForm emailEnabled={data?.email_enabled ?? false} frequency={data?.email_frequency === "instant" ? "instant" : "daily"} />}
      </CardContent>
    </Card>
  );
}
