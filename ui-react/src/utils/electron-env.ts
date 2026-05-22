import type { CSSProperties } from "react";

/** Subset of `window.electronBridge` used for renderer environment checks. */
export type ElectronBridgeEnv = {
  platform?: string;
  isElectron?: boolean;
  getPathForFile?: (file: File) => string;
};

export function getElectronBridge(): ElectronBridgeEnv | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return (window as Window & { electronBridge?: ElectronBridgeEnv }).electronBridge;
}

export function isMacOSElectron(): boolean {
  return getElectronBridge()?.platform === "darwin";
}

/**
 * Right edge of the OS window-controls rectangle from the viewport inline-start,
 * per Window Controls Overlay / `titleBarOverlay` (see Electron custom title bar tutorial).
 */
export const TITLEBAR_CONTROLS_INSET_END = `calc(env(titlebar-area-x, 0px) + env(titlebar-area-width, 0px))`;

/**
 * When `env(titlebar-area-*)` is unavailable, keep prior layout (Tailwind `translate-x-16` = 4rem).
 */
export const MACOS_TITLEBAR_CONTROLS_INSET_FALLBACK_PX = 64;

/**
 * Inline-start padding so content clears traffic lights / caption buttons.
 * Use only when the adjacent chrome (e.g. inset sidebar) no longer reserves that band.
 */
export function macOSTitleBarControlsPaddingInlineStartStyle(
  enabled: boolean,
): Pick<CSSProperties, "paddingInlineStart"> | undefined {
  if (!enabled) {
    return undefined;
  }
  return {
    paddingInlineStart: `68px`,
  };
}
