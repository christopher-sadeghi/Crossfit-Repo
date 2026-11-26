"use client";

import { Loader2, Trash2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { clearChat, loadChat, sendChatMessage, type ChatMessage } from "@/app/(app)/assistant/actions";
import { InlineSuggestionCard } from "@/components/suggestions/inline-suggestion-card";
import { Button } from "@/components/ui/button";
import type { ChatContext } from "@/lib/ai/chat";
import { ChatBubble, ChatComposer, ChatLauncher, ChatPanelShell } from "./chat-panel";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

function contextFromPath(pathname: string): { context: ChatContext; label: string | null } {
  const athlete = pathname.match(new RegExp(`^/athletes/(${UUID})`, "i"));
  if (athlete) return { context: { athleteId: athlete[1] }, label: "this athlete" };
  const program = pathname.match(new RegExp(`^/programs/(${UUID})`, "i"));
  if (program) return { context: { programId: program[1] }, label: "this program" };
  return { context: {}, label: null };
}

const EXAMPLES = ["Who is overtraining this week?", "Plan this athlete's next 2 weeks around their injuries and goals."];

export function CoachChat() {
  const pathname = usePathname();
  const { context, label } = contextFromPath(pathname);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function openChat(event: Event) {
      const detail = (event as CustomEvent<{ draft?: string }>).detail;
      setOpen(true);
      if (typeof detail?.draft === "string") setDraft(detail.draft);
    }
    window.addEventListener("open-coach-chat", openChat);
    return () => window.removeEventListener("open-coach-chat", openChat);
  }, []);

  useEffect(() => {
    if (!open || messages) return;
    loadChat()
      .then(setMessages)
      .catch(() => {
        setMessages([]);
        setError("Could not load your chat history.");
      });
  }, [open, messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pending, open]);

  function send(text: string) {
    const message = text.trim();
    if (!message || pending) return;
    setError(null);
    setDraft("");
    const id = crypto.randomUUID();
    setMessages((m) => [...(m ?? []), { id, role: "user", content: message, suggestions: [] }]);
    startTransition(async () => {
      const result = await sendChatMessage(message, context).catch(() => ({
        error: "The AI coach couldn't answer right now. Please try again in a minute.",
      }));
      if ("error" in result) {
        setError(result.error);
        setDraft(message);
        setMessages((m) => (m ?? []).filter((msg) => msg.id !== id));
        return;
      }
      setMessages((m) => [...(m ?? []), result.reply]);
    });
  }

  function clear() {
    if (!confirm("Clear your chat history?")) return;
    startTransition(async () => {
      const result = await clearChat();
      if (result.error) setError(result.error);
      else setMessages([]);
    });
  }

  if (!open)
    return (
      <ChatLauncher
        label="Ask AI coach"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 md:right-6 md:bottom-6"
      />
    );

  return (
    <ChatPanelShell
      ariaLabel="AI coach chat"
      title="AI coach"
      subtitle={`${label ? `Asking about ${label}. ` : ""}Changes wait for your approval.`}
      actions={
        <Button variant="ghost" size="icon" onClick={clear} disabled={pending || !messages?.length} aria-label="Clear chat">
          <Trash2 className="size-4" />
        </Button>
      }
      onClose={() => setOpen(false)}
      footer={
        <ChatComposer
          value={draft}
          onChange={setDraft}
          onSend={() => send(draft)}
          disabled={pending}
          placeholder={label ? `Ask about ${label}…` : "Ask about your athletes or programming…"}
        />
      }
    >
        {messages === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : messages.length === 0 ? (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>Ask about your athletes and programming. I only use your real data and your movement library.</p>
            <p>If I suggest changes, you can review and approve them right here. Nothing changes until you do.</p>
            <div className="flex flex-col items-start gap-2">
              {EXAMPLES.map((example) => (
                <Button key={example} variant="outline" size="sm" className="h-auto text-left whitespace-normal" onClick={() => send(example)}>
                  {example}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <ChatBubble key={message.id} role={message.role}>
              <div className="whitespace-pre-wrap">{message.content.replaceAll("**", "")}</div>
              {message.suggestions.length > 0 && (
                <ul className="space-y-2">
                  {message.suggestions.map((s) => (
                    <li key={s.id}>
                      <InlineSuggestionCard id={s.id} suggestion={s} onOpenReview={() => { setOpen(false); setMessages(null); }} />
                    </li>
                  ))}
                </ul>
              )}
            </ChatBubble>
          ))
        )}
        {pending && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Thinking… this can take up to a minute.
          </p>
        )}
        {error && <p className="rounded-lg border border-destructive/40 p-2 text-sm text-destructive">{error}</p>}
        <div ref={endRef} />
    </ChatPanelShell>
  );
}
