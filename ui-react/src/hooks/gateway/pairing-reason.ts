const PAIRING_REQUEST_ID_PATTERN = /requestId:\s*([0-9a-f-]{36})/i;

export function parsePairingRequestId(reason: string): string | null {
  const match = reason.match(PAIRING_REQUEST_ID_PATTERN);
  return match?.[1] ?? null;
}
