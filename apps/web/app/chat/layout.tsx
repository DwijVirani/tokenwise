import type { ReactNode } from "react";
import { ConversationSidebar } from "@/components/chat/conversation-sidebar";

export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen">
      <ConversationSidebar />
      <main className="flex-1">{children}</main>
    </div>
  );
}
