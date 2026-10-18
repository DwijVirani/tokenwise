import { describe, expect, it } from "vitest";
import { type ChatModel, createMockModel, streamChat } from "../src/lib/ai";

async function drain(model: ChatModel, signal = new AbortController().signal) {
  const stream = streamChat({
    model,
    messages: [{ role: "user", content: "hi" }],
    maxOutputTokens: 100,
    abortSignal: signal,
  });
  const deltas: string[] = [];
  let next = await stream.next();
  while (!next.done) {
    deltas.push(next.value);
    next = await stream.next();
  }
  return { deltas, outcome: next.value };
}

describe("streamChat", () => {
  it("streams deltas and reports complete with provider usage", async () => {
    const { deltas, outcome } = await drain(createMockModel());
    expect(deltas.join("")).toBe("Hello, world!");
    expect(outcome).toMatchObject({ status: "complete", text: "Hello, world!" });
    expect(outcome.usage.outputTokens).toBe(4);
  });

  it("keeps partial text and reports error when the provider fails mid-stream", async () => {
    const { outcome } = await drain(
      createMockModel({ chunks: ["par", "tial", "x"], failAfterChunks: 2 }),
    );
    expect(outcome).toMatchObject({ status: "error", text: "partial" });
  });

  it("keeps partial text and reports stopped when aborted mid-stream", async () => {
    const ctrl = new AbortController();
    const model = createMockModel({ chunks: ["a", "b", "c", "d"], chunkDelayMs: 50 });
    const stream = streamChat({
      model,
      messages: [{ role: "user", content: "hi" }],
      maxOutputTokens: 100,
      abortSignal: ctrl.signal,
    });
    await stream.next();
    ctrl.abort();
    let next = await stream.next();
    while (!next.done) next = await stream.next();
    expect(next.value.status).toBe("stopped");
    expect(next.value.text.length).toBeLessThan(4);
  });
});
