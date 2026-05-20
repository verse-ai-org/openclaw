import type { ChannelLifecycle } from "@/lib/channel-lifecycle";
import type { ChannelsStatusSnapshot, NostrStatus, WhatsAppStatus } from "@/types/channels";

export type ChannelSetupStepId = "login" | "credentials" | "profile";

export type ChannelSetupStep = {
  id: ChannelSetupStepId;
  title: string;
  description: string;
  done: boolean;
};

const STEP_COPY: Record<
  ChannelSetupStepId,
  { title: string; description: string }
> = {
  login: {
    title: "Connect account",
    description: "Complete QR or device linking so the gateway can reach this channel.",
  },
  credentials: {
    title: "Save credentials",
    description: "Fill required tokens or keys in the config form below, then save.",
  },
  profile: {
    title: "Set profile",
    description: "Add your Nostr profile metadata so the channel can publish correctly.",
  },
};

const CHANNEL_STEP_ORDER: Partial<Record<string, ChannelSetupStepId[]>> = {
  whatsapp: ["login", "credentials"],
  "openclaw-weixin": ["login"],
  nostr: ["profile", "credentials"],
};

function channelRaw(
  snapshot: ChannelsStatusSnapshot,
  channelId: string,
): Record<string, unknown> | undefined {
  return snapshot.channels[channelId] as Record<string, unknown> | undefined;
}

function accountsConfigured(snapshot: ChannelsStatusSnapshot, channelId: string): boolean {
  const accounts = snapshot.channelAccounts[channelId] ?? [];
  return accounts.some((account) => account.configured === true);
}

function isLoginStepDone(channelId: string, snapshot: ChannelsStatusSnapshot): boolean {
  if (channelId === "whatsapp") {
    const raw = snapshot.channels[channelId] as WhatsAppStatus | undefined;
    return Boolean(raw?.linked);
  }
  if (channelId === "openclaw-weixin") {
    const raw = channelRaw(snapshot, channelId);
    return Boolean(raw?.configured) || accountsConfigured(snapshot, channelId);
  }
  return false;
}

function isCredentialsStepDone(channelId: string, snapshot: ChannelsStatusSnapshot): boolean {
  if (accountsConfigured(snapshot, channelId)) {
    return true;
  }
  const raw = channelRaw(snapshot, channelId);
  return Boolean(raw?.configured);
}

function isProfileStepDone(channelId: string, snapshot: ChannelsStatusSnapshot): boolean {
  if (channelId !== "nostr") {
    return false;
  }
  const raw = snapshot.channels[channelId] as NostrStatus | undefined;
  const profile = raw?.profile;
  return Boolean(profile?.name?.trim() || profile?.displayName?.trim());
}

function resolveStepDone(
  stepId: ChannelSetupStepId,
  channelId: string,
  snapshot: ChannelsStatusSnapshot,
): boolean {
  if (stepId === "login") {
    return isLoginStepDone(channelId, snapshot);
  }
  if (stepId === "profile") {
    return isProfileStepDone(channelId, snapshot);
  }
  return isCredentialsStepDone(channelId, snapshot);
}

export function resolveChannelSetupSteps(params: {
  channelId: string;
  snapshot: ChannelsStatusSnapshot;
  lifecycle: ChannelLifecycle;
}): ChannelSetupStep[] {
  if (params.lifecycle !== "needs_setup" && params.lifecycle !== "error") {
    return [];
  }

  const stepIds =
    CHANNEL_STEP_ORDER[params.channelId] ?? (["credentials"] as ChannelSetupStepId[]);

  return stepIds.map((id) => ({
    id,
    title: STEP_COPY[id].title,
    description: STEP_COPY[id].description,
    done: resolveStepDone(id, params.channelId, params.snapshot),
  }));
}

export function resolveCurrentSetupStepIndex(steps: ChannelSetupStep[]): number {
  const firstOpen = steps.findIndex((step) => !step.done);
  return firstOpen === -1 ? Math.max(0, steps.length - 1) : firstOpen;
}

export function channelSetupShowsGuide(lifecycle: ChannelLifecycle): boolean {
  return lifecycle === "needs_setup" || lifecycle === "error";
}
