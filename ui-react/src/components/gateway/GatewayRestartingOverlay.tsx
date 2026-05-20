import { Loader2Icon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ConfigApplyPhase } from "@/store/gateway.store";
import { useGatewayStore } from "@/store/gateway.store";

const PHASE_COPY: Record<
  Exclude<ConfigApplyPhase, "idle">,
  { title: string; description: string }
> = {
  applying: {
    title: "Applying configuration…",
    description: "Saving plugin and channel settings. The UI may disconnect briefly.",
  },
  restarting: {
    title: "Restarting gateway…",
    description: "The local gateway is restarting to load changes.",
  },
  reconnecting: {
    title: "Reconnecting…",
    description: "Waiting for the control UI to connect again.",
  },
};

/**
 * Global overlay shown while Gateway is applying config after channel/plugin actions.
 */
export function GatewayRestartingOverlay() {
  const restarting = useGatewayStore((s) => s.restarting);
  const phase = useGatewayStore((s) => s.configApplyPhase);
  const copy =
    phase === "idle"
      ? PHASE_COPY.applying
      : (PHASE_COPY[phase] ?? PHASE_COPY.applying);

  return (
    <Dialog open={restarting}>
      <DialogContent
        showCloseButton={false}
        className="flex flex-col items-center gap-4 py-10 sm:max-w-xs"
        overlayClassName="backdrop-blur-sm bg-background/80"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
        <DialogHeader className="items-center">
          <DialogTitle className="text-base">{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
