import { Outlet } from "react-router";
import { ConnectionBanner } from "@/components/gateway/ConnectionBanner";
import { AppSidebar } from "@/components/layout/Sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useGateway } from "@/hooks/useGateway";

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
          {/* Global top bar with always-visible sidebar toggle */}
          <header className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
            <SidebarTrigger className="-ml-1" />
          </header>
          <main className="flex-1 min-h-0 overflow-hidden">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
