import { type Db, conversations } from "@tokenwise/db";
import { and, desc, eq, isNull } from "drizzle-orm";

// Every query is scoped by userId (AGENTS.md invariant 5); a foreign or deleted
// id is indistinguishable from a missing one.
const owned = (userId: string, id: string) =>
  and(eq(conversations.id, id), eq(conversations.userId, userId), isNull(conversations.deletedAt));

export function createConversationsService(db: Db) {
  return {
    async create(userId: string, title?: string) {
      const [row] = await db
        .insert(conversations)
        .values({ userId, title: title ?? null })
        .returning();
      return row!;
    },

    list(userId: string) {
      return db
        .select()
        .from(conversations)
        .where(and(eq(conversations.userId, userId), isNull(conversations.deletedAt)))
        .orderBy(desc(conversations.updatedAt));
    },

    async rename(userId: string, id: string, title: string) {
      const [row] = await db
        .update(conversations)
        .set({ title })
        .where(owned(userId, id))
        .returning();
      return row ?? null;
    },

    // Soft delete: the retention job removes rows later; ledger rows are untouched.
    async remove(userId: string, id: string) {
      const rows = await db
        .update(conversations)
        .set({ deletedAt: new Date() })
        .where(owned(userId, id))
        .returning({ id: conversations.id });
      return rows.length > 0;
    },
  };
}
