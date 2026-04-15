import { SegmentedControl } from "@/components/shared/segmented-control";

export function SkillCategoryPills({ categories, active, onChange }: {
  categories: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <SegmentedControl
      options={categories.map((c) => ({ value: c.id, label: c.label }))}
      value={active}
      onChange={onChange}
      size="sm"
      className="w-fit"
    />
  );
}
