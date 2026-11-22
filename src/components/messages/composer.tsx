"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { sendMessage } from "@/app/messages-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { LinkOption } from "@/lib/messages";

export function MessageComposer({ athleteId, options, initialLink = "" }: { athleteId: string; options: LinkOption[]; initialLink?: string }) {
  const [state, action, pending] = useActionState(sendMessage.bind(null, athleteId), {});
  const [body, setBody] = useState("");
  const [link, setLink] = useState(initialLink);
  const router = useRouter();
  useEffect(() => {
    if (!state.sentId) return;
    setBody("");
    setLink("");
    router.refresh();
  }, [state.sentId, router]);

  return (
    <form action={action} className="grid gap-3 rounded-lg border bg-background p-4">
      <label htmlFor="message-body" className="text-sm font-medium">Message</label>
      <Textarea id="message-body" name="body" value={body} onChange={(event) => setBody(event.target.value)} required minLength={1} maxLength={2000} rows={3} placeholder="Write a message…" aria-describedby="message-help" />
      <p id="message-help" className="text-xs text-muted-foreground">Up to 2,000 characters. For urgent concerns, contact your coach or athlete directly.</p>
      <label htmlFor="message-link" className="text-sm font-medium">Link to (optional)</label>
      <select id="message-link" name="link" value={link} onChange={(event) => setLink(event.target.value)} className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm">
        <option value="">No linked item</option>
        {(["workout", "result", "suggestion"] as const).map((type) => (
          <optgroup key={type} label={type === "workout" ? "Scheduled WODs" : type === "result" ? "Recent results" : "AI suggestions"}>
            {options.filter((option) => option.type === type).map((option) => <option key={`${type}:${option.id}`} value={`${type}:${option.id}`}>{option.label}</option>)}
          </optgroup>
        ))}
      </select>
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      {state.sentId && !state.error && <p role="status" className="text-sm text-muted-foreground">Message sent.</p>}
      <Button type="submit" disabled={pending} className="justify-self-end">{pending ? "Sending…" : "Send message"}</Button>
    </form>
  );
}
