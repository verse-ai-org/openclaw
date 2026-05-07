import { ChevronRightIcon } from "lucide-react";
import { useState, type FC } from "react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./status-badge";
import { ToolDetailDrawer } from "./tool-detail-drawer";
import { TOOL_CATEGORY_CONFIG } from "./classify";
import { buildToolDetailModel, type ToolFallbackPartProps } from "./build-model";

const ToolFallbackImpl: FC<ToolFallbackPartProps> = ({
  toolName,
  argsText,
  result,
  status,
  isError,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const {
    toolLabel,
    category,
    statusType,
    isCancelled,
    resultStr,
    summaryPreview,
    errorMessage,
    argsFields,
    resultFields,
    richContent,
    canPromoteRichContent,
  } = buildToolDetailModel({ toolName, argsText, result, status, isError });

  const cfg = TOOL_CATEGORY_CONFIG[category];
  const Icon = cfg.Icon;

  return (
    <>
      <div
        className={cn(
          "overflow-hidden text-xs transition-colors",
          statusType === "incomplete"
            ? "border-destructive/60 bg-destructive/5"
            : cfg.borderAccent,
          "cursor-pointer",
        )}
        role="button"
        tabIndex={0}
        onClick={() => setDrawerOpen(true)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setDrawerOpen(true)}
        aria-label={`View details for ${toolLabel}`}
      >
        <div className="flex w-full items-center gap-2 px-3 py-1">
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-md",
              cfg.iconBg,
            )}
          >
            <Icon className={cn("size-3.5", cfg.iconColor)} />
          </span>
          <span className="flex flex-1 items-baseline gap-1.5 min-w-0">
            <span className="shrink-0 text-sm text-muted-foreground">
              {cfg.actionLabel}
            </span>
            {!!argsFields?.[0]?.value && (
              <span className="truncate text-xs text-muted-foreground">
                - {argsFields?.[0]?.value}
              </span>
            )}
          </span>
          <StatusBadge status={statusType} isCancelled={isCancelled} withText={false} />
          <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </div>
      </div>
      <ToolDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        toolLabel={toolLabel}
        argsText={argsText}
        argsFields={argsFields}
        resultFields={resultFields}
        summaryPreview={summaryPreview}
        resultStr={resultStr}
        statusType={statusType}
        isCancelled={isCancelled}
        errorMessage={errorMessage}
        categoryConfig={cfg}
        richContent={richContent}
        canPromoteRichContent={canPromoteRichContent}
      />
    </>
  );
};

ToolFallbackImpl.displayName = "ToolFallback";
export const ToolFallback = ToolFallbackImpl;
