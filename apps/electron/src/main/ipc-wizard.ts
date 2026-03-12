import { ipcMain } from "electron";
import { WebSocket } from "ws";

let wsClient: WebSocket | null = null;
let pendingRequests = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let requestIdCounter = 0;
/** handshake 完成后才为 true，之后才允许发普通 RPC */
let handshakeDone = false;
/** handshake 完成后等待发送的队列 */
let pendingAfterHandshake: Array<() => void> = [];

/**
 * 连接到本机 Gateway WebSocket 并完成握手协议。
 * Gateway 握手流程：
 *   1. 连接建立 → Gateway 发 `connect.challenge`（含 nonce）
 *   2. 客户端收到后回发 `connect` 请求帧（含 auth.token）
 *   3. Gateway 返回 `connect` 响应（ok=true）→ 握手完成
 * 主进程的 WS 连接无浏览器 Origin 限制，可直接连本机 Gateway。
 */
function connectToGateway(port: number, token: string): void {
  if (wsClient && wsClient.readyState === WebSocket.OPEN) return;

  const url = `ws://127.0.0.1:${port}/`;
  wsClient = new WebSocket(url);
  handshakeDone = false;
  pendingAfterHandshake = [];

  const send = (obj: unknown) => {
    wsClient?.send(JSON.stringify(obj));
  };

  wsClient.on("message", (data: Buffer) => {
    try {
      const frame = JSON.parse(data.toString()) as {
        type?: string;
        event?: string;
        payload?: unknown;
        id?: string;
        ok?: boolean;
        result?: unknown;
        error?: { message?: string } | string;
      };

      // Gateway challenge → 回复 connect 请求帧
      if (frame.type === "event" && frame.event === "connect.challenge") {
        const payload = frame.payload as { nonce?: string } | undefined;
        const nonce = payload?.nonce ?? "";
        const connectId = String(++requestIdCounter);
        send({
          type: "req",
          id: connectId,
          method: "connect",
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
              id: "openclaw-macos",
              version: "electron",
              platform: process.platform,
              mode: "ui",
            },
            role: "operator",
            scopes: ["operator.admin"],
            auth: { token },
          },
        });
        // 等待 connect 响应
        pendingRequests.set(connectId, {
          resolve: () => {
            handshakeDone = true;
            console.log("[ipc-wizard] Gateway handshake complete");
            // 释放握手后等待的请求
            for (const fn of pendingAfterHandshake) fn();
            pendingAfterHandshake = [];
          },
          reject: (err) => {
            console.error("[ipc-wizard] Gateway handshake failed:", err.message);
            wsClient?.close();
          },
        });
        return;
      }

      // 普通响应帧
      if (frame.type === "res" && frame.id) {
        const pending = pendingRequests.get(frame.id);
        if (!pending) return;
        pendingRequests.delete(frame.id);
        if (frame.ok === false || frame.error) {
          const errMsg =
            typeof frame.error === "string"
              ? frame.error
              : ((frame.error as { message?: string } | undefined)?.message ?? "Gateway RPC error");
          pending.reject(new Error(errMsg));
        } else {
          // Gateway 响应帧结果在 payload 字段，不是 result
          pending.resolve(frame.payload ?? frame.result ?? frame);
        }
      }
    } catch {
      // 忽略解析错误
    }
  });

  wsClient.on("error", (err) => {
    console.warn("[ipc-wizard] Gateway WS error:", err.message);
  });

  wsClient.on("close", () => {
    console.log("[ipc-wizard] Gateway WS closed");
    wsClient = null;
    handshakeDone = false;
    // 清理所有挂起的请求
    for (const [, pending] of pendingRequests) {
      pending.reject(new Error("Gateway connection closed"));
    }
    pendingRequests.clear();
    pendingAfterHandshake = [];
  });
}

/**
 * 通过主进程 WS client 向 Gateway 发送 JSON-RPC 请求。
 * 若握手尚未完成，自动等待握手成功后再发送。
 */
async function gatewayRequest(method: string, params: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!wsClient || wsClient.readyState !== WebSocket.OPEN) {
      reject(new Error("Gateway WebSocket not connected"));
      return;
    }

    const doSend = () => {
      if (!wsClient || wsClient.readyState !== WebSocket.OPEN) {
        reject(new Error("Gateway WebSocket not connected"));
        return;
      }
      const id = String(++requestIdCounter);
      const payload = JSON.stringify({ type: "req", id, method, params });

      pendingRequests.set(id, { resolve, reject });

      wsClient.send(payload, (err) => {
        if (err) {
          pendingRequests.delete(id);
          reject(err);
        }
      });

      // 30 秒超时保护（wizard 步骤可能有 LLM 验证等耗时操作）
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error("Gateway RPC timeout"));
        }
      }, 30_000);
    };

    if (handshakeDone) {
      doSend();
    } else {
      // 握手未完成，等待后再发送（最多等待 10 秒）
      const timer = setTimeout(() => {
        const idx = pendingAfterHandshake.indexOf(sendAfterHandshake);
        if (idx !== -1) pendingAfterHandshake.splice(idx, 1);
        reject(new Error("Gateway handshake timeout"));
      }, 10_000);
      const sendAfterHandshake = () => {
        clearTimeout(timer);
        doSend();
      };
      pendingAfterHandshake.push(sendAfterHandshake);
    }
  });
}

/**
 * 注册 wizard IPC handler，并建立到 Gateway 的 WS 连接。
 * 在首次启动时，Gateway 就绪后调用此函数。
 */
/** HMR 重载时保留已运行的 wizard session ID */
let activeWizardSessionId: string | null = null;

/**
 * 注册 wizard IPC handler，并建立到 Gateway 的 WS 连接。
 */
export function registerWizardIpc(port: number, token: string): void {
  // 建立 WS 连接
  connectToGateway(port, token);

  // IPC handler：渲染进程 wizard RPC 请求 → 主进程 WS 转发
  ipcMain.handle("wizard:request", async (_, method: string, params: unknown) => {
    try {
      // HMR 安全：wizard.start 如果收到 "wizard already running"，
      // 自动用缓存的 sessionId 转为 wizard.status 查询已有 step
      if (method === "wizard.start" && activeWizardSessionId) {
        try {
          const status = await gatewayRequest("wizard.status", { sessionId: activeWizardSessionId }) as Record<string, unknown>;
          if (status && status.status === "running") {
            console.log(`[ipc-wizard] HMR: reusing active wizard session ${activeWizardSessionId}`);
            return { sessionId: activeWizardSessionId, done: false, step: status.step, status: "running" };
          }
        } catch {
          // session 已失效，清除缓存再重新启动
          activeWizardSessionId = null;
        }
      }

      const result = await gatewayRequest(method, params) as Record<string, unknown>;

      // 缓存 wizard.start 返回的 sessionId
      if (method === "wizard.start" && result && typeof result.sessionId === "string") {
        activeWizardSessionId = result.sessionId;
        console.log(`[ipc-wizard] wizard.start result: ${JSON.stringify(result)}`);
      }
      // wizard 完成／取消时清除缓存
      if (result && result.done === true) {
        activeWizardSessionId = null;
      }

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 还是收到 "wizard already running"（activeWizardSessionId 为空时），说明有残留 session
      // 不知道 sessionId，无法恢复，抛出错误让渲染层展示
      throw new Error(msg);
    }
  });
}

/**
 * 注销 wizard IPC handler，关闭 WS 连接（Onboarding 完成后调用）。
 */
export function unregisterWizardIpc(): void {
  ipcMain.removeHandler("wizard:request");
  activeWizardSessionId = null;
  if (wsClient) {
    wsClient.close();
    wsClient = null;
  }
  pendingRequests.clear();
}
