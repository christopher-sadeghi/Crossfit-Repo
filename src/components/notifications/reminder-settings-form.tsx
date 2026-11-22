"use client";

import { useActionState, useState } from "react";

import { saveCheckInReminder } from "@/app/athlete/messages/reminder-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/lib/auth/form-state";

export function ReminderSettingsForm({ remindAt, timeZone }: { remindAt: string | null; timeZone: string | null }) {
  const [enabled, setEnabled] = useState(remindAt !== null);
  const [time, setTime] = useState(remindAt?.slice(0, 5) ?? "07:00");
  const [savedZone, setSavedZone] = useState(timeZone);
  const [state, action, pending] = useActionState<FormState, FormData>(async (previous, data) => {
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      data.set("time_zone", zone);
      const result = await saveCheckInReminder(previous, data);
      if (!result.error) setSavedZone(zone);
      return result;
    } catch {
      return { error: "Couldn't save your reminder. Please try again." };
    }
  }, {});

  return (
    <form action={action} className="grid max-w-md gap-4">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
        <input type="checkbox" role="switch" name="enabled" checked={enabled} disabled={pending}
          onChange={(event) => setEnabled(event.target.checked)} className="size-4 accent-primary" />
        Remind me to check in daily
      </label>
      <div className="grid gap-2">
        <Label htmlFor="check_in_reminder_time">Reminder time</Label>
        <Input id="check_in_reminder_time" name="remind_at" type="time" step={900} required={enabled}
          disabled={!enabled || pending} value={time} onChange={(event) => setTime(event.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground">{savedZone ? `Saved time zone: ${savedZone}` : "Uses your device time zone when saved."}</p>
      <p className="text-sm text-muted-foreground">You&apos;ll get a bell notification if you haven&apos;t checked in or skipped today. Push reminders also need phone notifications enabled.</p>
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      {state.message && <p role="status" className="text-sm text-muted-foreground">{state.message}</p>}
      <Button disabled={pending} className="w-fit">{pending ? "Saving…" : "Save check-in reminder"}</Button>
    </form>
  );
}
