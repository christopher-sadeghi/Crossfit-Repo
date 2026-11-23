"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { type FormState } from "@/lib/auth/form-state";

import { publishWaiver } from "./waiver-actions";

export function WaiverForm({ body, hasPublishedWaiver }: { body: string; hasPublishedWaiver: boolean }) {
  const [state, action, pending] = useActionState(publishWaiver, {} as FormState);

  return <form action={action} className="grid gap-3">
    <label className="grid gap-2 text-sm font-medium">
      Waiver text
      <Textarea name="body" required minLength={50} maxLength={20_000} rows={14} defaultValue={state.values?.body ?? body} />
    </label>
    {hasPublishedWaiver && <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name="requires_resign" />
      Ask everyone to sign again
    </label>}
    {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    {state.message && <p role="status" className="text-sm text-muted-foreground">{state.message}</p>}
    <Button type="submit" disabled={pending}>{pending ? "Publishing…" : "Publish waiver"}</Button>
  </form>;
}
