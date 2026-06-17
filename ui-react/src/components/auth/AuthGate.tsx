import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/hooks/auth/use-auth";
import { isAuthAvailable } from "@/lib/auth/bridge";
import { AuthPage } from "@/pages/AuthPage";

type AuthGateProps = {
  children: ReactNode;
};

export function AuthGate({ children }: AuthGateProps) {
  const { status } = useAuth();

  if (!isAuthAvailable()) {
    return <>{children}</>;
  }

  if (status === "idle" || status === "loading") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <AuthPage />;
  }

  return <>{children}</>;
}
