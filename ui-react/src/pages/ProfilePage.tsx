import { MailIcon, UserIcon } from "lucide-react";
import { useAuth } from "@/hooks/auth/use-auth";

export function ProfilePage() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  const displayName = user.display_name.trim() || "Personal account";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your Bossim account information.
        </p>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="flex items-center gap-4 border-b px-5 py-4">
          <div className="flex size-10 items-center justify-center rounded-full bg-muted">
            <UserIcon className="size-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Username
            </p>
            <p className="truncate text-sm font-medium">{displayName}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 px-5 py-4">
          <div className="flex size-10 items-center justify-center rounded-full bg-muted">
            <MailIcon className="size-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Email
            </p>
            <p className="truncate text-sm font-medium">{user.email || "—"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
