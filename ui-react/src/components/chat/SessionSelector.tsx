// SessionSelector is no longer used as a standalone component.
// Session management logic lives in useSessionManager (hooks/useSessionManager.ts).
// The ChatSidebar component renders the session list using that hook.
// This file is kept for backwards compatibility only.

export type { SessionEntry } from "@/hooks/useSessionManager";
export { useSessionManager } from "@/hooks/useSessionManager";
