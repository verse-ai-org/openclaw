import { CheckCircle, ExternalLink, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useBrowserAuth } from "@/hooks/auth/use-auth";

export function AuthPage() {
  const { phase, error, startBrowserAuth, retry } = useBrowserAuth();

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-background px-6 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <img src="/logo.png" alt="Bossim" className="size-16 rounded-2xl" />
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Welcome to Bossim</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Use your Bossim account to sync settings and access your workspace. Sign in or
              create an account in your browser.
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-4">
          <button
            type="button"
            onClick={() => {
              void startBrowserAuth();
            }}
            disabled={phase === "opening" || phase === "success"}
            className={[
              "flex h-12 w-full items-center justify-center gap-2 rounded-full border-0 text-sm font-semibold text-white transition-opacity",
              phase === "success"
                ? "bg-green-600"
                : "bg-primary hover:bg-primary/90",
              phase === "opening" || phase === "success"
                ? "cursor-not-allowed opacity-80"
                : "cursor-pointer",
            ].join(" ")}
          >
            {phase === "opening" && <Loader2 className="size-4 animate-spin" />}
            {phase === "success" && <CheckCircle className="size-4" />}
            {phase !== "opening" && phase !== "success" && (
              <ExternalLink className="size-4" />
            )}
            {phase === "opening"
              ? "Opening browser…"
              : phase === "success"
                ? "Signed in!"
                : "Sign in with browser"}
          </button>

          {(phase === "polling" || phase === "error") && (
            <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4">
              {phase === "polling" && (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">
                    Waiting for browser confirmation…
                  </span>
                </div>
              )}
              {phase === "error" && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-destructive">
                    <XCircle className="size-4 shrink-0" />
                    <span className="text-sm font-medium">{error ?? "Authentication failed."}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void retry();
                    }}
                    className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent text-sm font-medium text-muted-foreground hover:text-foreground"
                  >
                    <RefreshCw className="size-3.5" />
                    Try again
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
