import { getPublicKeyAsync, signAsync, utils as ed25519utils } from "@noble/ed25519";

const DEVICE_STORAGE_KEY = "openclaw-device-identity-v1";

type StoredDeviceIdentity = {
  version: 1;
  deviceId: string;
  publicKey: string; // base64url raw 32-byte Ed25519 public key
  privateKey: string; // base64url raw 32-byte Ed25519 private key
  createdAtMs: number;
};

function b64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecode(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function fingerprintEd25519PublicKey(publicKey: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", publicKey.slice().buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function loadOrCreateDeviceIdentity(): Promise<{
  deviceId: string;
  publicKey: string;
  privateKey: string;
}> {
  try {
    const raw = localStorage.getItem(DEVICE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredDeviceIdentity;
      if (
        parsed?.version === 1 &&
        typeof parsed.deviceId === "string" &&
        typeof parsed.publicKey === "string" &&
        typeof parsed.privateKey === "string"
      ) {
        const derivedId = await fingerprintEd25519PublicKey(b64urlDecode(parsed.publicKey));
        if (derivedId !== parsed.deviceId) {
          const updated: StoredDeviceIdentity = { ...parsed, deviceId: derivedId };
          localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(updated));
          return {
            deviceId: derivedId,
            publicKey: parsed.publicKey,
            privateKey: parsed.privateKey,
          };
        }
        return {
          deviceId: parsed.deviceId,
          publicKey: parsed.publicKey,
          privateKey: parsed.privateKey,
        };
      }
    }
  } catch {
    // fall through to regenerate
  }

  const privateKeyBytes = ed25519utils.randomSecretKey();
  const publicKeyBytes = await getPublicKeyAsync(privateKeyBytes);
  const deviceId = await fingerprintEd25519PublicKey(publicKeyBytes);
  const identity = {
    deviceId,
    publicKey: b64urlEncode(publicKeyBytes),
    privateKey: b64urlEncode(privateKeyBytes),
  };
  const stored: StoredDeviceIdentity = {
    version: 1,
    ...identity,
    createdAtMs: Date.now(),
  };
  localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(stored));
  return identity;
}

export function buildDevicePayload(opts: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  signedAtMs: number;
  nonce: string;
  token: string | null;
  role: string;
  scopes: string[];
}): string {
  const scopes = opts.scopes.join(",");
  const token = opts.token ?? "";
  return [
    "v2",
    opts.deviceId,
    opts.clientId,
    opts.clientMode,
    opts.role,
    scopes,
    String(opts.signedAtMs),
    token,
    opts.nonce,
  ].join("|");
}

export async function signDevicePayload(
  privateKeyBase64Url: string,
  payload: string,
): Promise<string> {
  const key = b64urlDecode(privateKeyBase64Url);
  const data = new TextEncoder().encode(payload);
  const sig = await signAsync(data, key);
  return b64urlEncode(sig);
}
