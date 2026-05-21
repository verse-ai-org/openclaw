import type { BrowserWindow } from "electron";
import { app, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";
import {
  warmLoginShellEnv,
  startGateway,
  onGatewayCrash,
  getGatewayPort,
  getGatewayToken,
  isGatewayHealthy,
} from "./gateway/index.js";
import { isFirstLaunch } from "./onboarding.js";
import type { StartupPhasePayload, StartupPipelineResult } from "./startup-types.js";
import { loadRendererPage, loadSplashPage } from "./window.js";
import { mainLogInfo, mainLogNote, mainLogWarn } from "./logger.js";

const DEFAULT_GATEWAY_PORT = 18789;

/** Last emitted phase so splash can catch up after late subscribe. */
let phaseBuffer: StartupPhasePayload | null = null;

export function shouldSkipSplash(): boolean {
  if (process.env.BOSSIM_SKIP_SPLASH === "1") {
    return true;
  }
  return false;
}

/** Boot splash is for returning users; first-time install goes straight to setup wizard. */
export function shouldUseBootSplash(): boolean {
  return !shouldSkipSplash() && !isFirstLaunch();
}

export type StartupPipelineContext = {
  mainWindow: BrowserWindow;
  sessionToken: string;
  staticServerPort: number;
  /** When false, startup phases are not pushed to the renderer (no splash UI). */
  useBootSplash: boolean;
  /** Setup page was loaded before the pipeline finished (first launch). */
  setupPreloaded: boolean;
  patchConfigForElectron: (staticPort: number) => void;
  registerWizardIpc: (port: number, token: string) => void;
  log: (msg: string) => void;
  logError: (msg: string, err?: unknown) => void;
};

let pipelineRunning = false;
let registeredStartupHandlers = false;

function waitForWebContentsLoad(win: BrowserWindow): Promise<void> {
  if (win.webContents.isLoading()) {
    return new Promise((resolve) => {
      win.webContents.once("did-finish-load", () => resolve());
    });
  }
  return Promise.resolve();
}

/** Wait until splash HTML has loaded so IPC listeners can attach. */
export async function waitForSplashReady(win: BrowserWindow): Promise<void> {
  if (win.webContents.isLoading()) {
    await new Promise<void>((resolve) => {
      win.webContents.once("did-finish-load", () => resolve());
    });
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 32);
  });
}

function emitPhase(
  win: BrowserWindow,
  startedAt: number,
  payload: Omit<StartupPhasePayload, "elapsedMs"> & { elapsedMs?: number },
  options?: { pushToRenderer?: boolean },
): void {
  const full: StartupPhasePayload = {
    ...payload,
    elapsedMs: payload.elapsedMs ?? Date.now() - startedAt,
  };
  phaseBuffer = full;
  const pushToRenderer = options?.pushToRenderer ?? true;
  if (full.phase === "failed") {
    mainLogWarn(
      `[startup] failed phase=${full.phase} error=${full.error ?? ""} elapsed=${full.elapsedMs}ms`,
    );
  } else if (full.phase === "ready") {
    mainLogNote(`[startup] ready elapsed=${full.elapsedMs}ms`);
  } else {
    mainLogInfo(
      `[startup] phase=${full.phase} message=${full.message ?? ""} elapsed=${full.elapsedMs}ms`,
    );
  }
  if (pushToRenderer && !win.isDestroyed()) {
    win.webContents.send("startup:phase", full);
  }
}

export function getBufferedStartupPhase(): StartupPhasePayload | null {
  return phaseBuffer;
}

async function navigateToApp(
  ctx: StartupPipelineContext,
  result: StartupPipelineResult,
  startedAt: number,
): Promise<void> {
  const { mainWindow, registerWizardIpc, useBootSplash, setupPreloaded } = ctx;
  const { port, token, firstLaunch } = result;

  if (firstLaunch) {
    mainLogNote("[startup] first launch → setup wizard");
    registerWizardIpc(port, token);
    if (!setupPreloaded) {
      loadRendererPage(mainWindow, "setup", {
        port,
        token,
        windowAlreadyVisible: true,
      });
      await waitForWebContentsLoad(mainWindow);
    }
    return;
  }

  emitPhase(
    mainWindow,
    startedAt,
    { phase: "workspace", message: "Starting workspace…" },
    { pushToRenderer: useBootSplash },
  );
  mainLogInfo("[startup] loading main UI");
  loadRendererPage(mainWindow, "index", {
    port,
    token,
    windowAlreadyVisible: true,
  });
  await waitForWebContentsLoad(mainWindow);
  emitPhase(
    mainWindow,
    startedAt,
    { phase: "ready", message: "Starting Bossim…" },
    { pushToRenderer: useBootSplash },
  );
}

export async function runStartupPipeline(
  ctx: StartupPipelineContext,
): Promise<StartupPipelineResult> {
  if (pipelineRunning) {
    throw new Error("Startup pipeline already running");
  }
  pipelineRunning = true;
  phaseBuffer = null;
  const startedAt = Date.now();
  const {
    mainWindow,
    sessionToken,
    staticServerPort,
    logError,
    patchConfigForElectron,
    useBootSplash,
  } = ctx;

  let gatewayStarted = false;

  const emitGateway = (message: string) => {
    if (!useBootSplash) {
      return;
    }
    emitPhase(mainWindow, startedAt, { phase: "gateway", message });
  };

  try {
    if (useBootSplash) {
      emitPhase(mainWindow, startedAt, {
        phase: "starting",
        message: "Starting application…",
      });
    }
    await warmLoginShellEnv();
    patchConfigForElectron(staticServerPort);

    try {
      await startGateway({
        token: sessionToken,
        onProgress: emitGateway,
      });
      gatewayStarted = true;
      mainLogNote("[startup] gateway started");
      onGatewayCrash((code, signal) => {
        mainLogWarn(`[startup] gateway crashed code=${code} signal=${signal}`);
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send("gateway:crashed", { code, signal });
        }
      });
    } catch (err) {
      logError("[startup] Gateway 启动失败:", err);
      emitPhase(
        mainWindow,
        startedAt,
        {
          phase: "failed",
          message: "Failed to start service",
          error: String(err),
        },
        { pushToRenderer: useBootSplash },
      );
    }

    const port = getGatewayPort();
    const token = getGatewayToken();
    const firstLaunch = isFirstLaunch();

    const result: StartupPipelineResult = {
      gatewayStarted,
      port,
      token,
      firstLaunch,
    };

    if (gatewayStarted) {
      await navigateToApp(ctx, result, startedAt);
    } else {
      mainLogWarn(
        useBootSplash
          ? "[startup] gateway not ready, staying on splash"
          : "[startup] gateway not ready (setup may be limited until retry)",
      );
    }

    return result;
  } finally {
    pipelineRunning = false;
  }
}

export function registerStartupIpc(
  getContext: () => StartupPipelineContext | null,
): void {
  if (registeredStartupHandlers) {
    return;
  }
  registeredStartupHandlers = true;

  ipcMain.handle("startup:get-phase", () => getBufferedStartupPhase());

  ipcMain.handle("startup:retry", async () => {
    const ctx = getContext();
    if (!ctx) {
      return { ok: false, error: "Startup context unavailable" };
    }
    try {
      const win = ctx.mainWindow;
      if (!win.isDestroyed() && shouldUseBootSplash()) {
        loadSplashPage(win);
        await waitForSplashReady(win);
      }
      await runStartupPipeline(ctx);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
}

/** Dev/static: serve ui-react build when not packaged and no Vite dev URL. */
export async function resolveDevStaticServerPort(
  startStaticServer: (rootDir: string) => Promise<number>,
): Promise<number> {
  if (app.isPackaged || process.env.VITE_UI_REACT_URL?.trim()) {
    return 0;
  }
  const uiReactDir = path.resolve(__dirname, "../../dist/control-ui-react");
  if (!fs.existsSync(path.join(uiReactDir, "splash.html"))) {
    return 0;
  }
  return startStaticServer(uiReactDir);
}

export { DEFAULT_GATEWAY_PORT, isFirstLaunch, isGatewayHealthy };
