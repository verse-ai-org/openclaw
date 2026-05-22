import { MessageSquareIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getChannelLogoUrl } from "@/components/channels/shared/channel-logos";

type ChannelOptionIconProps = {
  channelId: string;
  systemImage?: string;
  size?: "sm" | "md";
  className?: string;
};

export function ChannelOptionIcon({
  channelId,
  systemImage,
  size = "md",
  className,
}: ChannelOptionIconProps) {
  const logoUrl = getChannelLogoUrl(channelId) || systemImage;
  const iconClass = size === "sm" ? "size-5" : "size-8";

  return logoUrl ? (
    <img
      src={logoUrl}
      alt=""
      className={cn(iconClass, "shrink-0 object-contain", className)}
      loading="lazy"
    />
  ) : (
    <MessageSquareIcon
      className={cn(iconClass, "shrink-0 text-muted-foreground", className)}
      aria-hidden="true"
    />
  );
}

type ChannelOptionLabelProps = {
  channelId: string;
  label: string;
  systemImage?: string;
  size?: "sm" | "md";
  className?: string;
};

/** Channel row label with logo — matches Channels page card icon placement. */
export function ChannelOptionLabel({
  channelId,
  label,
  systemImage,
  size = "md",
  className,
}: ChannelOptionLabelProps) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <ChannelOptionIcon channelId={channelId} systemImage={systemImage} size={size} />
      <span className="min-w-0 truncate text-sm font-medium leading-tight">{label}</span>
    </span>
  );
}
