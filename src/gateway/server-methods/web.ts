import { listChannelPlugins } from "../../channels/plugins/index.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateWebLoginStartParams,
  validateWebLoginWaitParams,
} from "../protocol/index.js";
import { formatForLog } from "../ws-log.js";
import type { GatewayRequestHandlers, RespondFn } from "./types.js";

const WEB_LOGIN_METHODS = new Set(["web.login.start", "web.login.wait"]);

const resolveWebLoginProvider = (channelHint?: string | null) => {
  const plugins = listChannelPlugins();
  // If caller specifies a channel, find that specific plugin
  if (channelHint) {
    const specific = plugins.find(
      (plugin) =>
        plugin.id === channelHint &&
        (plugin.gatewayMethods ?? []).some((method) => WEB_LOGIN_METHODS.has(method)),
    );
    if (specific) return specific;
  }
  // Fallback: first plugin that supports web login
  return (
    plugins.find((plugin) =>
      (plugin.gatewayMethods ?? []).some((method) => WEB_LOGIN_METHODS.has(method)),
    ) ?? null
  );
};

function resolveAccountId(params: unknown): string | undefined {
  return typeof (params as { accountId?: unknown }).accountId === "string"
    ? (params as { accountId?: string }).accountId
    : undefined;
}

function respondProviderUnavailable(respond: RespondFn) {
  respond(
    false,
    undefined,
    errorShape(ErrorCodes.INVALID_REQUEST, "web login provider is not available"),
  );
}

function respondProviderUnsupported(respond: RespondFn, providerId: string) {
  respond(
    false,
    undefined,
    errorShape(ErrorCodes.INVALID_REQUEST, `web login is not supported by provider ${providerId}`),
  );
}

export const webHandlers: GatewayRequestHandlers = {
  "web.login.start": async ({ params, respond, context }) => {
    if (!validateWebLoginStartParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid web.login.start params: ${formatValidationErrors(validateWebLoginStartParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const accountId = resolveAccountId(params);
      const channelHint = typeof (params as { channel?: unknown }).channel === "string"
        ? (params as { channel?: string }).channel
        : undefined;
      const provider = resolveWebLoginProvider(channelHint);
      if (!provider) {
        respondProviderUnavailable(respond);
        return;
      }
      await context.stopChannel(provider.id, accountId);
      if (!provider.gateway?.loginWithQrStart) {
        respondProviderUnsupported(respond, provider.id);
        return;
      }
      const result = await provider.gateway.loginWithQrStart({
        force: Boolean((params as { force?: boolean }).force),
        timeoutMs:
          typeof (params as { timeoutMs?: unknown }).timeoutMs === "number"
            ? (params as { timeoutMs?: number }).timeoutMs
            : undefined,
        verbose: Boolean((params as { verbose?: boolean }).verbose),
        accountId,
      });
      respond(true, result, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },
  "web.login.wait": async ({ params, respond, context }) => {
    if (!validateWebLoginWaitParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid web.login.wait params: ${formatValidationErrors(validateWebLoginWaitParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const accountId = resolveAccountId(params);
      const channelHint = typeof (params as { channel?: unknown }).channel === "string"
        ? (params as { channel?: string }).channel
        : undefined;
      const provider = resolveWebLoginProvider(channelHint);
      if (!provider) {
        respondProviderUnavailable(respond);
        return;
      }
      if (!provider.gateway?.loginWithQrWait) {
        respondProviderUnsupported(respond, provider.id);
        return;
      }
      const result = await provider.gateway.loginWithQrWait({
        timeoutMs:
          typeof (params as { timeoutMs?: unknown }).timeoutMs === "number"
            ? (params as { timeoutMs?: number }).timeoutMs
            : undefined,
        accountId,
        ...(typeof (params as { sessionKey?: unknown }).sessionKey === "string"
          ? { sessionKey: (params as { sessionKey?: string }).sessionKey }
          : {}),
      });
      if (result.connected) {
        await context.startChannel(provider.id, accountId);
      }
      respond(true, result, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },
};
