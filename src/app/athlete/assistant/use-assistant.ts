"use client";

import { DefaultChatTransport, readUIMessageStream } from "ai";
import { useEffect, useRef, useState } from "react";

export type ChatEntry = {
  id: string;
  role: "user" | "assistant";
  content: string;
  metadata: unknown;
  actions?: { card_index: number; action: string; ref_id: string }[];
  applied?: { card_index: number; applied_at: string }[];
};

export function useAssistant(initialMessages: ChatEntry[]) {
  const [messages, setMessages] = useState(initialMessages);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function send(message: string) {
    if (controller.current || !message.trim()) return;
    const abort = new AbortController();
    controller.current = abort;
    setPending(true);
    setError("");
    const id = crypto.randomUUID();
    const replyId = crypto.randomUUID();
    setMessages((current) => [...current, { id, role: "user", content: message, metadata: null }]);
    try {
      const transport = new DefaultChatTransport({
        api: "/api/athlete-assistant",
        prepareSendMessagesRequest: () => ({ body: { message } }),
        fetch: async (url, init) => {
          const response = await fetch(url, init);
          if (!response.ok) {
            const body = await response.json().catch(() => null);
            throw new Error(typeof body?.error === "string" ? body.error : "AI couldn't answer right now. Please try again.");
          }
          return response;
        },
      });
      const stream = await transport.sendMessages({ trigger: "submit-message", chatId: "athlete-assistant", messageId: undefined, messages: [], abortSignal: abort.signal });
      for await (const reply of readUIMessageStream({ stream, terminateOnError: true })) {
        const entry: ChatEntry = { id: replyId, role: "assistant", metadata: reply.metadata,
          content: reply.parts.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n\n") };
        setMessages((current) => current.some((item) => item.id === replyId)
          ? current.map((item) => item.id === replyId ? entry : item) : [...current, entry]);
      }
    } catch (reason) {
      if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : "AI couldn't answer right now. Please try again.");
    } finally {
      controller.current = null;
      setPending(false);
    }
  }
  return { messages, pending, error, send };
}
