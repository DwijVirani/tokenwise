"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiRequestError, streamChat } from "@/lib/api-client";
import { ErrorState } from "./error-state";
import { MessageInput } from "./message-input";
import { MessageList, type ChatMessage } from "./message-list";

export function ChatView({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiRequestError && e.code === "UNAUTHENTICATED") return router.push("/login");
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof ApiRequestError ? e.message : "Something went wrong.");
    },
    [router],
  );

  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    setError(null);
    api<ChatMessage[]>(`/conversations/${conversationId}/messages`)
      .then((rows) => !cancelled && setMessages(rows))
      .catch((e) => !cancelled && handleError(e));
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [conversationId, handleError]);

  async function send(text: string) {
    setError(null);
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const assistantId = `pending-${crypto.randomUUID()}`;
    setMessages((m) => [
      ...m,
      { id: `local-${crypto.randomUUID()}`, role: "user", content: text, status: "complete" },
      { id: assistantId, role: "assistant", content: "", status: "streaming" },
    ]);
    const patch = (fn: (m: ChatMessage) => ChatMessage) =>
      setMessages((all) => all.map((m) => (m.id === assistantId ? fn(m) : m)));

    try {
      for await (const event of streamChat(conversationId, text, controller.signal)) {
        if (event.type === "delta") patch((m) => ({ ...m, content: m.content + event.text }));
        else patch((m) => ({ ...m, status: event.status }));
      }
    } catch (e) {
      if (controller.signal.aborted) patch((m) => ({ ...m, status: "stopped" }));
      else patch((m) => ({ ...m, status: "error" }));
      handleError(e);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex-1 overflow-y-auto">
        <MessageList messages={messages} />
      </div>
      {error && <ErrorState message={error} />}
      <MessageInput streaming={streaming} onSend={send} onStop={() => abortRef.current?.abort()} />
    </div>
  );
}
