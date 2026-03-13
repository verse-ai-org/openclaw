import { BotIcon, Wifi, WifiOff } from "lucide-react";
import { NavLink, useLocation } from "react-router";
import { Separator } from "@/components/ui/separator";
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
import { useGatewayStore } from "@/store/gateway.store";
import { TAB_GROUPS, TAB_PATHS, type Tab } from "@/types/gateway";

export function AppSidebar() {
  const status = useGatewayStore((s) => s.status);
  const serverVersion = useGatewayStore((s) => s.serverVersion);
  const isConnected = status === "connected";

  return (
    <Sidebar collapsible="icon">
      {/* Header: brand logo + name */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <div className="cursor-default select-none">
                <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <BotIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight overflow-hidden">
                  <span className="truncate font-semibold">OpenClaw</span>
                  <span
                    className={cn(
                      "truncate text-xs",
                      isConnected ? "text-emerald-500" : "text-muted-foreground",
                    )}
                  >
                    {isConnected ? (serverVersion ? `v${serverVersion}` : "Connected") : status}
                  </span>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <Separator className="bg-sidebar-border" />
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

      {/* Footer: gateway status */}
      <SidebarFooter>
        <Separator className="bg-sidebar-border" />
        <div className="flex items-center gap-2 px-3 py-2">
          {isConnected ? (
            <Wifi className="size-3.5 text-emerald-500 shrink-0" />
          ) : (
            <WifiOff className="size-3.5 text-muted-foreground shrink-0" />
          )}
          <span className="text-xs text-muted-foreground truncate group-data-[collapsible=icon]:hidden">
            {isConnected
              ? serverVersion
                ? `Gateway v${serverVersion}`
                : "Gateway connected"
              : "Gateway offline"}
          </span>
        </div>
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
      <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
        <NavLink to={path}>
          <Icon />
          <span>{label}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
