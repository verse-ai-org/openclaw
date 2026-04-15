import { useRef } from "react";
import { cn } from "@/lib/utils";

interface AgentCardProps {
  id: string;
  name: string;
  emoji?: string;
  avatar?: string;
  video?: string;
  isSelected: boolean;
  onClick: () => void;
}

export function AgentCard({
  name,
  emoji,
  avatar,
  video,
  isSelected,
  onClick,
}: AgentCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleMouseEnter = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = 0;
    void videoRef.current.play().catch(() => {
      // Ignore autoplay errors and keep image fallback visible.
    });
  };

  const handleMouseLeave = () => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    videoRef.current.currentTime = 0;
  };

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "group relative aspect-3/4 overflow-hidden flex flex-col items-center gap-4 rounded-2xl border p-0 transition-all duration-200",
      )}
    >
      {/* Emoji/Avatar */}
      <div
        className={cn(
          "relative flex w-full h-full items-center justify-center rounded-2xl text-5xl overflow-hidden",
          isSelected ? "bg-white shadow-sm" : "bg-[#F9FAFB]",
        )}
      >
        {avatar ? (
          <img
            src={avatar}
            alt={name}
            className={cn(
              "h-full w-full object-contain transition-opacity duration-200",
              video ? "opacity-100 group-hover:opacity-0" : "opacity-100",
            )}
          />
        ) : (
          <span className={cn(video ? "transition-opacity duration-200 group-hover:opacity-0" : "")}>
            {emoji ?? "🤖"}
          </span>
        )}
        {video && (
          <video
            ref={videoRef}
            src={video}
            muted
            playsInline
            loop
            preload="metadata"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          />
        )}
      </div>

      {/* Name */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/35 to-transparent px-3 pb-2 pt-6 text-center">
        <h3 className="truncate text-sm font-medium text-white drop-shadow-sm">{name}</h3>
      </div>

      {/* Selected indicator */}
      {/* {isSelected && (
        <div className="absolute top-4 right-4">
          <div className="size-2 rounded-full bg-[#BA0034]" />
        </div>
      )} */}
    </button>
  );
}
