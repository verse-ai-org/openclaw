import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface AgentCardProps {
  id: string;
  name: string;
  bioName?: string;
  emoji?: string;
  avatar?: string;
  video?: string;
  isSelected: boolean;
  onClick: () => void;
}

export function AgentCard({
  name,
  bioName,
  emoji,
  avatar,
  video,
  isSelected,
  onClick,
}: AgentCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoMounted, setVideoMounted] = useState(false);

  useEffect(() => {
    if (!videoMounted || !videoRef.current) {
      return;
    }
    const el = videoRef.current;
    el.currentTime = 0;
    void el.play().catch(() => {
      // Ignore autoplay errors and keep image fallback visible.
    });
    return () => {
      el.pause();
      el.currentTime = 0;
    };
  }, [videoMounted, video]);

  const handleMouseEnter = () => {
    if (video) {
      setVideoMounted(true);
    }
  };

  const handleMouseLeave = () => {
    setVideoMounted(false);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "group relative aspect-3/4 overflow-hidden flex flex-col items-center gap-4 rounded-2xl border p-0 transition-all duration-200",
        isSelected ? "border-2 border-primary" : "border-border",
      )}
    >
      {/* Emoji/Avatar */}
      <div
        className={cn(
          "relative flex w-full h-full items-center justify-center rounded-2xl text-5xl overflow-hidden",
          isSelected ? "bg-card shadow-sm" : "bg-muted",
        )}
      >
        {avatar ? (
          <img
            src={avatar}
            alt={name}
            className={cn(
              "h-full w-full object-cover transition-opacity duration-200",
              video ? "opacity-100 group-hover:opacity-0" : "opacity-100",
            )}
          />
        ) : (
          <span className={cn(video ? "transition-opacity duration-200 group-hover:opacity-0" : "")}>
            {emoji ?? "🤖"}
          </span>
        )}
        {video && videoMounted ? (
          <video
            ref={videoRef}
            src={video}
            muted
            playsInline
            loop
            preload="auto"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          />
        ) : null}
      </div>

      {/* Name */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/65 via-black/35 to-transparent px-3 pb-2 pt-6 text-center">
        <h3 className="truncate text-sm font-medium text-white drop-shadow-sm">{bioName}</h3>
        <p className="truncate text-xs text-white/75 drop-shadow-sm">{name}</p>
      </div>
    </button>
  );
}
