import { Outlet } from "react-router";
import { ConnectionBanner } from "@/components/gateway/ConnectionBanner";
import { Sidebar } from "@/components/layout/Sidebar";
import { useGateway } from "@/hooks/useGateway";

/**
 * Root layout: initialises the Gateway WebSocket connection and renders
 * the collapsible sidebar + main content area.
 */
export function AppShell() {
  // Mount the gateway connection for the lifetime of the app
  useGateway();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <ConnectionBanner />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
