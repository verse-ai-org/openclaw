import { Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shared enable pill / disable toggle used on grid and discover cards. */
export function ChannelPrimaryControl({
  mode,
  busy,
  onClick,
  className,
}: {
  mode: "enable-pill" | "toggle-on";
  busy?: boolean;
  onClick: (e: React.MouseEvent) => void;
  className?: string;
}) {
  if (mode === "enable-pill") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={onClick}
        className={cn(
          "shrink-0 rounded-full bg-primary px-5 py-1.5 text-[12px] font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors",
          className,
        )}
      >
        {busy ? (
          <Loader2Icon className="size-4 animate-spin mx-auto" />
        ) : (
          "Enable"
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      title="Disable channel"
      className={cn(
        "shrink-0 relative inline-flex h-6.5 w-11 cursor-pointer items-center rounded-full bg-primary disabled:opacity-50 transition-colors",
        className,
      )}
    >
      {busy ? (
        <Loader2Icon className="size-4 animate-spin text-primary-foreground mx-auto" />
      ) : (
        <span className="inline-block size-5.5 translate-x-5 rounded-full bg-primary-foreground shadow-sm transition-transform" />
      )}
    </button>
  );
}
