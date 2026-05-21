import path from "node:path";
import http from "node:http";
import fs from "node:fs";
import { app, BrowserWindow, shell, session, screen } from "electron";
import { readExistingGatewayToken } from "./gateway/index.js";
import { mainLogError, mainLogInfo, mainLogWarn } from "./logger.js";

// ---------------------------------------------------------------------------
// Static file server for packaged ui-react build
// Serves control-ui-react/ over http://127.0.0.1:PORT so the renderer
// origin is a valid loopback HTTP origin (not file://) — this lets Gateway's
// origin check pass without needing allowedOrigins hacks, and allows
// memory-core and other plugins to load normally.
// ---------------------------------------------------------------------------

let staticServer: http.Server | null = null;
let staticServerPort = 0;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
};

export function startStaticServer(rootDir: string): Promise<number> {
  if (staticServer) {
    return Promise.resolve(staticServerPort);
  }
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // Strip query string and hash for file lookup
      const urlPath = (req.url ?? "/").split("?")[0].split("#")[0];
      // Map / to /index.html; other paths serve directly or fall back to index.html (SPA)
      let filePath = path.join(rootDir, urlPath === "/" ? "index.html" : urlPath);
      if (!fs.existsSync(filePath)) {
        // SPA fallback: serve index.html for unknown routes
        filePath = path.join(rootDir, "index.html");
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME[ext] ?? "application/octet-stream";
      try {
        const data = fs.readFileSync(filePath);
        res.writeHead(200, { "Content-Type": contentType });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      staticServerPort = addr.port;
      staticServer = server;
      wlog(`[window] static server listening on http://127.0.0.1:${staticServerPort}`);
      resolve(staticServerPort);
    });
    server.on("error", reject);
  });
}

export function stopStaticServer(): void {
  staticServer?.close();
  staticServer = null;
  staticServerPort = 0;
}

export function getStaticServerPort(): number {
  return staticServerPort;
}

function wlog(msg: string): void {
  mainLogInfo(msg);
}
function wlogError(msg: string, detail?: unknown): void {
  mainLogError(msg, detail);
}
function wlogWarn(msg: string): void {
  mainLogWarn(msg);
}

const DEFAULT_GATEWAY_PORT = 18789;

/** Preferred baseline when the work area is large enough (matches prior fixed defaults). */
const PREFERRED_WIDTH = 1280;
const PREFERRED_HEIGHT = 800;
const ABS_MIN_WIDTH = 800;
const ABS_MIN_HEIGHT = 600;
/** Cap initial width so ultrawide work areas do not produce an overly wide window. */
const MAX_INITIAL_WIDTH = 1480;
/** Cap initial height on very tall work areas. */
const MAX_INITIAL_HEIGHT = 900;

/**
 * Initial window bounds: size from work area (larger on big monitors), centered on the
 * display under the cursor. Clamped so the window stays inside
 * `workArea` (dock / taskbar excluded).
 */
function getInitialWindowBounds(): {
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
} {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x: wx, y: wy, width: waW, height: waH } = display.workArea;

  const inset = 32;
  const maxW = Math.max(1, waW - inset);
  const maxH = Math.max(1, waH - inset);
  const minWidth = Math.min(ABS_MIN_WIDTH, maxW);
  const minHeight = Math.min(ABS_MIN_HEIGHT, maxH);

  let width = Math.round(waW * 0.84);
  let height = Math.round(waH * 0.88);

  if (waW >= PREFERRED_WIDTH + inset && waH >= PREFERRED_HEIGHT + inset) {
    width = Math.max(width, PREFERRED_WIDTH);
    height = Math.max(height, PREFERRED_HEIGHT);
  }

  width = Math.min(Math.max(width, minWidth), maxW, MAX_INITIAL_WIDTH);
  height = Math.min(Math.max(height, minHeight), maxH, MAX_INITIAL_HEIGHT);

  const winX = Math.round(wx + (waW - width) / 2);
  const winY = Math.round(wy + (waH - height) / 2);

  return {
    x: winX,
    y: winY,
    width,
    height,
    minWidth,
    minHeight,
  };
}

/**
 * Top-level navigations that leave the renderer origin (e.g. plain <a href="https://…">)
 * would load inside the Electron window and often break (CSP / blank page). Only
 * `loadGatewayUI` used to register this handler; the app actually loads via `loadRendererPage`,
 * so we install the same policy whenever the UI URL is known.
 */
function installExternalLinkNavigationHandlers(
  win: BrowserWindow,
  allowedPrefixes: string[],
): void {
  win.webContents.removeAllListeners("will-navigate");
  win.webContents.on("will-navigate", (event, url) => {
    if (allowedPrefixes.some((p) => url.startsWith(p))) {
      return;
    }
    event.preventDefault();
    if (
      url.startsWith("http://") ||
      url.startsWith("https://") ||
      url.startsWith("mailto:")
    ) {
      void shell.openExternal(url);
    }
  });
}

/**
 * 解析渲染页面的加载目标。
 * 所有页面（splash + setup + index）均从 ui-react 工程加载：
 * - 开发时：VITE_UI_REACT_URL (http://localhost:5174)
 * - 打包后：Resources/control-ui-react/
 */
const VITE_UI_REACT_URL = process.env.VITE_UI_REACT_URL?.replace(/\/$/, "");

function resolveRendererAuthToken(token: string): string {
  // Vite dev: prefer persisted config token over ephemeral sessionTokenForStartup.
  if (VITE_UI_REACT_URL && !app.isPackaged) {
    return readExistingGatewayToken()?.trim() || token;
  }
  return token;
}

function resolveRendererUrl(
  page: string,
): { type: "url"; url: string } | { type: "file"; path: string } {
  if (app.isPackaged) {
    // Use the embedded static server (http://127.0.0.1:PORT) so the renderer
    // has a valid loopback HTTP origin — avoids file:// origin issues with
    // Gateway's origin check and allows plugins like memory-core to load.
    const port = getStaticServerPort();
    if (port > 0) {
      const urlPath = page === "index" ? "/" : `/${page}.html`;
      return { type: "url", url: `http://127.0.0.1:${port}${urlPath}` };
    }
    // Fallback to file:// if static server not started yet
    return {
      type: "file",
      path: path.join(
        process.resourcesPath,
        "control-ui-react",
        `${page}.html`,
      ),
    };
  }
  if (VITE_UI_REACT_URL) {
    // For the main index page, load root "/" so React Router's createBrowserRouter
    // receives "/" as the initial URL (not "/index.html" which has no route match).
    const urlPath = page === "index" ? "/" : `/${page}.html`;
    return { type: "url", url: `${VITE_UI_REACT_URL}${urlPath}` };
  }
  // 静态产物模式（未设 VITE_UI_REACT_URL）
  return {
    type: "file",
    path: path.resolve(
      __dirname,
      "../../dist/control-ui-react",
      `${page}.html`,
    ),
  };
}

function buildRendererNavigationAllowList(
  target: ReturnType<typeof resolveRendererUrl>,
  gatewayPort: number,
): string[] {
  const list: string[] = [];
  if (target.type === "url") {
    try {
      list.push(new URL(target.url).origin);
    } catch {
      // ignore malformed dev URL
    }
  } else {
    list.push("file:");
  }
  list.push(
    `http://127.0.0.1:${gatewayPort}`,
    `http://localhost:${gatewayPort}`,
  );
  if (VITE_UI_REACT_URL) {
    try {
      list.push(new URL(VITE_UI_REACT_URL).origin);
    } catch {
      // ignore
    }
  }
  return Array.from(new Set(list));
}

/**
 * 配置 session 的 CSP。
 * 统一对所有响应追加宽松策略，允许 Gateway HTTP/WS 资源和 Vite dev server。
 * 同时注入 Origin header，使 file:// 页面的 WS 请求能通过 Gateway origin 校验。
 */
export function configureSession(port: number): void {
  const uiReactOrigin = VITE_UI_REACT_URL ?? "";

  // Inject a valid Origin header for WebSocket requests from file:// pages.
  // file:// pages send Origin: null which Gateway rejects. We rewrite it to
  // the loopback origin so Gateway's allowedOrigins check passes.
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: [`ws://127.0.0.1:${port}/*`, `http://127.0.0.1:${port}/*`] },
    (details, callback) => {
      const headers = { ...details.requestHeaders };
      if (!headers["Origin"] || headers["Origin"] === "null") {
        headers["Origin"] = `http://127.0.0.1:${port}`;
      }
      callback({ requestHeaders: headers });
    },
  );

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          [
            `default-src 'self' file: http://127.0.0.1:${port} ws://127.0.0.1:${port}${uiReactOrigin ? ` ${uiReactOrigin}` : ""}`,
            `script-src 'self' 'unsafe-inline' 'unsafe-eval' file: http://127.0.0.1:${port}${uiReactOrigin ? ` ${uiReactOrigin}` : ""}`,
            `style-src 'self' 'unsafe-inline' file: http://127.0.0.1:${port}${uiReactOrigin ? ` ${uiReactOrigin}` : ""}`,
            // Temporary: allow any image/media origin. Replace with a tighter allowlist once CDN/tool hosts are inventoried.
            // Previous img-src (CDNs for chat/markdown + agent assets + Vite when set):
            // `img-src 'self' data: blob: file: http://127.0.0.1:${port} http://store.is.autonavi.com https://store.is.autonavi.com https://aos-comment.amap.com https://img.alicdn.com https://files.aiverser.com${uiReactOrigin ? ` ${uiReactOrigin}` : ""}`,
            `img-src 'self' data: blob: file: http://127.0.0.1:${port} *`,
            // Previous media-src:
            // `media-src 'self' data: blob: file: http://127.0.0.1:${port} http://store.is.autonavi.com https://store.is.autonavi.com https://aos-comment.amap.com https://files.aiverser.com${uiReactOrigin ? ` ${uiReactOrigin}` : ""}`,
            `media-src 'self' data: blob: file: http://127.0.0.1:${port} *`,
            `font-src 'self' data: file: http://127.0.0.1:${port}${uiReactOrigin ? ` ${uiReactOrigin}` : ""}`,
            `connect-src 'self' file: http://127.0.0.1:${port} ws://127.0.0.1:${port} wss://127.0.0.1:${port}${uiReactOrigin ? ` ${uiReactOrigin} ws://localhost:5174` : ""}`,
          ].join("; "),
        ],
      },
    });
  });
}

/**
 * 创建主窗口（空窗口，不加载任何页面）。
 * 由 index.ts 根据首次启动状态决定加载内容。
 */
export function createWindow(): BrowserWindow {
  const bounds = getInitialWindowBounds();
  const isDarwin = process.platform === "darwin";
  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: bounds.minWidth,
    minHeight: bounds.minHeight,
    titleBarStyle: "hiddenInset",
    ...(isDarwin
      ? {
          trafficLightPosition: { x: 16, y: 16 },
          // Exposes env(titlebar-area-x/y/width/height) in the renderer (Window Controls Overlay).
          titleBarOverlay: { height: 48 },
        }
      : {}),
    backgroundColor: "#1a1a1a",
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, '../../resources/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // 监听渲染进程异常和日志
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    wlogError(`[window] did-fail-load: code=${code} desc=${desc} url=${url}`);
  });
  win.webContents.on("render-process-gone", (_e, details) => {
    wlogError(
      `[window] render-process-gone: reason=${details.reason} exitCode=${details.exitCode}`,
    );
  });
  win.webContents.on(
    "console-message",
    (_e, level, message, line, sourceId) => {
      // level: 0=verbose 1=info 2=warning 3=error — file log: warn/error only
      if (level === 0) return;
      if (message.includes("Insecure Content-Security-Policy")) return;
      if (message.includes("Download the React DevTools")) return;
      const loc = ` (${sourceId}:${line})`;
      if (level >= 3) {
        wlogError(`[renderer] ${message}${loc}`);
      } else if (level >= 2) {
        wlogWarn(`[renderer] ${message}${loc}`);
      } else {
        mainLogInfo(`[renderer] ${message}${loc}`);
      }
    },
  );

  // 拦截外链，在系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  return win;
}

export type LoadRendererPageOpts = {
  port: number;
  token: string;
  /** Splash already showed the window; skip ready-to-show gate. */
  windowAlreadyVisible?: boolean;
};

/**
 * 加载 Electron 专属渲染页面。
 * - 开发时设了 VITE_DEV_SERVER_URL 则从 Vite dev server 加载（支持热更新）
 * - 否则从 file:// 静态产物加载
 * - opts.port / opts.token：注入到 URL query，供 ui-react settings.store 读取
 */
export function loadRendererPage(
  win: BrowserWindow,
  page: string,
  opts?: LoadRendererPageOpts,
): void {
  const target = resolveRendererUrl(page);
  const gatewayPort = opts?.port ?? DEFAULT_GATEWAY_PORT;
  installExternalLinkNavigationHandlers(
    win,
    buildRendererNavigationAllowList(target, gatewayPort),
  );
  wlog(
    `[window] loadRendererPage: page=${page} type=${target.type} path/url=${"path" in target ? target.path : target.url}`,
  );

  // 打包后检查 HTML 文件是否存在
  if (target.type === "file") {
    const exists = fs.existsSync(target.path);
    wlog(`[window] html file exists=${exists}: ${target.path}`);
    if (!exists) {
      wlogError(`[window] HTML 文件不存在：${target.path}`);
    }
  }

  const authToken =
    opts != null ? resolveRendererAuthToken(opts.token) : "";
  const query =
    opts != null
      ? `?gatewayUrl=${encodeURIComponent(`ws://127.0.0.1:${opts.port}`)}&token=${encodeURIComponent(authToken)}`
      : "";

  const alreadyVisible = opts?.windowAlreadyVisible === true;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  if (!alreadyVisible) {
    showTimer = setTimeout(() => {
      wlogError(`[window] ready-to-show 超时！强制显示窗口 (page=${page})`);
      win.show();
    }, 5000);

    win.once("ready-to-show", () => {
      if (showTimer) clearTimeout(showTimer);
      wlog(`[window] ready-to-show 触发，显示窗口 (page=${page})`);
      win.show();
    });
  } else {
    wlog(`[window] loadRendererPage: window already visible (page=${page})`);
  }

  if (target.type === "url") {
    wlog(`[window] loadURL: ${target.url}${query}`);
    void win.loadURL(`${target.url}${query}`);
  } else if (query) {
    wlog(`[window] loadURL (file+query): file://${target.path}${query}`);
    void win.loadURL(`file://${target.path}${query}`);
  } else {
    wlog(`[window] loadFile: ${target.path}`);
    void win.loadFile(target.path);
  }
}

/** Boot splash (no Gateway query params). */
export function loadSplashPage(win: BrowserWindow): void {
  const target = resolveRendererUrl("splash");
  const gatewayPort = DEFAULT_GATEWAY_PORT;
  installExternalLinkNavigationHandlers(
    win,
    buildRendererNavigationAllowList(target, gatewayPort),
  );
  wlog(`[window] loadSplashPage: type=${target.type}`);

  win.show();

  if (target.type === "url") {
    void win.loadURL(target.url);
  } else {
    void win.loadFile(target.path);
  }
}

/**
 * 加载 Gateway Control UI（http:// 协议）。
 * 通过 hash 参数传递 gatewayUrl + token，由 SPA 自动连接。
 */
export function loadGatewayUI(
  win: BrowserWindow,
  opts: { port: number; token: string },
): void {
  const wsUrl = `ws://127.0.0.1:${opts.port}`;
  const loadUrl = `http://127.0.0.1:${opts.port}/#gatewayUrl=${encodeURIComponent(wsUrl)}&token=${opts.token}`;

  // 每次加载都重新监听 ready-to-show（切换内容时窗口已经 show，需要处理重复调用）
  const onReady = () => win.show();
  win.once("ready-to-show", onReady);

  void win.loadURL(loadUrl);

  installExternalLinkNavigationHandlers(win, [
    `http://127.0.0.1:${opts.port}`,
    `http://localhost:${opts.port}`,
  ]);
}
