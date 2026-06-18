const DEFAULT_SERVICE_BASE_URL =
  "https://bossim-service-production.up.railway.app";
const DEFAULT_BFF_BASE_URL = "https://aiverser.com";
const DEFAULT_AUTH_APP_URL = "https://aiverser.com/auth/app";

function resolveServiceBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_BOSSIM_SERVICE_URL?.trim();
  return fromEnv || DEFAULT_SERVICE_BASE_URL;
}

function resolveBffBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_BOSSIM_BFF_URL?.trim();
  return fromEnv || DEFAULT_BFF_BASE_URL;
}

function resolveAuthAppUrl(): string {
  const fromEnv = import.meta.env.VITE_BOSSIM_AUTH_APP_URL?.trim();
  return fromEnv || DEFAULT_AUTH_APP_URL;
}

export const CONFIG = {
  websiteUrl: resolveBffBaseUrl(),
  authAppUrl: resolveAuthAppUrl(),
  bffBaseUrl: resolveBffBaseUrl(),
  serviceBaseUrl: resolveServiceBaseUrl(),
};
