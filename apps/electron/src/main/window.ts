import path from "node:path";
import { app, BrowserWindow, shell, session } from "electron";

/**
 * 解析 Electron 专属渲染页面（renderer 工程产物）的加载目标。
 * - 打包后：Resources/renderer/<page>.html
 * - 开发时：若设了 VITE_DEV_SERVER_URL，从 Vite dev server 加载（热更新）
 *              否则从 apps/electron/renderer/dist/<page>.html 加载
 */
const VITE_DEV_URL = process.env.VITE_DEV_SERVER_URL?.replace(/\/$/, "");

function resolveRendererUrl(page: string): { type: "url"; url: string } | { type: "file"; path: string } {
  if (app.isPackaged) {
    return { type: "file", path: path.join(process.resourcesPath, "renderer", `${page}.html`) };
  }
  if (VITE_DEV_URL) {
    // Vite dev server 模式：从 http://localhost:5173/<page>.html 加载
    return { type: "url", url: `${VITE_DEV_URL}/${page}.html` };
  }
  // 静态产物模式：__dirname = dist/main/，向上 2 级到 apps/electron/，再进入 renderer/dist/
  return { type: "file", path: path.resolve(__dirname, "../../renderer/dist", `${page}.html`) };
}

/**
 * 配置 session 的 CSP。
 * 统一对所有响应追加宽松策略，允许 Gateway HTTP/WS 资源。
 */
export function configureSession(port: number): void {
  // Vite dev server origin（开发时热更新）
  const viteOrigin = VITE_DEV_URL ?? "";
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          [
            `default-src 'self' file: http://127.0.0.1:${port} ws://127.0.0.1:${port}${viteOrigin ? ` ${viteOrigin}` : ""}`,
            `script-src 'self' 'unsafe-inline' 'unsafe-eval' file: http://127.0.0.1:${port}${viteOrigin ? ` ${viteOrigin}` : ""}`,
            `style-src 'self' 'unsafe-inline' file: http://127.0.0.1:${port}${viteOrigin ? ` ${viteOrigin}` : ""}`,
            `img-src 'self' data: blob: file: http://127.0.0.1:${port}${viteOrigin ? ` ${viteOrigin}` : ""}`,
            `font-src 'self' data: file: http://127.0.0.1:${port}${viteOrigin ? ` ${viteOrigin}` : ""}`,
            `connect-src 'self' file: http://127.0.0.1:${port} ws://127.0.0.1:${port} wss://127.0.0.1:${port}${viteOrigin ? ` ${viteOrigin} ws://localhost:5173` : ""}`,
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
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#1a1a1a",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // 拦截外链，在系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  return win;
}

/**
 * 加载 Electron 专属渲染页面。
 * - 开发时设了 VITE_DEV_SERVER_URL 则从 Vite dev server 加载（支持热更新）
 * - 否则从 file:// 静态产物加载
 */
export function loadRendererPage(win: BrowserWindow, page: string): void {
  const target = resolveRendererUrl(page);

  win.once("ready-to-show", () => win.show());

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

  // 切换到 Control UI 后，拦截页面内导航，只允许在 Gateway origin 内跳转
  win.webContents.removeAllListeners("will-navigate");
  win.webContents.on("will-navigate", (event, url) => {
    const gatewayBase = `http://127.0.0.1:${opts.port}`;
    if (!url.startsWith(gatewayBase)) {
      event.preventDefault();
      if (url.startsWith("http://") || url.startsWith("https://")) {
        shell.openExternal(url);
      }
    }
  });
}
