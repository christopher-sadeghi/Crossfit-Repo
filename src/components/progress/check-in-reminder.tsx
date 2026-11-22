"use client";

import { saveProgressReminder } from "@/app/progress-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { ActionFeedback, useProgressAction } from "./action-feedback";

export function CheckInReminder({ athleteId, cadence }: { athleteId: string; cadence: number | null }) {
  const { result, pending, run } = useProgressAction();
  return <Card>
    <CardHeader><CardTitle>Check-in reminder</CardTitle><p className="text-sm text-muted-foreground">Set a comfortable rhythm for photos and measurements.</p></CardHeader>
    <CardContent className="space-y-3">
      <form className="flex flex-wrap gap-2" onSubmit={(event) => {
        event.preventDefault();
        const selected = String(new FormData(event.currentTarget).get("cadence"));
        run(() => saveProgressReminder(athleteId, selected));
      }}>
        <select key={cadence ?? "off"} name="cadence" aria-label="Check-in reminder frequency" defaultValue={cadence ?? "off"} className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm" disabled={pending}>
          <option value="off">Off</option><option value="2">Every 2 weeks</option><option value="4">Every 4 weeks</option>
        </select>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save setting"}</Button>
      </form>
      <p className="text-xs text-muted-foreground">Preference only for now. Automatic reminders are not enabled yet.</p>
      <ActionFeedback result={result} />
    </CardContent>
  </Card>;
}
