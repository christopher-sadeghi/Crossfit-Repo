import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

import { ReminderSettingsForm } from "./reminder-settings-form";

export async function ReminderSettings() {
  const viewer = await getViewer();
  if (viewer?.kind !== "athlete") return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("check_in_reminders")
    .select("remind_at, time_zone").eq("athlete_id", viewer.athleteId).maybeSingle();
  return (
    <Card>
      <CardHeader><CardTitle>Daily check-in reminder</CardTitle></CardHeader>
      <CardContent>
        {error ? <p role="alert" className="text-sm text-destructive">Couldn&apos;t load your reminder. Please reload to try again.</p>
          : <ReminderSettingsForm remindAt={data?.remind_at ?? null} timeZone={data?.time_zone ?? null} />}
      </CardContent>
    </Card>
  );
}
