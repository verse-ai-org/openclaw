import { SearchIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("bg-white rounded-2xl border border-[#F0F0F0] px-6 py-5", className)}>
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-wide">{children}</p>
  );
}

export function AppleToggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative inline-flex shrink-0 h-5 w-9 rounded-full transition-colors duration-200 focus:outline-none",
        checked ? "bg-[#BA0034]" : "bg-[#E9E9EA]",
        disabled && "opacity-40 cursor-not-allowed",
      )}
    >
      <span
        className={cn(
          "inline-block size-4 rounded-full bg-white shadow-md transform transition-transform duration-200 mt-0.5",
          checked ? "translate-x-4.5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export function DialogSearchInput({ value, onChange, placeholder = "Search…" }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#8E8E93]" />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-full bg-[#F3F4F6] border-0 pl-9 pr-9 text-[13px] text-black placeholder:text-[#8E8E93] focus:outline-none focus:ring-2 focus:ring-[#BA0034]/20 w-full"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8E8E93] hover:text-black"
        >
          <XIcon className="size-3" />
        </button>
      )}
    </div>
  );
}

export function CategoryPills({ categories, active, onChange }: {
  categories: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChange(c.id)}
          className={cn(
            "px-3 py-1 rounded-full text-[12px] font-semibold transition-colors duration-150 border",
            active === c.id
              ? "bg-black text-white border-black"
              : "bg-white text-[#8E8E93] border-[#E5E7EB] hover:border-black hover:text-black",
          )}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
