import { type LanguageModel, simulateReadableStream, streamText } from "ai";
import { MockLanguageModelV4 } from "ai/test";

// The only module that imports the AI SDK (AGENTS.md invariant 8).

export type ChatModel = LanguageModel;
export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ChatUsage = { inputTokens: number | undefined; outputTokens: number | undefined };
export type ChatOutcome = {
  status: "complete" | "stopped" | "error";
  text: string;
  usage: ChatUsage;
};

// Yields text deltas as they arrive and returns the final outcome. Provider
// errors and aborts end the stream with a status instead of throwing, so the
// caller can always persist the partial text.
export async function* streamChat(opts: {
  model: ChatModel;
  messages: ChatMessage[];
  maxOutputTokens: number;
  abortSignal: AbortSignal;
}): AsyncGenerator<string, ChatOutcome> {
  const result = streamText({
    model: opts.model,
    messages: opts.messages,
    maxOutputTokens: opts.maxOutputTokens,
    abortSignal: opts.abortSignal,
    onError: () => {}, // errors are handled via the "error" part below
  });

  let text = "";
  let status: ChatOutcome["status"] = "complete";
  let usage: ChatUsage = { inputTokens: undefined, outputTokens: undefined };
  try {
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        text += part.text;
        yield part.text;
      } else if (part.type === "finish") {
        usage = part.totalUsage;
      } else if (part.type === "abort") {
        status = "stopped";
      } else if (part.type === "error") {
        status = opts.abortSignal.aborted ? "stopped" : "error";
      }
    }
  } catch {
    status = opts.abortSignal.aborted ? "stopped" : "error";
  }
  return { status, text, usage };
}

// Deterministic stand-in for the provider. The real Anthropic model is wired in
// with quota reservation (SPEC milestone 3); until then no real model call can happen.
export function createMockModel(
  opts: { chunks?: string[]; chunkDelayMs?: number; failAfterChunks?: number } = {},
): ChatModel {
  const chunks = opts.chunks ?? ["Hello", ", ", "world", "!"];
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunkDelayInMs: opts.chunkDelayMs ?? 0,
        chunks: [
          { type: "text-start", id: "t" },
          ...chunks.slice(0, opts.failAfterChunks ?? chunks.length).map((delta) => ({
            type: "text-delta" as const,
            id: "t",
            delta,
          })),
          ...(opts.failAfterChunks === undefined
            ? [
                { type: "text-end" as const, id: "t" },
                {
                  type: "finish" as const,
                  finishReason: { unified: "stop" as const, raw: undefined },
                  usage: {
                    inputTokens: { total: 3, noCache: 3, cacheRead: undefined, cacheWrite: undefined },
                    outputTokens: { total: chunks.length, text: chunks.length, reasoning: undefined },
                  },
                },
              ]
            : [{ type: "error" as const, error: new Error("mock provider failure") }]),
        ],
      }),
    }),
  });
}
