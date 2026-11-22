"use client";

import { Bot, Loader2, Send, Trash2, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { clearChat, loadChat, sendChatMessage, type ChatMessage } from "@/app/(app)/assistant/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChatContext } from "@/lib/ai/chat";

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
      <Button onClick={() => setOpen(true)} className="fixed right-6 bottom-6 z-40 gap-2 rounded-full shadow-lg" size="lg">
        <Bot className="size-5" />
        Ask AI coach
      </Button>
    );

  return (
    <aside
      aria-label="AI coach chat"
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l bg-background shadow-xl"
    >
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <Bot className="size-5" />
        <div className="flex-1">
          <h2 className="font-semibold">AI coach</h2>
          <p className="text-xs text-muted-foreground">
            {label ? `Asking about ${label}. ` : ""}Changes wait for your approval.
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={clear} disabled={pending || !messages?.length} aria-label="Clear chat">
          <Trash2 className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close chat">
          <X className="size-4" />
        </Button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : messages.length === 0 ? (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>Ask about your athletes and programming. I only use your real data and your movement library.</p>
            <p>If I suggest changes, they go to AI Suggestions for you to approve. Nothing changes until you do.</p>
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
            <div key={message.id} className={message.role === "user" ? "flex justify-end" : ""}>
              <div
                className={
                  message.role === "user"
                    ? "max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground"
                    : "space-y-2 text-sm"
                }
              >
                <div className="whitespace-pre-wrap">{message.content.replaceAll("**", "")}</div>
                {message.suggestions.length > 0 && (
                  <ul className="space-y-2">
                    {message.suggestions.map((s) => (
                      <li key={s.id}>
                        <Link
                          href={`/suggestions/${s.id}`}
                          className="flex items-center justify-between gap-2 rounded-lg border p-2 hover:bg-muted"
                        >
                          <span>
                            <span className="block font-medium">{s.title ?? s.label}</span>
                            <span className="block text-xs text-muted-foreground">
                              {[s.label, s.detail].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                          <Badge variant={s.status === "pending" ? "secondary" : "outline"}>
                            {s.status === "pending" ? "Review" : s.status}
                          </Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
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
      </div>

      <form
        className="flex items-end gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
          }}
          placeholder={label ? `Ask about ${label}…` : "Ask about your athletes or programming…"}
          maxLength={2000}
          rows={2}
          className="max-h-40 resize-none"
          aria-label="Message"
        />
        <Button type="submit" size="icon" disabled={pending || !draft.trim()} aria-label="Send">
          <Send className="size-4" />
        </Button>
      </form>
    </aside>
  );
}
