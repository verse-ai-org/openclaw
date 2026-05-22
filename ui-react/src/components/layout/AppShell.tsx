import { BellIcon, RefreshCwIcon, UserIcon } from "lucide-react";
import { Outlet, useLocation } from "react-router";
import { GatewayStatusIndicator } from "@/components/gateway/GatewayStatusIndicator";
import { GatewayRestartingOverlay } from "@/components/gateway/GatewayRestartingOverlay";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { UpdateNavAction } from "@/components/layout/UpdateNavAction";
import { AppSidebar } from "@/components/layout/Sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useGateway } from "@/hooks/gateway";
import { tabLabel } from "@/lib/tabs";
import { TAB_PATHS, type Tab } from "@/types/gateway";
import {
  isMacOSElectron,
  macOSTitleBarControlsPaddingInlineStartStyle,
} from "@/utils/electron-env";

/** Map path → readable breadcrumb label (same labels as sidebar). */
const PATH_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(TAB_PATHS).map(([tab, path]) => [path, tabLabel(tab as Tab)]),
);

function TopNav() {
  const location = useLocation();
  const { state, isMobile, openMobile } = useSidebar();
  // macOS Electron: when the inset sidebar is off-screen, reserve inline-start space for traffic lights (env + fallback; see `titleBarOverlay` in Electron main).
  const reserveTitleBarControlsInset =
    isMacOSElectron() && (isMobile ? !openMobile : state === "collapsed");
  const currentLabel =
    Object.entries(PATH_LABELS).find(
      ([path]) => location.pathname === path || location.pathname.startsWith(path + "/"),
    )?.[1] ?? "New Session";

  return (
    <header
      className="flex h-12 shrink-0 items-center justify-between border-b px-4"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Left: sidebar toggle + breadcrumb */}
      <div
        className="flex items-center gap-3 transition-[padding-inline-start] duration-300 ease-in-out"
        style={
          {
            WebkitAppRegion: "no-drag",
            ...macOSTitleBarControlsPaddingInlineStartStyle(reserveTitleBarControlsInset),
          } as React.CSSProperties
        }
      >
        <SidebarTrigger className="z-50" />
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-foreground">{currentLabel}</span>
        </div>
      </div>

      {/* Right: action icons + avatar */}
      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <UpdateNavAction />
        <button
          type="button"
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Refresh page"
          onClick={() => window.location.reload()}
        >
          <RefreshCwIcon className="size-4" />
        </button>
        <ThemeToggle />
        <button
          type="button"
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Notifications"
        >
          <BellIcon className="size-4" />
        </button>
        <GatewayStatusIndicator />
        <Avatar className="size-8 ml-1 cursor-pointer">
          <AvatarFallback className="text-xs">
            <UserIcon className="size-4" />
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
        <SidebarInset className="flex h-full m-0! min-h-0 flex-col overflow-hidden dark:bg-background/60 rounded-r-none!">
          <TopNav />
          <main className="flex-1 m-0! min-h-0 overflow-auto">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
      {/* Global overlay: shown while Gateway intentionally restarts */}
      <GatewayRestartingOverlay />
    </div>
  );
}
