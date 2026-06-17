const DEFAULT_SERVICE_BASE_URL =
  "https://bossim-service-production.up.railway.app";

function resolveServiceBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_BOSSIM_SERVICE_URL?.trim();
  return fromEnv || DEFAULT_SERVICE_BASE_URL;
}

export const CONFIG = {
  websiteUrl: "https://aiverser.com",
  authAppUrl: "https://aiverser.com/auth/app",
  bffBaseUrl: "https://aiverser.com",
  serviceBaseUrl: resolveServiceBaseUrl(),
};
