import { type Db, conversations, messages } from "@tokenwise/db";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { ChatMessage, ChatOutcome } from "../lib/ai";

export const MAX_MESSAGE_CHARS = 8000;
const HISTORY_WINDOW = 40;

export function createChatService(db: Db) {
  return {
    // Persists the user message and a streaming assistant row, and returns the
    // history to send to the model. Null when the conversation is not the user's.
    async start(userId: string, conversationId: string, content: string, model: string) {
      return db.transaction(async (tx) => {
        const [conv] = await tx
          .update(conversations)
          .set({ updatedAt: new Date() })
          .where(
            and(
              eq(conversations.id, conversationId),
              eq(conversations.userId, userId),
              isNull(conversations.deletedAt),
            ),
          )
          .returning({ id: conversations.id });
        if (!conv) return null;

        const history = await tx
          .select({ role: messages.role, content: messages.content })
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, conversationId),
              inArray(messages.role, ["user", "assistant"]),
              inArray(messages.status, ["complete", "stopped"]),
            ),
          )
          .orderBy(asc(messages.createdAt));

        await tx.insert(messages).values({ conversationId, role: "user", content });
        const [assistant] = await tx
          .insert(messages)
          .values({ conversationId, role: "assistant", status: "streaming", model })
          .returning({ id: messages.id });

        const prior: ChatMessage[] = history
          .filter((m) => m.content.length > 0)
          .map((m) => ({ role: m.role as ChatMessage["role"], content: m.content }));
        return {
          assistantMessageId: assistant!.id,
          messages: [...prior.slice(-HISTORY_WINDOW), { role: "user" as const, content }],
        };
      });
    },

    async finish(assistantMessageId: string, outcome: ChatOutcome) {
      await db
        .update(messages)
        .set({ content: outcome.text, status: outcome.status })
        .where(eq(messages.id, assistantMessageId));
    },
  };
}
