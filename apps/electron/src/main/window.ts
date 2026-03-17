import path from "node:path";
import { app, BrowserWindow, shell, session } from "electron";

/**
 * 解析渲染页面的加载目标。
 * 所有页面（setup + index）均从 ui-react 工程加载：
 * - 开发时：VITE_UI_REACT_URL (http://localhost:5174)
 * - 打包后：Resources/control-ui-react/
 */
const VITE_UI_REACT_URL = process.env.VITE_UI_REACT_URL?.replace(/\/$/, "");

function resolveRendererUrl(page: string): { type: "url"; url: string } | { type: "file"; path: string } {
  if (app.isPackaged) {
    return { type: "file", path: path.join(process.resourcesPath, "control-ui-react", `${page}.html`) };
  }
  if (VITE_UI_REACT_URL) {
    // For the main index page, load root "/" so React Router's createBrowserRouter
    // receives "/" as the initial URL (not "/index.html" which has no route match).
    const urlPath = page === "index" ? "/" : `/${page}.html`;
    return { type: "url", url: `${VITE_UI_REACT_URL}${urlPath}` };
  }
  // 静态产物模式（未设 VITE_UI_REACT_URL）
  return { type: "file", path: path.resolve(__dirname, "../../dist/control-ui-react", `${page}.html`) };
}

/**
 * 配置 session 的 CSP。
 * 统一对所有响应追加宽松策略，允许 Gateway HTTP/WS 资源和 Vite dev server。
 */
export function configureSession(port: number): void {
  const uiReactOrigin = VITE_UI_REACT_URL ?? "";

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          [
            `default-src 'self' file: http://127.0.0.1:${port} ws://127.0.0.1:${port}${uiReactOrigin ? ` ${uiReactOrigin}` : ""}`,
            `script-src 'self' 'unsafe-inline' 'unsafe-eval' file: http://127.0.0.1:${port}${uiReactOrigin ? ` ${uiReactOrigin}` : ""}`,
            `style-src 'self' 'unsafe-inline' file: http://127.0.0.1:${port}${uiReactOrigin ? ` ${uiReactOrigin}` : ""}`,
            `img-src 'self' data: blob: file: http://127.0.0.1:${port}${uiReactOrigin ? ` ${uiReactOrigin}` : ""}`,
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
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  return win;
}

/**
 * 加载 Electron 专属渲染页面。
 * - 开发时设了 VITE_DEV_SERVER_URL 则从 Vite dev server 加载（支持热更新）
 * - 否则从 file:// 静态产物加载
 * - opts.port / opts.token：注入到 URL hash，供 ui-react settings.store 读取
 */
export function loadRendererPage(
  win: BrowserWindow,
  page: string,
  opts?: { port: number; token: string },
): void {
  const target = resolveRendererUrl(page);

  // 构造携带 Gateway 连接信息的 hash
  const hash =
    opts
      ? `#gatewayUrl=${encodeURIComponent(`ws://127.0.0.1:${opts.port}`)}&token=${encodeURIComponent(opts.token)}`
      : "";

  win.once("ready-to-show", () => win.show());

  if (target.type === "url") {
    void win.loadURL(`${target.url}${hash}`);
  } else {
    // file:// 协议不支持直接加 hash，需用 loadURL 拼 file:// 路径
    if (hash) {
      void win.loadURL(`file://${target.path}${hash}`);
    } else {
      void win.loadFile(target.path);
    }
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
        void shell.openExternal(url);
      }
    }
  });
}
