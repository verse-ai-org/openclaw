import { listChannelPlugins } from "../../channels/plugins/index.js";
import type { ChannelId } from "../../channels/plugins/types.public.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  type WebLoginStartParams,
  type WebLoginWaitParams,
  validateWebLoginStartParams,
  validateWebLoginWaitParams,
} from "../protocol/index.js";
import { formatForLog } from "../ws-log.js";
import type { GatewayRequestHandlers, RespondFn } from "./types.js";

const WEB_LOGIN_METHODS = new Set(["web.login.start", "web.login.wait"]);

const resolveWebLoginProvider = (channelHint?: string | null) => {
  const plugins = listChannelPlugins();
  const supportsWebLogin = (plugin: (typeof plugins)[number]) => {
    if (plugin.gateway?.loginWithQrStart || plugin.gateway?.loginWithQrWait) {
      return true;
    }
    return [
      ...(plugin.gatewayMethods ?? []),
      ...(plugin.gatewayMethodDescriptors ?? []).map((descriptor) => descriptor.name),
    ].some((method) => WEB_LOGIN_METHODS.has(method));
  };
  if (channelHint) {
    const specific = plugins.find((plugin) => plugin.id === channelHint && supportsWebLogin(plugin));
    if (specific) {
      return specific;
    }
  }
  return plugins.find((plugin) => supportsWebLogin(plugin)) ?? null;
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

function wasChannelRunning(params: {
  context: Parameters<GatewayRequestHandlers["web.login.start"]>[0]["context"];
  channelId: ChannelId;
  accountId?: string;
}): boolean {
  const runtime = params.context.getRuntimeSnapshot();
  if (params.accountId) {
    const accountRuntime = runtime.channelAccounts[params.channelId]?.[params.accountId];
    if (accountRuntime) {
      return accountRuntime.running === true;
    }
  }
  if (!params.accountId) {
    return runtime.channels[params.channelId]?.running === true;
  }
  const defaultRuntime = runtime.channels[params.channelId];
  return defaultRuntime?.accountId === params.accountId && defaultRuntime.running === true;
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
      const loginParams = params as WebLoginStartParams;
      const accountId = resolveAccountId(loginParams);
      const channelHint = loginParams.channel;
      const provider = resolveWebLoginProvider(channelHint);
      if (!provider) {
        respondProviderUnavailable(respond);
        return;
      }
      if (!provider.gateway?.loginWithQrStart) {
        respondProviderUnsupported(respond, provider.id);
        return;
      }
      const wasRunning = wasChannelRunning({
        context,
        channelId: provider.id,
        accountId,
      });
      // Weixin QR login polls ilink independently; stopping a live monitor during scan
      // often yields WeChat "暂时无法连接". Force re-login still stops first.
      const stopBeforeLogin =
        provider.id !== "openclaw-weixin" || Boolean(loginParams.force);
      if (stopBeforeLogin) {
        await context.stopChannel(provider.id, accountId);
      }
      const result = await provider.gateway.loginWithQrStart({
        force: Boolean(loginParams.force),
        timeoutMs: typeof loginParams.timeoutMs === "number" ? loginParams.timeoutMs : undefined,
        verbose: Boolean(loginParams.verbose),
        accountId,
      });
      const loginMessage =
        typeof result.message === "string" ? result.message.toLowerCase() : "";
      const alreadyLinked =
        loginMessage.includes("已连接过此 openclaw") ||
        loginMessage.includes("already connected to this openclaw");
      if (result.connected || alreadyLinked) {
        await context.startChannel(provider.id, accountId);
      } else if (wasRunning && !result.qrDataUrl) {
        await context.startChannel(provider.id, accountId);
      }
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
      const loginParams = params as WebLoginWaitParams;
      const accountId = resolveAccountId(loginParams);
      const channelHint = loginParams.channel;
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
        timeoutMs: typeof loginParams.timeoutMs === "number" ? loginParams.timeoutMs : undefined,
        accountId,
        currentQrDataUrl: loginParams.currentQrDataUrl,
        ...(loginParams.sessionKey ? { sessionKey: loginParams.sessionKey } : {}),
        ...(loginParams.verifyCode ? { verifyCode: loginParams.verifyCode } : {}),
      });
      const waitMessage =
        typeof result.message === "string" ? result.message.toLowerCase() : "";
      const alreadyLinked =
        waitMessage.includes("已连接过此 openclaw") ||
        waitMessage.includes("already connected to this openclaw");
      if (result.connected || alreadyLinked) {
        await context.startChannel(provider.id, accountId);
      }
      respond(true, result, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },
};
