import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/store/settings.store";
import type { ThemeMode } from "@/types/gateway";

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  useEffect(() => {
    setMounted(true);
  }, []);

  const active: ThemeMode = mounted && theme === "dark" ? "dark" : "light";

  function toggle() {
    const next: ThemeMode = active === "dark" ? "light" : "dark";
    setTheme(next);
    updateSettings({ theme: next });
  }

  return (
    <button
      type="button"
      onClick={() => toggle()}
      className={cn(
        "rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        !mounted && "opacity-60",
      )}
      aria-label={active === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={active === "dark" ? "Light mode" : "Dark mode"}
    >
      {active === "dark" ? (
        <MoonIcon className="size-4" aria-hidden />
      ) : (
        <SunIcon className="size-4" aria-hidden />
      )}
    </button>
  );
}
