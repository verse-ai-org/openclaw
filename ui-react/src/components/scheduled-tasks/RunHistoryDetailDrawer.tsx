import { MessageSquareIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { CronRunRecord } from "@/types/agents";
import { isCronRunJobDeleted } from "@/lib/cron-run-detail";
import { RunHistoryDetailBody } from "./RunHistoryDetailBody";
import { RunHistoryDetailChips } from "./RunHistoryDetailChips";
import { RunHistoryDetailMeta } from "./RunHistoryDetailMeta";
import { RunHistoryStatusBadge } from "./RunHistoryStatusBadge";

interface RunHistoryDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: CronRunRecord | null;
  onRerun?: (jobId: string, jobName?: string) => void;
  onViewInChat?: (record: CronRunRecord) => void;
}

export function RunHistoryDetailDrawer({
  open,
  onOpenChange,
  record,
  onRerun,
  onViewInChat,
}: RunHistoryDetailDrawerProps) {
  if (!record) {
    return null;
  }

  const jobDeleted = isCronRunJobDeleted(record);
  const canViewInChat = Boolean(onViewInChat && record.sessionKey?.trim());

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent
        className="flex h-full min-h-0 w-[min(80vw,42rem)] flex-col border-l bg-background"
        style={{ maxWidth: "min(80vw, 42rem)" }}
      >
        <DrawerHeader className="shrink-0 border-b px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-3">
              <DrawerTitle className="text-left text-lg leading-tight">
                {record.jobName}
                {jobDeleted && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">(deleted)</span>
                )}
              </DrawerTitle>
              <RunHistoryStatusBadge status={record.status} runStatus={record.runStatus} />
              <RunHistoryDetailChips record={record} />
            </div>
            <DrawerClose asChild>
              <Button variant="ghost" size="icon" className="size-9 shrink-0">
                <XIcon className="size-5" />
                <span className="sr-only">Close</span>
              </Button>
            </DrawerClose>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {onRerun && (
              <Button
                type="button"
                size="sm"
                disabled={jobDeleted}
                className="gap-1.5 rounded-full px-4 font-semibold shadow-sm"
                onClick={() => onRerun(record.jobId, record.jobName)}
              >
                <RefreshCwIcon className="size-3.5" />
                Rerun
              </Button>
            )}
            {canViewInChat && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5 rounded-full px-4"
                onClick={() => onViewInChat?.(record)}
              >
                <MessageSquareIcon className="size-3.5" />
                View in chat
              </Button>
            )}
          </div>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-6 px-6 py-5 pb-10">
              <RunHistoryDetailMeta record={record} />
              <RunHistoryDetailBody record={record} />
            </div>
          </ScrollArea>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
