function parseHash(hash: string): { routePath: string; query: URLSearchParams } {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const [routePath, queryString = ""] = raw.split("?", 2);
  return {
    routePath: routePath || "/",
    query: new URLSearchParams(queryString),
  };
}

export function getSessionKeyFromHash(
  hash = typeof window !== "undefined" ? window.location.hash : "",
): string | undefined {
  if (!hash) {
    return undefined;
  }
  const { query } = parseHash(hash);
  const key = query.get("sessionKey");
  return key && key.trim() ? key.trim() : undefined;
}

export function buildHashWithSessionKey(
  currentHash: string,
  sessionKey: string,
): string {
  const { routePath, query } = parseHash(currentHash);
  query.set("sessionKey", sessionKey);
  const queryString = query.toString();
  return `#${routePath}${queryString ? `?${queryString}` : ""}`;
}

export function setSessionKeyInHash(sessionKey: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const nextHash = buildHashWithSessionKey(window.location.hash, sessionKey);
  if (nextHash !== window.location.hash) {
    window.history.replaceState(null, "", nextHash);
  }
}
