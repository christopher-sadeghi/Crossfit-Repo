"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { ActivityForm } from "@/components/activity-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AssistantCard } from "@/lib/ai/assistant-schema";
import type { Units } from "@/lib/units";
import { sendAssistantCoachMessage } from "./actions";
import type { AssistantCardIdentity } from "@/lib/ai/assistant-card-actions";

export function DraftCard({ card, athleteId, today, units, disabled, identity, completed }: { card: AssistantCard; athleteId: string; today: string; units: Units; disabled: boolean; identity: AssistantCardIdentity; completed?: { action: string } }) {
  if (completed) return <p role="status" className="rounded-lg border p-4 text-sm">
    {completed.action === "sent" ? "Sent to your coach. " : "Saved. "}
    <Link href={completed.action === "sent" ? "/athlete/messages" : "/athlete/history"} className="underline">View {completed.action === "sent" ? "messages" : "history"}</Link>
  </p>;
  return <div className="min-w-0 rounded-lg border bg-background p-4">
    {card.kind === "coach_message" ? <CoachDraft card={card} disabled={disabled} identity={identity} />
      : card.kind === "adjust_wod" ? <div className="grid gap-2 text-sm">
        <p>Review today&apos;s workout adjustment in the existing form. Nothing has been changed.</p>
        <Link href={`/athlete#adjust-${card.workoutId}`} className="font-medium underline underline-offset-4">Open today&apos;s adjustment form</Link>
      </div> : <div className="grid gap-3">
        <h3 className="text-sm font-semibold">Activity draft</h3>
        <p className="text-xs text-muted-foreground">Review or edit these fields, then confirm to save. Missing measurements are left blank.</p>
        <fieldset disabled={disabled} className="min-w-0"><ActivityForm athleteId={athleteId} today={today} units={units} initialDraft={card.draft} assistantCard={identity} /></fieldset>
      </div>}
  </div>;
}

function CoachDraft({ card, disabled, identity }: { card: Extract<AssistantCard, { kind: "coach_message" }>; disabled: boolean; identity: AssistantCardIdentity }) {
  const [body, setBody] = useState(card.body);
  const [result, setResult] = useState<{ error?: string; warning?: string; sentId?: string }>({});
  const [pending, start] = useTransition();
  const id = useId();
  if (result.sentId) return <div className="grid gap-2 text-sm">
    <p role="status">Sent. <Link href="/athlete/messages" className="underline">View messages</Link></p>
    {result.warning && <p role="status" className="text-muted-foreground">{result.warning}</p>}
  </div>;
  return <form className="grid gap-3" onSubmit={(event) => {
    event.preventDefault();
    start(async () => {
      try { setResult(await sendAssistantCoachMessage({ ...card, body }, identity)); }
      catch { setResult({ error: "Couldn't send your message. Please try again." }); }
    });
  }}>
    <Label htmlFor={id}>Message draft to your coach</Label>
    <Textarea id={id} value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} required disabled={pending || disabled} />
    {card.change && <div className="text-sm"><p>{card.change.note}</p><p className="text-muted-foreground">Your coach will get a change request to approve.</p></div>}
    {result.error && <p role="alert" className="text-sm text-destructive">{result.error}</p>}
    <Button type="submit" className="w-fit" disabled={pending || disabled || !body.trim()}>{pending ? "Sending…" : "Send to coach"}</Button>
  </form>;
}
