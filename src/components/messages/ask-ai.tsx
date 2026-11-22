"use client";

import { useActionState } from "react";

import { askAthleteMessageAI, sendAthleteAIDraft, type AskAthleteAIState } from "@/app/(app)/messages/[athleteId]/ask-ai-action";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

function ReplyDraft({ athleteId, messageId, draft }: { athleteId: string; messageId: string; draft: string }) {
  const [state, action, pending] = useActionState(sendAthleteAIDraft.bind(null, athleteId), {});
  if (state.sentId) return <p role="status" className="text-sm text-muted-foreground">Reply sent.</p>;
  return (
    <form action={action} className="grid gap-2 rounded-lg border bg-card p-3">
      <label htmlFor={`ai-reply-${messageId}`} className="text-sm font-medium">AI reply draft · Only you can see this</label>
      <Textarea id={`ai-reply-${messageId}`} name="body" defaultValue={draft} maxLength={2000} required rows={4} />
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      <Button disabled={pending} className="justify-self-start">{pending ? "Sending…" : "Send reply"}</Button>
    </form>
  );
}

export function AskAI({ athleteId, messageId }: { athleteId: string; messageId: string }) {
  const [state, action, pending] = useActionState(async () => askAthleteMessageAI(athleteId, messageId), {} as AskAthleteAIState);
  return (
    <div className="grid gap-2">
      <form action={action}>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>{pending ? "Asking AI…" : "Ask AI"}</Button>
      </form>
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      {state.drafted && <p role="status" className="text-sm text-muted-foreground">Suggestion ready to review. Nothing has changed yet.</p>}
      {state.draft && !pending && <ReplyDraft athleteId={athleteId} messageId={messageId} draft={state.draft} />}
    </div>
  );
}
