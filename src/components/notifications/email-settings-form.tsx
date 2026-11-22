"use client";

import { useActionState, useState } from "react";

import { saveNotificationSettings } from "@/app/notification-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function EmailSettingsForm({ emailEnabled, frequency }: { emailEnabled: boolean; frequency: "instant" | "daily" }) {
  const [state, action, pending] = useActionState(saveNotificationSettings, {});
  const [enabled, setEnabled] = useState(emailEnabled);
  const [selection, setSelection] = useState(frequency);

  return (
    <form action={action} className="grid max-w-md gap-4">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
        <input type="checkbox" role="switch" name="email_enabled" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="size-4 accent-primary" />
        Email me about notifications
      </label>
      <div className="grid gap-2">
        <Label htmlFor="email_frequency">Email frequency</Label>
        <select id="email_frequency" name="email_frequency" value={selection} onChange={(event) => setSelection(event.target.value as "instant" | "daily")} className="h-10 rounded-md border bg-background px-3 text-sm">
          <option value="instant">Instant alerts</option>
          <option value="daily">Daily digest</option>
        </select>
      </div>
      <p className="text-sm text-muted-foreground">Email delivery isn&apos;t switched on for this demo yet — your choice is saved for when it is.</p>
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      {state.message && <p role="status" className="text-sm text-muted-foreground">{state.message}</p>}
      <Button type="submit" disabled={pending} className="w-fit">{pending ? "Saving…" : "Save notification preferences"}</Button>
    </form>
  );
}
