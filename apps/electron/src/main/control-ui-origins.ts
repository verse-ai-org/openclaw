/** Electron-managed UI static server origin (127.0.0.1 + ephemeral port). */
export function isElectronManagedStaticOrigin(origin: string, gatewayPort: number): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") {
      return false;
    }
    const port = url.port ? Number.parseInt(url.port, 10) : 80;
    if (!Number.isFinite(port) || port <= 0) {
      return false;
    }
    return port !== gatewayPort;
  } catch {
    return false;
  }
}

export type MergeElectronControlUiOriginsParams = {
  /** Prior config entries; stale electron static ports are pruned. */
  existing?: readonly string[];
  gatewayPort: number;
  /** Current session static server port; 0 if unavailable. */
  staticServerPort?: number;
  devUiUrl?: string;
};

/**
 * Build gateway.controlUi.allowedOrigins for Electron:
 * - keep gateway loopback origins, file://, dev UI, user-added origins
 * - drop stale http://127.0.0.1:<ephemeral> from old static-server launches
 * - ensure the current static-server origin is present when running
 */
export function mergeElectronControlUiAllowedOrigins(
  params: MergeElectronControlUiOriginsParams,
): string[] {
  const gatewayPort = params.gatewayPort;
  const staticServerPort = params.staticServerPort ?? 0;
  const required = new Set<string>([
    `http://127.0.0.1:${gatewayPort}`,
    `http://localhost:${gatewayPort}`,
    "file://",
  ]);

  const devUiUrl = params.devUiUrl?.trim();
  if (devUiUrl) {
    try {
      required.add(new URL(devUiUrl).origin);
    } catch {
      // ignore malformed dev URL
    }
  }

  if (staticServerPort > 0) {
    required.add(`http://127.0.0.1:${staticServerPort}`);
  }

  const keptExisting: string[] = [];
  for (const raw of params.existing ?? []) {
    const origin = raw.trim();
    if (!origin) {
      continue;
    }
    if (isElectronManagedStaticOrigin(origin, gatewayPort)) {
      const port = Number.parseInt(new URL(origin).port, 10);
      if (port === staticServerPort && staticServerPort > 0) {
        keptExisting.push(origin);
      }
      continue;
    }
    keptExisting.push(origin);
  }

  return [...new Set([...keptExisting, ...required])];
}

/** Fresh onboarding defaults without merging prior stale static ports. */
export function resolveElectronControlUiAllowedOrigins(
  gatewayPort: number,
  opts?: { staticServerPort?: number; devUiUrl?: string },
): string[] {
  return mergeElectronControlUiAllowedOrigins({
    gatewayPort,
    staticServerPort: opts?.staticServerPort,
    devUiUrl: opts?.devUiUrl ?? process.env.VITE_UI_REACT_URL,
  });
}
