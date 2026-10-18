"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, ApiRequestError } from "@/lib/api-client";

type Conversation = { id: string; title: string | null };

export function ConversationSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [items, setItems] = useState<Conversation[]>([]);

  const load = useCallback(async () => {
    try {
      setItems(await api<Conversation[]>("/conversations"));
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === "UNAUTHENTICATED") router.push("/login");
    }
  }, [router]);

  // Reload on navigation so new chats and their titles show up.
  useEffect(() => {
    void load();
  }, [load, pathname]);

  async function create() {
    const created = await api<Conversation>("/conversations", { method: "POST", body: "{}" });
    router.push(`/chat/${created.id}`);
  }

  async function rename(c: Conversation) {
    const title = window.prompt("Rename conversation", c.title ?? "")?.trim();
    if (!title) return;
    await api(`/conversations/${c.id}`, { method: "PATCH", body: JSON.stringify({ title }) });
    await load();
  }

  async function remove(c: Conversation) {
    if (!window.confirm("Delete this conversation?")) return;
    await api(`/conversations/${c.id}`, { method: "DELETE" });
    if (pathname === `/chat/${c.id}`) router.push("/chat");
    await load();
  }

  return (
    <nav aria-label="Conversations" className="flex h-full w-64 flex-col gap-2 border-r p-3">
      <button onClick={create} className="rounded bg-neutral-900 px-3 py-2 text-white">
        New chat
      </button>
      <ul className="flex flex-col gap-1 overflow-y-auto">
        {items.map((c) => (
          <li key={c.id} className="group flex items-center gap-1">
            <Link
              href={`/chat/${c.id}`}
              className={`flex-1 truncate rounded px-2 py-1 ${
                pathname === `/chat/${c.id}` ? "bg-neutral-200" : "hover:bg-neutral-100"
              }`}
            >
              {c.title ?? "New chat"}
            </Link>
            <button onClick={() => rename(c)} aria-label="Rename" className="px-1 text-xs text-neutral-500">
              Edit
            </button>
            <button onClick={() => remove(c)} aria-label="Delete" className="px-1 text-xs text-neutral-500">
              Del
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
