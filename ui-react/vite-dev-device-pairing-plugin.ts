import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import type { Plugin } from "vite";
import { approveDevicePairingRequest } from "./vite-dev-device-pairing-rpc.js";

const PLUGIN_ROUTE = "/__openclaw/dev/approve-device-pairing";

function isLoopbackRequest(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress ?? "";
  return (
    addr === "127.0.0.1" ||
    addr === "::1" ||
    addr === "::ffff:127.0.0.1" ||
    addr.endsWith("127.0.0.1")
  );
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function readGatewayTokenFromConfig(): string {
  const override = process.env.OPENCLAW_CONFIG_DIR?.trim();
  const baseDir = override || path.join(os.homedir(), ".openclaw");
  const cfgPath = path.join(baseDir, "openclaw.json");
  try {
    const raw = fs.readFileSync(cfgPath, "utf8");
    const cfg = JSON.parse(raw) as {
      gateway?: { auth?: { token?: unknown } };
    };
    const token = cfg.gateway?.auth?.token;
    return typeof token === "string" ? token.trim() : "";
  } catch {
    return "";
  }
}

function resolveDevGatewayToken(bodyToken: unknown): string {
  if (typeof bodyToken === "string" && bodyToken.trim()) {
    return bodyToken.trim();
  }
  const fromEnv = process.env.VITE_GATEWAY_TOKEN?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return readGatewayTokenFromConfig();
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

/** Dev-only: approve Control UI device pairing when ui-react runs in a plain browser. */
export function devDevicePairingPlugin(): Plugin {
  return {
    name: "openclaw-dev-device-pairing",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== PLUGIN_ROUTE) {
          next();
          return;
        }
        if (req.method !== "POST") {
          sendJson(res, 405, { ok: false, error: "method not allowed" });
          return;
        }
        if (!isLoopbackRequest(req)) {
          sendJson(res, 403, { ok: false, error: "loopback only" });
          return;
        }
        try {
          const body = (await readJsonBody(req)) as { requestId?: unknown; token?: unknown };
          const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
          if (!requestId) {
            sendJson(res, 400, { ok: false, error: "requestId required" });
            return;
          }
          const token = resolveDevGatewayToken(body.token);
          if (!token) {
            sendJson(res, 400, {
              ok: false,
              error: "gateway token missing (set VITE_GATEWAY_TOKEN or pass token in body)",
            });
            return;
          }
          const port = Number.parseInt(process.env.VITE_GATEWAY_PORT ?? "18789", 10);
          const result = await approveDevicePairingRequest({ requestId, token, port });
          sendJson(res, result.ok ? 200 : 500, result);
        } catch (err) {
          sendJson(res, 500, { ok: false, error: String(err) });
        }
      });
    },
  };
}
