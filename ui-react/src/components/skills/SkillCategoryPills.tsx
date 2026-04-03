import { cn } from "@/lib/utils";

export function SkillCategoryPills({ categories, active, onChange }: {
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
