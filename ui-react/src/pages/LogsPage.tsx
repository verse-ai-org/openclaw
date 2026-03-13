import { RefreshCwIcon, DownloadIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway.store";
import { useLogsStore, type LogLevel, type LogEntry } from "@/store/logs.store";

const LEVELS: LogLevel[] = ["trace", "debug", "info", "warn", "error", "fatal"];

const LEVEL_COLORS: Record<LogLevel, string> = {
  trace: "text-muted-foreground",
  debug: "text-blue-600 dark:text-blue-400",
  info: "text-green-600 dark:text-green-400",
  warn: "text-amber-600 dark:text-amber-400",
  error: "text-red-600 dark:text-red-400",
  fatal: "text-red-700 dark:text-red-300 font-bold",
};

export function LogsPage() {
  const status = useGatewayStore((s) => s.status);
  const {
    loading,
    error,
    file,
    entries,
    filterText,
    levelFilters,
    autoFollow,
    truncated,
    loadLogs,
    setFilterText,
    toggleLevel,
    setAutoFollow,
    exportLogs,
  } = useLogsStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const isConnected = status === "connected";

  useEffect(() => {
    if (isConnected) {
      void loadLogs();
    }
  }, [isConnected, loadLogs]);

  useEffect(() => {
    if (autoFollow && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, autoFollow]);

  const filtered = entries.filter((entry) => {
    if (entry.level && !levelFilters[entry.level]) {
      return false;
    }
    if (!filterText.trim()) {
      return true;
    }
    const needle = filterText.toLowerCase();
    const haystack = [entry.message, entry.subsystem, entry.raw]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });

  const levelFiltered = LEVELS.some((level) => !levelFilters[level]);
  const exportLabel = filterText || levelFiltered ? "filtered" : "visible";

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto w-full h-[calc(100vh-4rem)]">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Logs</h1>
          <p className="text-sm text-muted-foreground">Gateway file logs (JSONL format).</p>
          {file && <p className="text-xs text-muted-foreground mt-1 font-mono">{file}</p>}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadLogs()}
            disabled={loading || !isConnected}
          >
            <RefreshCwIcon className={cn("size-4 mr-2", loading && "animate-spin")} />
            {loading ? "Loading..." : "Refresh"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportLogs(filtered, exportLabel)}
            disabled={filtered.length === 0}
          >
            <DownloadIcon className="size-4 mr-2" />
            Export {exportLabel}
          </Button>
        </div>
      </div>

      {!isConnected && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Not connected to gateway.</p>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      <Card className="flex-1 flex flex-col min-h-0">
        <CardHeader>
          <CardTitle>Log Entries</CardTitle>
          <CardDescription>
            Showing {filtered.length} of {entries.length} entries
            {truncated && " (truncated to last 500)"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col gap-4 min-h-0">
          {/* Filters */}
          <div className="flex flex-wrap gap-4 items-center">
            <Input
              placeholder="Search logs..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="max-w-xs"
            />
            <div className="flex items-center gap-3">
              {LEVELS.map((level) => (
                <label key={level} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={levelFilters[level]}
                    onCheckedChange={() => toggleLevel(level)}
                  />
                  <Badge variant={levelFilters[level] ? "default" : "outline"} className="text-xs">
                    {level}
                  </Badge>
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 cursor-pointer ml-auto">
              <Checkbox
                checked={autoFollow}
                onCheckedChange={(checked) => setAutoFollow(!!checked)}
              />
              <span className="text-sm">Auto-follow</span>
            </label>
          </div>

          {/* Log entries */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-auto bg-muted/30 rounded-lg p-3 font-mono text-xs space-y-0.5"
          >
            {filtered.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No log entries found.</p>
            ) : (
              filtered.map((entry, index) => <LogEntryRow key={index} entry={entry} />)
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LogEntryRow({ entry }: { entry: LogEntry }) {
  const timestamp = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : "";
  const levelColor = entry.level ? LEVEL_COLORS[entry.level] : "text-muted-foreground";

  return (
    <div className="flex gap-2 hover:bg-muted/50 px-2 py-0.5 rounded">
      {timestamp && <span className="text-muted-foreground shrink-0 w-20">{timestamp}</span>}
      {entry.level && (
        <span className={cn("shrink-0 w-12 uppercase font-semibold", levelColor)}>
          {entry.level}
        </span>
      )}
      {entry.subsystem && (
        <span className="text-blue-600 dark:text-blue-400 shrink-0">[{entry.subsystem}]</span>
      )}
      <span className="flex-1 break-all">{entry.message}</span>
    </div>
  );
}
