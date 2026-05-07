import type {
  GatewayAgentAssistantData,
  GatewayAgentEventPayload,
  GatewayAgentLifecycleData,
  GatewayAgentToolData,
  GatewayChatEventPayload,
} from "@/components/chat/types";

function asPlainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function checkGatewayWsAgentPayload(payload: unknown): GatewayAgentEventPayload | null {
  const record = asPlainRecord(payload);
  if (!record) return null;
  const runId = record.runId;
  if (typeof runId !== "string" || !runId.trim()) return null;
  const stream = record.stream;
  if (typeof stream !== "string" || !stream.trim()) return null;
  const data = record.data;
  if (!asPlainRecord(data)) return null;
  return record as unknown as GatewayAgentEventPayload;
}

export function checkGatewayWsChatPayload(payload: unknown): GatewayChatEventPayload | null {
  const record = asPlainRecord(payload);
  if (!record) return null;
  return record as unknown as GatewayChatEventPayload;
}

export function checkGatewayAgentLifecycleData(data: unknown): GatewayAgentLifecycleData | null {
  const record = asPlainRecord(data);
  if (!record) return null;
  return record as unknown as GatewayAgentLifecycleData;
}

export function checkGatewayAgentToolData(data: unknown): GatewayAgentToolData | null {
  const record = asPlainRecord(data);
  if (!record) return null;
  return record as unknown as GatewayAgentToolData;
}

export function checkGatewayAgentAssistantData(data: unknown): GatewayAgentAssistantData | null {
  const record = asPlainRecord(data);
  if (!record) return null;
  return record as unknown as GatewayAgentAssistantData;
}
