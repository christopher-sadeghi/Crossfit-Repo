"use client";

import { Loader2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { loadAssistantMessages } from "@/app/athlete/assistant/actions";
import { DraftCard } from "@/app/athlete/assistant/draft-card";
import { useAssistant, type ChatEntry } from "@/app/athlete/assistant/use-assistant";
import { AssistantText } from "@/components/assistant-text";
import { Button } from "@/components/ui/button";
import { assistantCardEntries, assistantMessageId } from "@/lib/ai/assistant-ui";
import type { Units } from "@/lib/units";

import { ChatBubble, ChatComposer, ChatLauncher, ChatPanelShell } from "./chat-panel";

const EXAMPLES = [
  "How should I pace today's workout?",
  "I'm sore today. What should I do for recovery?",
];

function AthleteChatSession({
  initialMessages,
  athleteId,
  today,
  units,
  input,
  setInput,
  panelVisible,
  onClose,
}: {
  initialMessages: ChatEntry[];
  athleteId: string;
  today: string;
  units: Units;
  input: string;
  setInput: (value: string) => void;
  panelVisible: boolean;
  onClose: () => void;
}) {
  const { messages, pending, error, send } = useAssistant(initialMessages);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (panelVisible) end.current?.scrollIntoView({ block: "nearest" });
  }, [messages, pending, panelVisible]);

  function submit(message: string) {
    const trimmed = message.trim();
    if (!trimmed || pending) return;
    setInput("");
    void send(trimmed);
  }

  return (
    <ChatPanelShell
      ariaLabel="AI assistant chat"
      title="AI assistant"
      subtitle="Your coach can see this chat. It can't change your programming."
      onClose={onClose}
      className={panelVisible ? "z-50 max-w-none md:max-w-md" : "hidden"}
      footer={
        <ChatComposer
          value={input}
          onChange={setInput}
          onSend={() => submit(input)}
          disabled={pending}
          inputDisabled={pending}
          placeholder="Ask your question…"
        />
      }
    >
      {!messages.length ? (
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>Ask about your training, recovery, or how to talk to your coach.</p>
          <div className="flex flex-col items-start gap-2">
            {EXAMPLES.map((example) => (
              <Button
                key={example}
                type="button"
                variant="outline"
                size="sm"
                className="h-auto text-left whitespace-normal"
                onClick={() => submit(example)}
              >
                {example}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        messages.map((message) => (
          <ChatBubble key={message.id} role={message.role}>
            {message.role === "assistant" ? (
              <AssistantText text={message.content} />
            ) : (
              <p className="break-words">{message.content}</p>
            )}
            <div className="grid gap-3">
              {assistantCardEntries(message.metadata).map(({ card, index }) => (
                <DraftCard
                  key={index}
                  card={card}
                  athleteId={athleteId}
                  today={today}
                  units={units}
                  disabled={pending}
                  identity={{ assistantMessageId: assistantMessageId(message.metadata, message.id), cardIndex: index }}
                  completed={message.actions?.find((action) => action.card_index === index)}
                />
              ))}
            </div>
          </ChatBubble>
        ))
      )}
      {pending && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Thinking…
        </p>
      )}
      {error && <p role="alert" className="rounded-lg border border-destructive/40 p-2 text-sm text-destructive">{error}</p>}
      <div ref={end} />
    </ChatPanelShell>
  );
}

export function AthleteChat({ athleteId, today, units }: { athleteId: string; today: string; units: Units }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const loadStarted = useRef(false);
  const hiddenRoute = pathname === "/athlete/onboarding"
    || pathname.startsWith("/athlete/onboarding/")
    || pathname === "/athlete/workout"
    || pathname.startsWith("/athlete/workout/");
  const panelVisible = open && !hiddenRoute;

  useEffect(() => {
    function openChat(event: Event) {
      const detail = (event as CustomEvent<{ draft?: string }>).detail;
      setOpen(true);
      if (typeof detail?.draft === "string") setInput(detail.draft);
    }
    window.addEventListener("open-athlete-chat", openChat);
    return () => window.removeEventListener("open-athlete-chat", openChat);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("assistant") !== "open") return;
    setOpen(true);
    url.searchParams.delete("assistant");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [pathname]);

  useEffect(() => {
    if (!panelVisible || messages !== null || loadStarted.current) return;
    loadStarted.current = true;
    setLoading(true);
    setHistoryError(null);
    void loadAssistantMessages()
      .then((result) => {
        if ("error" in result) setHistoryError(result.error);
        else setMessages(result.messages);
      })
      .catch(() => setHistoryError("Couldn't load your conversation. Please refresh to try again."))
      .finally(() => setLoading(false));
  }, [panelVisible, messages]);

  function close() {
    setOpen(false);
    if (messages === null && historyError) {
      loadStarted.current = false;
      setHistoryError(null);
    }
  }

  return (
    <>
      {!open && !hiddenRoute && (
        <ChatLauncher
          label="Ask AI"
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 md:right-6 md:bottom-6"
        />
      )}
      {messages !== null ? (
        <AthleteChatSession
          initialMessages={messages}
          athleteId={athleteId}
          today={today}
          units={units}
          input={input}
          setInput={setInput}
          panelVisible={panelVisible}
          onClose={close}
        />
      ) : (
        <ChatPanelShell
          ariaLabel="AI assistant chat"
          title="AI assistant"
          subtitle="Your coach can see this chat. It can't change your programming."
          onClose={close}
          className={panelVisible ? "z-50 max-w-none md:max-w-md" : "hidden"}
          footer={null}
        >
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : historyError ? (
            <p role="alert" className="rounded-lg border border-destructive/40 p-2 text-sm text-destructive">{historyError}</p>
          ) : null}
        </ChatPanelShell>
      )}
    </>
  );
}
