import { MessageSquareIcon, PlusIcon, BotIcon } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useSessionManager } from "@/hooks/useSessionManager";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway.store";

export function ChatSidebar() {
  const { sessions, loading, sessionKey, switchSession, newSession } = useSessionManager();
  const gatewayStatus = useGatewayStore((s) => s.status);
  const isConnected = gatewayStatus === "connected";

  return (
    <Sidebar variant="inset">
      {/* Header: brand */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <div className="flex items-center gap-2 cursor-default select-none">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <BotIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">OpenClaw</span>
                  <span
                    className={cn(
                      "truncate text-xs",
                      isConnected ? "text-emerald-500" : "text-muted-foreground",
                    )}
                  >
                    {isConnected ? "Connected" : "Disconnected"}
                  </span>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* Sessions list */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Sessions</SidebarGroupLabel>
          <SidebarGroupAction
            title="New session"
            onClick={() => void newSession()}
            disabled={!isConnected}
          >
            <PlusIcon className="size-4" />
            <span className="sr-only">New session</span>
          </SidebarGroupAction>

          <SidebarGroupContent>
            <SidebarMenu>
              {loading && sessions.length === 0 && (
                <SidebarMenuItem>
                  <SidebarMenuButton disabled className="text-muted-foreground">
                    Loading…
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {!loading && sessions.length === 0 && (
                <SidebarMenuItem>
                  <SidebarMenuButton disabled className="text-muted-foreground text-xs">
                    No sessions
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {sessions.map((s) => {
                const isActive = s.key === sessionKey;
                return (
                  <SidebarMenuItem key={s.key}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => void switchSession(s.key)}
                      className="gap-2"
                      tooltip={s.label ?? s.key}
                    >
                      <MessageSquareIcon className="size-4 shrink-0" />
                      <span className="truncate">{s.label ?? s.key}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer: gateway status indicator */}
      <SidebarFooter>
        <div className="px-2 py-1.5 text-xs text-muted-foreground flex items-center gap-1.5">
          <span
            className={cn(
              "size-1.5 rounded-full shrink-0",
              isConnected ? "bg-emerald-500" : "bg-muted-foreground/50",
            )}
          />
          <span>{isConnected ? "Gateway connected" : "Gateway offline"}</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
