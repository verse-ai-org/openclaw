import {
  findProviderGroup,
  getFeaturedProviders,
  type AuthMethodDef,
  type AuthProviderGroupDef,
} from "@/data/auth-choice-groups";
import type { AgentConfigSnapshot } from "@/types/agents";
import type { ProviderModelDraft, ProviderModelResolvedState } from "./types";

function readModelPrimary(model: unknown): string {
  if (typeof model === "string") {
    return model;
  }
  if (typeof model === "object" && model != null) {
    return (
      ((model as Record<string, unknown>).primary as string | undefined) ?? ""
    );
  }
  return "";
}

function pickMethod(
  group: AuthProviderGroupDef,
  providerConfig: Record<string, unknown> | undefined,
): AuthMethodDef {
  const auth = providerConfig?.auth;
  if (auth === "oauth") {
    return group.methods.find((m) => m.type === "oauth") ?? group.methods[0];
  }
  if (auth === "token") {
    return group.methods.find((m) => m.type === "proxy") ?? group.methods[0];
  }
  if (providerConfig?.apiKey) {
    return (
      group.methods.find((m) => m.type === "api-key" || m.type === "custom") ??
      group.methods[0]
    );
  }
  return group.methods.find((m) => m.type === "oauth") ?? group.methods[0];
}

export function toProviderAuth(method: AuthMethodDef): string {
  if (method.type === "oauth") return "oauth";
  if (method.type === "proxy") return "token";
  return "api-key";
}

export function deriveProviderModelState(
  configForm: AgentConfigSnapshot | null,
): ProviderModelResolvedState {
  const defaults = configForm?.agents?.defaults;
  const globalModel = readModelPrimary(defaults?.model);
  const providerMap = configForm?.models?.providers ?? {};
  const fallbackGroup =
    getFeaturedProviders()[0] ?? findProviderGroup("anthropic") ?? null;
  const authProfiles = (
    (configForm as Record<string, unknown> | null)?.auth as
      | Record<string, unknown>
      | undefined
  )?.profiles as Record<string, unknown> | undefined;
  const providerIdFromAuth =
    authProfiles && Object.keys(authProfiles).length > 0
      ? (
          ((Object.values(authProfiles)[0] as Record<string, unknown> | undefined)
            ?.provider as string | undefined) ?? ""
        )
      : "";
  const providerIdFromModel = globalModel.split("/")[0] ?? "";
  const inferredProviderId =
    findProviderGroup(providerIdFromAuth)?.id ??
    findProviderGroup(providerIdFromModel)?.id ??
    fallbackGroup?.id ??
    "anthropic";
  const selectedGroup =
    findProviderGroup(inferredProviderId) ?? fallbackGroup ?? findProviderGroup("anthropic");
  const selectedProviderId = selectedGroup?.id ?? "anthropic";
  const selectedProviderConfig = providerMap[selectedProviderId] as
    | Record<string, unknown>
    | undefined;
  const selectedMethod = selectedGroup
    ? pickMethod(selectedGroup, selectedProviderConfig)
    : undefined;

  return {
    providerId: selectedProviderId,
    methodId: selectedMethod?.id ?? "",
    modelId: globalModel || selectedMethod?.defaultModelId || "",
    apiKey:
      typeof selectedProviderConfig?.apiKey === "string"
        ? selectedProviderConfig.apiKey
        : "",
    baseUrl:
      typeof selectedProviderConfig?.baseUrl === "string"
        ? selectedProviderConfig.baseUrl
        : "",
    providerLabel: selectedGroup?.label ?? selectedProviderId,
    methodLabel: selectedMethod?.label ?? "Not configured",
  };
}

export function buildProviderModelPatchOps(
  draft: ProviderModelDraft,
): Array<{ path: Array<string | number>; value: unknown }> {
  const method = findProviderGroup(draft.providerId)?.methods.find(
    (m) => m.id === draft.methodId,
  );
  const auth = method ? toProviderAuth(method) : undefined;
  const ops: Array<{ path: Array<string | number>; value: unknown }> = [
    {
      path: ["agents", "defaults", "model"],
      value: draft.modelId ? { primary: draft.modelId } : undefined,
    },
    {
      path: ["models", "providers", draft.providerId, "auth"],
      value: auth,
    },
    {
      path: ["models", "providers", draft.providerId, "apiKey"],
      value: draft.apiKey.trim() ? draft.apiKey : undefined,
    },
  ];
  if (method?.type === "custom") {
    ops.push({
      path: ["models", "providers", draft.providerId, "baseUrl"],
      value: draft.baseUrl.trim() ? draft.baseUrl : undefined,
    });
  }
  return ops;
}
