"use client";

import { useState, type FormEvent } from "react";

const MAX_CHARS = 8000;

export function MessageInput({
  streaming,
  onSend,
  onStop,
}: {
  streaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) submit(e);
        }}
        maxLength={MAX_CHARS}
        rows={2}
        placeholder="Send a message"
        aria-label="Message"
        className="flex-1 resize-none rounded border px-3 py-2"
      />
      {streaming ? (
        <button type="button" onClick={onStop} className="rounded border px-4 py-2">
          Stop
        </button>
      ) : (
        <button disabled={!text.trim()} className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50">
          Send
        </button>
      )}
    </form>
  );
}
