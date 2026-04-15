import type { AuthMethodDef, AuthProviderGroupDef } from "@/data/auth-choice-groups";

export interface ProviderModelDraft {
  providerId: string;
  methodId: string;
  modelId: string;
  apiKey: string;
  baseUrl: string;
}

export interface ProviderModelResolvedState extends ProviderModelDraft {
  providerLabel: string;
  methodLabel: string;
}

export interface ProviderSelectionState {
  group: AuthProviderGroupDef;
  method: AuthMethodDef;
  modelId: string;
  apiKey: string;
  baseUrl: string;
}

export interface ProviderModelSectionProps {
  selectedProviderId: string | null;
  selectedMethodId: string | null;
  modelId: string;
  apiKey: string;
  baseUrl: string;
  onProviderChange: (group: AuthProviderGroupDef) => void;
  onMethodChange: (method: AuthMethodDef) => void;
  onModelChange: (modelId: string) => void;
  onApiKeyChange: (apiKey: string) => void;
  onBaseUrlChange: (baseUrl: string) => void;
  mode?: "full" | "dialog";
  step?: "provider" | "auth" | "model";
  onValidationStateChange?: (state: {
    requiresValidation: boolean;
    validated: boolean;
  }) => void;
}
