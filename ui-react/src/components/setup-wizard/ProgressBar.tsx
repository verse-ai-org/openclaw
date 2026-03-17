interface ProgressBarProps {
  current: number;
  total: number;
}

export function ProgressBar({ current, total }: ProgressBarProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      {/* 数字显示 */}
      <span className="text-sm font-bold text-primary">
        {current}/{total}
      </span>

      {/* 进度条 */}
      <div className="flex gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`h-1 rounded-full transition-all ${
              i < current - 1
                ? "w-8 bg-primary"
                : i === current - 1
                  ? "w-8 bg-primary"
                  : "w-4 bg-primary/20"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
