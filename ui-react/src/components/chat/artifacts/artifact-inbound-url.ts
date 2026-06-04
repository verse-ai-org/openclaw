/** Build Control UI assistant-media URL for inbound `media://` refs. */
export function buildAssistantMediaUrl(params: {
  gatewayUrl: string;
  token: string;
  mediaRef: string;
}): string | undefined {
  const mediaRef = params.mediaRef.trim();
  if (!mediaRef.startsWith("media://")) {
    return undefined;
  }
  const gatewayUrl = params.gatewayUrl.trim();
  if (!gatewayUrl) {
    return undefined;
  }
  let httpBase = gatewayUrl;
  if (httpBase.startsWith("ws://")) {
    httpBase = `http://${httpBase.slice("ws://".length)}`;
  } else if (httpBase.startsWith("wss://")) {
    httpBase = `https://${httpBase.slice("wss://".length)}`;
  }
  const url = new URL("/__openclaw__/assistant-media", httpBase);
  url.searchParams.set("source", mediaRef);
  const token = params.token.trim();
  if (token) {
    url.searchParams.set("token", token);
  }
  return url.toString();
}
