import {
  BracesIcon,
  CopyIcon,
  Maximize2Icon,
  Minimize2Icon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { ToolSection, type ToolDetailField } from "./sections";
import { StatusBadge } from "./status-badge";
import type { ToolCategoryConfig, ToolStatus } from "./types";

const RESULT_PREVIEW_MAX_LINES = 10;

interface ToolDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toolLabel: string;
  argsText: string | null | undefined;
  argsFields: ToolDetailField[];
  resultFields: ToolDetailField[];
  summaryPreview: string;
  resultStr: string | undefined;
  statusType: ToolStatus;
  isCancelled: boolean;
  errorMessage?: string;
  categoryConfig: ToolCategoryConfig;
  richContent?: ReactNode;
  canPromoteRichContent?: boolean;
}

export function ToolDetailDrawer({
  open,
  onOpenChange,
  toolLabel,
  argsText,
  argsFields,
  resultFields,
  summaryPreview,
  resultStr,
  statusType,
  isCancelled,
  errorMessage,
  categoryConfig,
  richContent,
  canPromoteRichContent,
}: ToolDetailDrawerProps) {
  const Icon = categoryConfig.Icon;
  const [showRawArgs, setShowRawArgs] = useState(false);
  const [isResultExpanded, setIsResultExpanded] = useState(false);
  const commandFieldIndex = argsFields.findIndex((field) => field.label === "Command");
  const commandField = commandFieldIndex >= 0 ? argsFields[commandFieldIndex] : undefined;
  const workingDirField = argsFields.find((field) => field.label === "Directory");
  const hasRawArgs = Boolean(argsText?.trim());
  const commandDisplayText =
    commandField?.value ??
    (hasRawArgs ? `${toolLabel} ${argsText!.trim()}` : toolLabel);
  const resultLines = (resultStr ?? "").split(/\r?\n/);
  const isLongResult = resultLines.length > RESULT_PREVIEW_MAX_LINES;
  const resultPreviewText = isLongResult
    ? resultLines.slice(0, RESULT_PREVIEW_MAX_LINES).join("\n")
    : resultStr;
  const hasResult = typeof resultStr === "string" && resultStr.length > 0;
  const showResultPreview = hasResult && !isResultExpanded;

  const copyText = async (text: string) => {
    if (typeof navigator === "undefined") {
      return;
    }
    await navigator.clipboard.writeText(text);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent
        className="h-full w-full lg:w-[72vw]"
        style={{ width: "72vw", maxWidth: "72vw" }}
      >
        <DrawerHeader className="border-b">
          <DrawerTitle className="flex items-center gap-2.5">
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-md",
                categoryConfig.iconBg,
              )}
            >
              <Icon className={cn("size-4", categoryConfig.iconColor)} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "truncate",
                    isCancelled && "line-through text-muted-foreground",
                  )}
                >
                  {toolLabel}
                </span>
                <StatusBadge status={statusType} isCancelled={isCancelled} />
              </div>
              {summaryPreview && (
                <p className="mt-1 truncate text-xs font-normal text-muted-foreground">
                  {summaryPreview}
                </p>
              )}
            </div>
          </DrawerTitle>
          {isCancelled && (
            <p className="text-xs text-muted-foreground">
              This tool call was cancelled. Any partial output is shown below when
              available.
            </p>
          )}
          {statusType === "running" && (
            <p className="text-xs text-muted-foreground">
              This tool is still running. You can inspect its inputs while waiting
              for output.
            </p>
          )}
        </DrawerHeader>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-5">
            <ToolSection
              title="Command"
              action={
                <div className="flex items-center gap-1">
                  {hasRawArgs && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 text-muted-foreground"
                      aria-label={showRawArgs ? "Hide raw arguments" : "Show raw arguments"}
                      title={showRawArgs ? "Hide raw arguments" : "Show raw arguments"}
                      onClick={() => setShowRawArgs((prev) => !prev)}
                    >
                      <BracesIcon className="size-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 text-muted-foreground"
                    aria-label="Copy command"
                    title="Copy command"
                    onClick={() => void copyText(commandDisplayText)}
                  >
                    <CopyIcon className="size-3.5" />
                  </Button>
                </div>
              }
            >
              <div className="overflow-hidden rounded-lg border border-border bg-background">
                <div className="border-b bg-secondary px-3 py-2 text-sm text-muted-foreground">
                  {workingDirField?.value
                    ? `cwd: ${workingDirField.value}`
                    : "shell session"}
                </div>
                <pre className="overflow-x-auto bg-white px-3 py-3 font-mono text-[12px] leading-6 text-foreground whitespace-pre-wrap break-all">
                  <span className="text-emerald-600">$ </span>
                  {commandDisplayText}
                </pre>
              </div>
              {showRawArgs && hasRawArgs && (
                <pre className="mt-3 rounded-lg border bg-white p-3 text-xs leading-relaxed whitespace-pre-wrap break-all">
                  {argsText}
                </pre>
              )}
            </ToolSection>

            {statusType === "incomplete" && errorMessage && (
              <ToolSection title={isCancelled ? "Cancelled reason" : "Error"}>
                <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground">
                  {errorMessage}
                </p>
              </ToolSection>
            )}

            <ToolSection
              title="Result"
              action={
                <div className="flex items-center gap-1">
                  {isLongResult && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 text-muted-foreground"
                      aria-label={isResultExpanded ? "Collapse result" : "Expand result"}
                      title={isResultExpanded ? "Collapse result" : "Expand result"}
                      onClick={() => setIsResultExpanded((prev) => !prev)}
                    >
                      {isResultExpanded ? (
                        <Minimize2Icon className="size-3.5" />
                      ) : (
                        <Maximize2Icon className="size-3.5" />
                      )}
                    </Button>
                  )}
                  {hasResult && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 text-muted-foreground"
                      aria-label="Copy result"
                      title="Copy result"
                      onClick={() => void copyText(resultStr!)}
                    >
                      <CopyIcon className="size-3.5" />
                    </Button>
                  )}
                </div>
              }
            >
              {richContent && statusType === "complete" && canPromoteRichContent && (
                <div className="mb-3 overflow-hidden rounded-lg border bg-background shadow-sm">
                  {richContent}
                </div>
              )}
              {showResultPreview && resultPreviewText && (
                <div className="relative">
                  <pre className="overflow-x-auto rounded-lg border border-border bg-white px-3 py-3 font-mono text-[12px] leading-6 text-foreground whitespace-pre-wrap break-all">
                    {resultPreviewText}
                  </pre>
                  {isLongResult && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent" />
                  )}
                </div>
              )}
              {isResultExpanded && hasResult && (
                <pre className="overflow-x-auto rounded-lg border border-border bg-white px-3 py-3 font-mono text-[12px] leading-6 text-foreground whitespace-pre-wrap break-all">
                  {resultStr}
                </pre>
              )}
              {!hasResult && statusType === "complete" && !richContent && (
                <p className="rounded-lg border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                  No output.
                </p>
              )}
              {statusType === "running" && !hasResult && !richContent && (
                <p className="rounded-lg border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                  Waiting for output...
                </p>
              )}
              {resultFields.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {resultFields.slice(0, 3).map((field) => (
                    <span
                      key={`${field.label}-${field.value}`}
                      className="inline-flex items-center gap-1 rounded-full border bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground"
                    >
                      <span className="font-medium">{field.label}:</span>
                      <span>{field.value}</span>
                    </span>
                  ))}
                </div>
              )}
            </ToolSection>

            {richContent && statusType === "complete" && !canPromoteRichContent && (
              <ToolSection title="Structured preview">
                <div className="overflow-hidden rounded-lg border bg-background">
                  {richContent}
                </div>
              </ToolSection>
            )}

            {!argsText &&
              resultStr === undefined &&
              statusType === "complete" &&
              !richContent && (
                <p className="text-sm text-muted-foreground">
                  Tool completed with no output.
                </p>
              )}
          </div>
        </div>
        <DrawerFooter className="border-t sm:flex-row sm:justify-end">
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
