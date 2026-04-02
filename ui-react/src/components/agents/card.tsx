import { cn } from "@/lib/utils";

interface AgentCardProps {
  id: string;
  name: string;
  emoji?: string;
  avatar?: string;
  isSelected: boolean;
  onClick: () => void;
}

export function AgentCard({
  name,
  emoji,
  avatar,
  isSelected,
  onClick,
}: AgentCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-center gap-4 rounded-3xl border-2 p-8 transition-all duration-200",
        "hover:border-[#BA0034]/30 hover:bg-[#BA0034]/5 hover:shadow-lg",
        isSelected
          ? "border-[#BA0034] bg-[#BA0034]/10 shadow-md"
          : "border-[#E5E7EB] bg-white",
      )}
    >
      {/* Emoji/Avatar */}
      <div
        className={cn(
          "flex size-24 items-center justify-center rounded-2xl text-5xl transition-transform group-hover:scale-110 overflow-hidden",
          isSelected ? "bg-white shadow-sm" : "bg-[#F9FAFB]",
        )}
      >
        {avatar ? (
          <img src={avatar} alt={name} className="size-full object-contain" />
        ) : (
          emoji ?? "🤖"
        )}
      </div>

      {/* Name */}
      <div className="text-center">
        <h3 className="text-lg font-bold text-[#111827] truncate max-w-full">{name}</h3>
      </div>

      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute top-4 right-4">
          <div className="size-2 rounded-full bg-[#BA0034]" />
        </div>
      )}
    </button>
  );
}
