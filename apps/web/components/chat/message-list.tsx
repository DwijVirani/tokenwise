export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  status: "streaming" | "complete" | "stopped" | "error";
};

// Model output is rendered as text only, never as HTML.
export function MessageList({ messages }: { messages: ChatMessage[] }) {
  return (
    <ul className="flex flex-col gap-4">
      {messages
        .filter((m) => m.role !== "system")
        .map((m) => (
          <li key={m.id} className={m.role === "user" ? "self-end" : "self-start"}>
            <div
              className={`max-w-prose whitespace-pre-wrap rounded-lg px-3 py-2 ${
                m.role === "user" ? "bg-neutral-900 text-white" : "bg-neutral-100"
              }`}
            >
              {m.content || (m.status === "streaming" ? "…" : "")}
            </div>
            {m.status === "stopped" && <p className="mt-1 text-xs text-neutral-500">Stopped</p>}
            {m.status === "error" && (
              <p className="mt-1 text-xs text-red-600">Response failed. Partial output shown.</p>
            )}
          </li>
        ))}
    </ul>
  );
}
