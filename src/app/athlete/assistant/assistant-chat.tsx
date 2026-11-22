"use client";

import { useEffect, useRef, useState } from "react";
import { AssistantText } from "@/components/assistant-text";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { assistantCards } from "@/lib/ai/assistant-ui";
import type { Units } from "@/lib/units";
import { DraftCard } from "./draft-card";
import { useAssistant, type ChatEntry } from "./use-assistant";

export function AssistantChat({ initialMessages, athleteId, today, units }: { initialMessages: ChatEntry[]; athleteId: string; today: string; units: Units }) {
  const { messages, pending, error, send } = useAssistant(initialMessages);
  const [input, setInput] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages, pending]);
  return <div className="grid min-w-0 gap-4">
    <ol aria-label="AI conversation" className="grid gap-4">
      {!messages.length && <li className="rounded-lg border p-4 text-sm text-muted-foreground">Ask about your training, recovery, or how to talk to your coach.</li>}
      {messages.map((message) => <li key={message.id} className={`min-w-0 rounded-lg border p-4 ${message.role === "user" ? "ml-6 bg-muted" : "mr-2 bg-card"}`}>
        <p className="mb-2 text-xs font-semibold text-muted-foreground">{message.role === "user" ? "You" : "AI assistant"}</p>
        {message.role === "assistant" ? <AssistantText text={message.content} /> : <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>}
        <div className="mt-3 grid gap-3">{assistantCards(message.metadata).map((card, index) =>
          <DraftCard key={index} card={card} athleteId={athleteId} today={today} units={units} disabled={pending} />)}</div>
      </li>)}
    </ol>
    {pending && <p role="status" className="text-sm text-muted-foreground">AI is replying…</p>}
    {error && <p role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive">{error}</p>}
    <div ref={end} />
    <form className="grid gap-2 rounded-lg border bg-card p-4" onSubmit={(event) => {
      event.preventDefault();
      const message = input.trim();
      if (!message || pending) return;
      setInput("");
      void send(message);
    }}>
      <Label htmlFor="assistant-message">Ask your question</Label>
      <Textarea id="assistant-message" value={input} onChange={(event) => setInput(event.target.value)} maxLength={2000}
        placeholder="How should I pace today's workout?" disabled={pending} required />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{input.length}/2000 characters</span>
        <Button type="submit" disabled={pending || !input.trim()}>{pending ? "Replying…" : "Ask AI"}</Button>
      </div>
    </form>
  </div>;
}
