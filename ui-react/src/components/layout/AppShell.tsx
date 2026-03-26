import { BellIcon, MonitorIcon } from "lucide-react";
import { useLocation } from "react-router";
import { Outlet } from "react-router";
import { ConnectionBanner } from "@/components/gateway/ConnectionBanner";
import { AppSidebar } from "@/components/layout/Sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useGateway } from "@/hooks/useGateway";
import { TAB_PATHS } from "@/types/gateway";

/** Map path → readable breadcrumb label */
const PATH_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(TAB_PATHS).map(([tab, path]) => [
    path,
    (tab as string).charAt(0).toUpperCase() + (tab as string).slice(1),
  ]),
);

function TopNav() {
  const location = useLocation();
  const currentLabel =
    Object.entries(PATH_LABELS).find(
      ([path]) => location.pathname === path || location.pathname.startsWith(path + "/"),
    )?.[1] ?? "New Session";

  return (
    <header
      className="flex h-16 shrink-0 items-center justify-between border-b px-4 bg-white"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Left: sidebar toggle + breadcrumb */}
      <div className="flex items-center gap-3">
        <SidebarTrigger className="-ml-1" />
        <div className="flex items-center gap-1.5 text-sm">
          <span className="font-semibold text-primary">Workspace</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-foreground">{currentLabel}</span>
        </div>
      </div>

      {/* Right: action icons + avatar */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Cast"
        >
          <MonitorIcon className="size-4" />
        </button>
        <button
          type="button"
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Notifications"
        >
          <BellIcon className="size-4" />
        </button>
        <Avatar className="size-8 ml-1 cursor-pointer">
          <AvatarFallback className="text-xs bg-primary text-primary-foreground">
            U
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}

/**
 * Root layout: initialises the Gateway WebSocket connection and renders
 * the shadcn sidebar + main content area (sidebar-08 inset pattern).
 */
export function AppShell() {
  // Mount the gateway connection for the lifetime of the app
  useGateway();

  return (
    <div className="h-screen w-screen overflow-hidden flex">
      <SidebarProvider className="h-full w-full overflow-hidden">
        <AppSidebar />
        <SidebarInset className="flex h-full min-h-0 flex-col overflow-hidden">
          <ConnectionBanner />
          <TopNav />
          <main className="flex-1 min-h-0 overflow-auto bg-white">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
