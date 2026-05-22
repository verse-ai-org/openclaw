import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { plainMdComponents } from "@/components/assistant-ui/markdown-text";
import type { CronRunRecord } from "@/types/agents";
import { getCronRunBodySource } from "@/lib/cron-run-detail";

interface RunHistoryDetailBodyProps {
  record: CronRunRecord;
}

export function RunHistoryDetailBody({ record }: RunHistoryDetailBodyProps) {
  const bodySource = getCronRunBodySource(record);

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-foreground">Result</h3>
      <div className="aui-md max-w-none rounded-xl border border-border bg-background p-4 text-sm text-foreground">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={plainMdComponents}>
          {bodySource}
        </ReactMarkdown>
      </div>
    </section>
  );
}
