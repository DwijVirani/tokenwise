import { apiErrorSchema } from "@tokenwise/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export class ApiRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function toError(res: Response): Promise<ApiRequestError> {
  const parsed = apiErrorSchema.safeParse(await res.json().catch(() => null));
  return parsed.success
    ? new ApiRequestError(parsed.data.error.code, parsed.data.error.message, res.status)
    : new ApiRequestError("INTERNAL", "Something went wrong.", res.status);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
  });
  if (!res.ok) throw await toError(res);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export type ChatEvent =
  | { type: "delta"; text: string }
  | { type: "done"; status: "complete" | "stopped" | "error"; messageId: string };

// POST /chat and yield its SSE events. Aborting `signal` stops generation server-side.
export async function* streamChat(
  conversationId: string,
  message: string,
  signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const res = await fetch(`${API_URL}/chat`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ conversationId, message }),
    signal,
  });
  if (!res.ok || !res.body) throw await toError(res);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += value;
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      if (frame.startsWith("data: ")) yield JSON.parse(frame.slice(6)) as ChatEvent;
    }
  }
}
