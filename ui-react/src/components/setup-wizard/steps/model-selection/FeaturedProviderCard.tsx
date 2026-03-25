import type { AuthProviderGroupDef } from "@/data/auth-choice-groups";
import {
  FEATURED_BTN_GRADIENT,
  FEATURED_SELECT_LABEL,
  PROVIDER_EMOJI,
  PROVIDER_IMAGE,
} from "./provider-constants";

interface FeaturedProviderCardProps {
  group: AuthProviderGroupDef;
  selected: boolean;
  onSelect: (g: AuthProviderGroupDef) => void;
}

/** Single featured provider card — bento style matching design spec */
export function FeaturedProviderCard({ group, onSelect }: FeaturedProviderCardProps) {
  const emoji = PROVIDER_EMOJI[group.id] ?? "🤖";
  const providerImage = PROVIDER_IMAGE[group.id];
  const selectLabel = FEATURED_SELECT_LABEL[group.id] ?? `Select ${group.label}`;
  const btnGradient =
    FEATURED_BTN_GRADIENT[group.id] ?? "linear-gradient(180deg, #D97757 0%, #C25E3F 100%)";

  return (
    <button
      onClick={() => onSelect(group)}
      className="group bg-white flex flex-col items-center text-center w-full p-8 transition-all rounded-2xl hover:-translate-y-1 shadow-[0_2px_16px_rgba(0,0,0,0.06)]"
      style={{
      }}
    >
      {/* Logo icon box */}
      <div
        className="flex items-center justify-center mb-6 w-20 h-20 rounded-lg bg-[#f8fafc] text-[36px] overflow-hidden"
      >
        {providerImage ? (
          <img
            src={providerImage}
            alt={group.label}
            className="w-12 h-12 object-contain"
          />
        ) : (
          emoji
        )}
      </div>

      {/* Provider name */}
      <h3
        className="text-xl font-bold text-[rgba(26,28,29,1)] mb-0"
      >
        {group.label}
      </h3>

      {/* Description */}
      <p
        className="leading-relaxed text-[rgba(113,113,122,1)] mb-10"
      >
        {group.hint}
      </p>

      {/* Select button — per-provider gradient from design spec */}
      <span
        className="w-full py-4 flex items-center justify-center font-bold text-white rounded-full shadow-lg"
        style={{
          background: btnGradient,
        }}
      >
        {selectLabel}
      </span>
    </button>
  );
}
