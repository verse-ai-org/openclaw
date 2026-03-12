import {
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Wifi,
  WifiOff,
} from "lucide-react";
import { NavLink } from "react-router";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { tabIcon, tabLabel } from "@/lib/tabs";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway.store";
import { useSettingsStore } from "@/store/settings.store";
import { TAB_GROUPS, TAB_PATHS, type Tab } from "@/types/gateway";

export function Sidebar() {
  const status = useGatewayStore((s) => s.status);
  const serverVersion = useGatewayStore((s) => s.serverVersion);
  const { settings, updateSettings } = useSettingsStore();
  const collapsed = settings.navCollapsed;
  const groupsCollapsed = settings.navGroupsCollapsed;

  const toggleCollapse = () => updateSettings({ navCollapsed: !collapsed });

  const toggleGroup = (label: string) =>
    updateSettings({
      navGroupsCollapsed: {
        ...groupsCollapsed,
        [label]: !groupsCollapsed[label],
      },
    });

  const isConnected = status === "connected";

  return (
    <aside
      className={cn(
        "flex flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-200",
        collapsed ? "w-14" : "w-56",
      )}
    >
      {/* Header */}
      <div className="flex h-12 items-center justify-between px-3 shrink-0">
        {!collapsed && (
          <span className="text-sm font-semibold tracking-tight truncate">OpenClaw</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto shrink-0 text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={toggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </Button>
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Nav groups */}
      <ScrollArea className="flex-1 py-2">
        {TAB_GROUPS.map((group) => {
          const isGroupCollapsed = !!groupsCollapsed[group.label];
          return (
            <div key={group.label} className="mb-1">
              {/* Group header (only when sidebar expanded) */}
              {!collapsed && (
                <button
                  className="flex w-full items-center gap-1 px-3 py-1 text-xs font-medium text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
                  onClick={() => toggleGroup(group.label)}
                >
                  {isGroupCollapsed ? (
                    <ChevronRight className="size-3" />
                  ) : (
                    <ChevronDown className="size-3" />
                  )}
                  <span className="uppercase tracking-wider">{group.label}</span>
                </button>
              )}

              {/* Nav items */}
              {(!isGroupCollapsed || collapsed) &&
                group.tabs.map((tab) => <NavItem key={tab} tab={tab} collapsed={collapsed} />)}
            </div>
          );
        })}
      </ScrollArea>

      <Separator className="bg-sidebar-border" />

      {/* Footer: connection status */}
      <div className="flex items-center gap-2 px-3 py-2 shrink-0">
        {isConnected ? (
          <Wifi className="size-3.5 text-green-500 shrink-0" />
        ) : (
          <WifiOff className="size-3.5 text-muted-foreground shrink-0" />
        )}
        {!collapsed && (
          <span className="text-xs text-muted-foreground truncate">
            {isConnected ? (serverVersion ? `v${serverVersion}` : "connected") : status}
          </span>
        )}
      </div>
    </aside>
  );
}

function NavItem({ tab, collapsed }: { tab: Tab; collapsed: boolean }) {
  const Icon = tabIcon(tab);
  const label = tabLabel(tab);
  const path = TAB_PATHS[tab];

  const item = (
    <NavLink
      to={path}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
            : "text-sidebar-foreground",
          collapsed && "justify-center px-0 mx-2",
        )
      }
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{item}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }

  return item;
}
