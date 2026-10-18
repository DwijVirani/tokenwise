import { apiError, ERROR_HTTP_STATUS } from "@tokenwise/shared";
import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import { type ChatModel, streamChat } from "../lib/ai";
import { createChatService, MAX_MESSAGE_CHARS } from "../services/chat";

const body = z.object({
  conversationId: z.uuid(),
  message: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
});

// shortcut: fixed Free-plan cap, replace with plan resolution in milestone 3.
const MAX_OUTPUT_TOKENS = 1024;

export function chatRoutes(
  requireUser: preHandlerAsyncHookHandler,
  service: ReturnType<typeof createChatService>,
  model: ChatModel,
) {
  return async (app: FastifyInstance) => {
    app.post("/chat", { preHandler: requireUser }, async (request, reply) => {
      const { conversationId, message } = body.parse(request.body);
      const started = await service.start(request.user!.id, conversationId, message, "mock");
      if (!started) {
        return reply
          .code(ERROR_HTTP_STATUS.NOT_FOUND)
          .send(apiError("NOT_FOUND", "Conversation not found."));
      }

      // Client disconnect or stop aborts the provider request (invariant 7).
      const abort = new AbortController();
      reply.raw.on("close", () => {
        if (!reply.raw.writableFinished) abort.abort();
      });

      reply.hijack();
      reply.raw.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "x-request-id": request.id,
      });
      const send = (event: unknown) => {
        if (!reply.raw.destroyed) reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      const stream = streamChat({
        model,
        messages: started.messages,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        abortSignal: abort.signal,
      });
      let next = await stream.next();
      while (!next.done) {
        send({ type: "delta", text: next.value });
        next = await stream.next();
      }
      const outcome = next.value;

      // Persist even when the client is gone: partial output is kept (FR-C3, FR-C4).
      await service.finish(started.assistantMessageId, outcome);
      send({ type: "done", status: outcome.status, messageId: started.assistantMessageId });
      reply.raw.end();
    });
  };
}
