"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { ActivityForm } from "@/components/activity-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AssistantCard } from "@/lib/ai/assistant-schema";
import type { Units } from "@/lib/units";
import { applyAssistantAccountChange, sendAssistantCoachMessage } from "./actions";
import type { AssistantCardIdentity } from "@/lib/ai/assistant-card-actions";
import { accountChangeSummaryLines } from "@/lib/ai/account-change";

export function DraftCard({ card, athleteId, today, units, disabled, identity, completed }: { card: AssistantCard; athleteId: string; today: string; units: Units; disabled: boolean; identity: AssistantCardIdentity; completed?: { action: string } }) {
  if (card.kind === "account_change") return <AccountChangeCard card={card} identity={identity} units={units} disabled={disabled} completed={completed} />;
  if (completed) return <p role="status" className="rounded-lg border p-4 text-sm">
    {completed.action === "sent" ? <>Sent to your coach. <Link href="/athlete/messages" className="underline">View messages</Link></> : <>Saved. <Link href="/athlete/history" className="underline">View history</Link></>}
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

function AccountChangeCard({
  card, identity, units, disabled, completed,
}: {
  card: Extract<AssistantCard, { kind: "account_change" }>;
  identity: AssistantCardIdentity;
  units: Units;
  disabled: boolean;
  completed?: { action: string };
}) {
  const [result, setResult] = useState<{ error?: string; saved?: boolean; cancelled?: boolean }>({});
  const [pending, start] = useTransition();
  if (completed || result.saved) return <p role="status" className="rounded-lg border p-4 text-sm">Saved.</p>;
  if (result.cancelled) return <p role="status" className="rounded-lg border p-4 text-sm">Cancelled.</p>;
  return <div className="grid gap-3 rounded-lg border bg-background p-4">
    <h3 className="text-sm font-semibold">Proposed account change</h3>
    <ul className="grid gap-2 text-sm">
      {accountChangeSummaryLines(card.change, card.before, units).map((line, index) => (
        <li key={index}><span className="font-medium">{line.label}: </span>{line.before} → {line.after}</li>
      ))}
    </ul>
    {result.error && <p role="alert" className="text-sm text-destructive">{result.error}</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" disabled={disabled || pending} onClick={() => start(async () => {
        try { setResult(await applyAssistantAccountChange(identity.assistantMessageId, identity.cardIndex)); }
        catch { setResult({ error: "Couldn't save this change. Please try again." }); }
      })}>{pending ? "Saving…" : "Confirm"}</Button>
      <Button type="button" variant="outline" disabled={disabled || pending} onClick={() => setResult({ cancelled: true })}>Cancel</Button>
    </div>
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
