/** Dev-only browser pairing approve via Vite middleware (no Electron main process). */
export async function approveDevicePairingInDev(params: {
  requestId: string;
  token: string;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/__openclaw/dev/approve-device-pairing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  try {
    return (await res.json()) as { ok: boolean; error?: string };
  } catch {
    return { ok: false, error: `HTTP ${res.status}` };
  }
}
