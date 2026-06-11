import {
  LogOutIcon,
  SettingsIcon,
  UserIcon,
} from "lucide-react";
import { useState } from "react";
import { NavLink, useNavigate } from "react-router";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/auth/use-auth";
import { tabIcon, tabLabel } from "@/lib/tabs";
import { cn } from "@/lib/utils";
import { isAuthAvailable } from "@/lib/auth/bridge";

function MenuRow({
  icon: Icon,
  label,
  shortcut,
  onClick,
  to,
  destructive,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut?: string;
  onClick?: () => void;
  to?: string;
  destructive?: boolean;
}) {
  const className = cn(
    "flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
    destructive
      ? "text-foreground hover:bg-muted"
      : "text-foreground hover:bg-muted",
  );

  const content = (
    <>
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 text-left">{label}</span>
      {shortcut ? (
        <span className="text-xs text-muted-foreground">{shortcut}</span>
      ) : null}
    </>
  );

  if (to) {
    return (
      <NavLink to={to} className={className} onClick={onClick}>
        {content}
      </NavLink>
    );
  }

  return (
    <button type="button" className={cn(className, "border-0 bg-transparent")} onClick={onClick}>
      {content}
    </button>
  );
}

export function UserSettingsPopover() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const authEnabled = isAuthAvailable();

  const handleLogout = () => {
    setOpen(false);
    void logout();
  };

  const closeAndNavigate = (path: string) => {
    setOpen(false);
    void navigate(path);
  };

  if (!authEnabled) {
    const SettingsIconComponent = tabIcon("settings");
    const label = tabLabel("settings");
    return (
      <SidebarMenuButton asChild tooltip={label}>
        <NavLink to="/settings">
          <SettingsIconComponent />
          <span>{label}</span>
        </NavLink>
      </SidebarMenuButton>
    );
  }

  const displayName = user?.display_name?.trim() || "Personal account";
  const email = user?.email || "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <SidebarMenuButton
          tooltip="Settings"
          className="rounded-full"
          isActive={open}
        >
          <SettingsIcon />
          <span>Settings</span>
        </SidebarMenuButton>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-72 p-0"
      >
        {user ? (
          <div className="px-3 py-3">
            <div className="flex items-center gap-2.5 py-1.5">
              <UserIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-sm">{email || "—"}</span>
            </div>
            <div className="flex items-center gap-2.5 py-1.5">
              <SettingsIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-sm text-muted-foreground">{displayName}</span>
            </div>
          </div>
        ) : null}

        <Separator />

        <div className="flex flex-col p-1.5">
          <MenuRow
            icon={UserIcon}
            label="Profile"
            to="/profile"
            onClick={() => setOpen(false)}
          />
          <MenuRow
            icon={SettingsIcon}
            label="Settings"
            onClick={() => closeAndNavigate("/settings")}
          />
        </div>

        <Separator />

        <div className="p-1.5">
          <MenuRow icon={LogOutIcon} label="Log out" onClick={handleLogout} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
