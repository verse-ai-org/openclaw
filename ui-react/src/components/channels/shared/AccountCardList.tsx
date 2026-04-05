import type { ChannelAccountSnapshot } from "@/types/channels";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/relative-time";

function runningStatus(account: ChannelAccountSnapshot): string {
  if (account.running) return "Yes";
  if (
    account.lastInboundAt &&
    Date.now() - account.lastInboundAt < 10 * 60 * 1000
  ) {
    return "Active";
  }
  return "No";
}

export function AccountCardList({
  accounts,
}: {
  accounts: ChannelAccountSnapshot[];
}) {
  return (
    <div className="space-y-2 mt-4">
      {accounts.map((account) => {
        const probe = account.probe as
          | { bot?: { username?: string } }
          | undefined;
        const botUsername = probe?.bot?.username;
        const title = botUsername
          ? `@${botUsername}`
          : account.name || account.accountId;

        return (
          <div
            key={account.accountId}
            className="rounded-lg border bg-muted/30 p-3 space-y-2"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium truncate">{title}</span>
              <span className="text-xs text-muted-foreground truncate">
                {account.accountId}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span className="text-muted-foreground">Running</span>
              <span className="font-mono">{runningStatus(account)}</span>

              <span className="text-muted-foreground">Configured</span>
              <span className="font-mono">
                {account.configured ? "Yes" : "No"}
              </span>

              {account.connected !== undefined &&
                account.connected !== null && (
                  <>
                    <span className="text-muted-foreground">Connected</span>
                    <span className="font-mono">
                      {account.connected ? "Yes" : "No"}
                    </span>
                  </>
                )}

              <span className="text-muted-foreground">Last inbound</span>
              <span className="font-mono">
                {relativeTime(account.lastInboundAt)}
              </span>
            </div>

            {account.lastError && (
              <p
                className={cn(
                  "text-xs text-destructive bg-destructive/10 rounded px-2 py-1",
                )}
              >
                {account.lastError}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
