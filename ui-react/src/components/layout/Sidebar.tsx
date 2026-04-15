// import {  UserIcon } from "lucide-react";
import { NavLink, useLocation } from "react-router";
// import { Avatar, AvatarFallback } from "@/components/ui/avatar";
// import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  // SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  // SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { tabIcon, tabLabel } from "@/lib/tabs";
import { cn } from "@/lib/utils";
// import { useGatewayStore } from "@/store/gateway.store";
import { TAB_GROUPS, TAB_PATHS, type Tab } from "@/types/gateway";

export function AppSidebar() {
  // const status = useGatewayStore((s) => s.status);
  // const serverVersion = useGatewayStore((s) => s.serverVersion);
  // const isConnected = status === "connected";

  return (
    <Sidebar collapsible="icon">
      {/* Traffic Lights region — 48px reserved for macOS window controls (drag area) */}
      <div
        className="h-12 shrink-0 select-none"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      {/* Header: brand logo + name */}
      {/* <SidebarHeader className="p-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <div className="cursor-default select-none">
                <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <BotIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight overflow-hidden">
                  <span className="truncate font-semibold">Bossim</span>
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
      </SidebarHeader> */}

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

      {/* Footer: user identity */}
      {/* <SidebarFooter className='p-0'>
        <Separator className="border" />
        <div className="flex items-center gap-2.5 px-3 py-3 group-data-[collapsible=icon]:justify-center">
          <Avatar className="size-8 shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary">
              <UserIcon className="size-4" />
            </AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight overflow-hidden group-data-[collapsible=icon]:hidden">
            <span className="truncate font-semibold">User</span>
            <span className="truncate text-xs text-muted-foreground">Bossim Pro</span>
          </div>
        </div>
      </SidebarFooter> */}
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
