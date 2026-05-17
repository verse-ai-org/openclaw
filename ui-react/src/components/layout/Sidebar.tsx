// import {  UserIcon } from "lucide-react";
import { NavLink, useLocation } from "react-router";
// import { Avatar, AvatarFallback } from "@/components/ui/avatar";
// import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { tabIcon, tabLabel } from "@/lib/tabs";
import { cn } from "@/lib/utils";
// import { useGatewayStore } from "@/store/gateway.store";
import { TAB_GROUPS, TAB_PATHS, type Tab } from "@/types/gateway";
import { Separator } from "../ui/separator.tsx";
import { CONFIG } from "@/data/config.ts";
import { isMacOSElectron } from "@/utils/electron-env.ts";

export function AppSidebar() {
  // const status = useGatewayStore((s) => s.status);
  // const serverVersion = useGatewayStore((s) => s.serverVersion);
  // const isConnected = status === "connected";

  const goWebsite = () => {
    window.open(CONFIG.websiteUrl, "_blank");
  };

  return (
    <Sidebar variant="inset">
      {/* Traffic Lights region — 48px reserved for macOS window controls (drag area) */}
      <div
        className={cn("h-10 shrink-0 select-none", isMacOSElectron() ? "" : "hidden")}
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      {/* Header: brand logo + name */}
      <SidebarHeader className="p-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild onClick={goWebsite}>
              <div className="cursor-default select-none">
                <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg text-sidebar-primary-foreground">
                  <img src="/logo.png" alt="Bossim" className="rounded-lg size-8" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight overflow-hidden">
                  <span className="truncate font-semibold">Bossim</span>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <Separator className="bg-sidebar-border/20" />
      </SidebarHeader>

      {/* Nav groups */}
      <SidebarContent>
        {TAB_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="uppercase tracking-wider text-xs group-data-[collapsible=icon]:hidden">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.tabs.map((tab) => (
                  <NavItem key={tab} tab={tab} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-2 pt-0 group-data-[collapsible=icon]:p-2">
        <SidebarMenu>
          <NavItem tab="settings" />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function NavItem({ tab }: { tab: Tab }) {
  const Icon = tabIcon(tab);
  const label = tabLabel(tab);
  const path = TAB_PATHS[tab];
  const location = useLocation();
  const isActive = location.pathname === path || location.pathname.startsWith(path + "/");

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={label}
        className={cn(
          "rounded-full transition-colors data-[active=true]:bg-white data-[active=true]:text-primary",
          isActive
            ? "bg-white text-primary shadow-sm hover:bg-white hover:text-primary dark:bg-sidebar-accent"
            : "text-foreground/80 hover:bg-muted hover:text-foreground",
          "[&_svg]:size-4",
          isActive && "[&_svg]:text-primary",
        )}
      >
        <NavLink to={path}>
          <Icon />
          <span>{label}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
