import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelRuntimeSnapshot } from "../server-channel-runtime.types.js";
import type { GatewayRequestHandlerOptions } from "./types.js";

const mocks = vi.hoisted(() => ({
  listChannelPlugins: vi.fn(),
}));

vi.mock("../../channels/plugins/index.js", () => ({
  listChannelPlugins: mocks.listChannelPlugins,
}));

import { webHandlers } from "./web.js";

function createOptions(
  params: Record<string, unknown>,
  overrides?: Partial<GatewayRequestHandlerOptions>,
): GatewayRequestHandlerOptions {
  return {
    req: { type: "req", id: "req-1", method: "web.login.start", params },
    params,
    client: null,
    isWebchatConnect: () => false,
    respond: vi.fn(),
    context: {
      stopChannel: vi.fn(),
      startChannel: vi.fn(),
      getRuntimeSnapshot: vi.fn(
        (): ChannelRuntimeSnapshot => ({
          channels: {
            whatsapp: {
              accountId: "default",
              running: true,
            },
          },
          channelAccounts: {
            whatsapp: {
              default: {
                accountId: "default",
                running: true,
              },
            },
          },
        }),
      ),
    },
    ...overrides,
  } as unknown as GatewayRequestHandlerOptions;
}

function createRunningWhatsappContext() {
  const startChannel = vi.fn();
  const stopChannel = vi.fn();
  return {
    startChannel,
    stopChannel,
    context: {
      stopChannel,
      startChannel,
      getRuntimeSnapshot: vi.fn(
        (): ChannelRuntimeSnapshot => ({
          channels: {
            whatsapp: {
              accountId: "default",
              running: true,
            },
          },
          channelAccounts: {
            whatsapp: {
              default: {
                accountId: "default",
                running: true,
              },
            },
          },
        }),
      ),
    } as unknown as GatewayRequestHandlerOptions["context"],
  };
}

describe("webHandlers web.login.start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restarts a previously running channel when login start exits early without a QR", async () => {
    const loginWithQrStart = vi.fn().mockResolvedValue({
      code: "whatsapp-auth-unstable",
      message: "retry later",
    });
    mocks.listChannelPlugins.mockReturnValue([
      {
        id: "whatsapp",
        gatewayMethods: ["web.login.start"],
        gateway: { loginWithQrStart },
      },
    ]);
    const { context, startChannel, stopChannel } = createRunningWhatsappContext();
    const respond = vi.fn();

    await webHandlers["web.login.start"](
      createOptions(
        { accountId: "default" },
        {
          respond,
          context,
        },
      ),
    );

    expect(stopChannel).toHaveBeenCalledWith("whatsapp", "default");
    expect(startChannel).toHaveBeenCalledWith("whatsapp", "default");
    expect(respond).toHaveBeenCalledWith(
      true,
      {
        code: "whatsapp-auth-unstable",
        message: "retry later",
      },
      undefined,
    );
  });

  it("keeps the channel stopped when login start has taken over with a QR flow", async () => {
    const loginWithQrStart = vi.fn().mockResolvedValue({
      qrDataUrl: "data:image/png;base64,qr",
      message: "scan qr",
    });
    mocks.listChannelPlugins.mockReturnValue([
      {
        id: "whatsapp",
        gatewayMethods: ["web.login.start"],
        gateway: { loginWithQrStart },
      },
    ]);
    const { context, startChannel, stopChannel } = createRunningWhatsappContext();

    await webHandlers["web.login.start"](
      createOptions(
        { accountId: "default" },
        {
          context,
        },
      ),
    );

    expect(stopChannel).toHaveBeenCalledWith("whatsapp", "default");
    expect(startChannel).not.toHaveBeenCalled();
  });

  it("routes login start to the requested channel when multiple providers support web login", async () => {
    const whatsappLoginWithQrStart = vi.fn();
    const weixinLoginWithQrStart = vi.fn().mockResolvedValue({
      qrDataUrl: "data:image/png;base64,weixin-qr",
      message: "scan weixin qr",
    });
    mocks.listChannelPlugins.mockReturnValue([
      {
        id: "whatsapp",
        gatewayMethods: ["web.login.start"],
        gateway: { loginWithQrStart: whatsappLoginWithQrStart },
      },
      {
        id: "openclaw-weixin",
        gatewayMethods: ["web.login.start"],
        gateway: { loginWithQrStart: weixinLoginWithQrStart },
      },
    ]);
    const respond = vi.fn();

    await webHandlers["web.login.start"](
      createOptions({
        channel: "openclaw-weixin",
        force: true,
        timeoutMs: 30_000,
      }, { respond }),
    );

    expect(whatsappLoginWithQrStart).not.toHaveBeenCalled();
    expect(weixinLoginWithQrStart).toHaveBeenCalledWith({
      force: true,
      timeoutMs: 30_000,
      verbose: false,
      accountId: undefined,
    });
    expect(respond).toHaveBeenCalledWith(
      true,
      {
        qrDataUrl: "data:image/png;base64,weixin-qr",
        message: "scan weixin qr",
      },
      undefined,
    );
  });

  it("does not stop a running Weixin channel for non-force QR login", async () => {
    const loginWithQrStart = vi.fn().mockResolvedValue({
      qrDataUrl: "data:image/png;base64,weixin-qr",
      message: "scan weixin qr",
      sessionKey: "weixin-session",
    });
    mocks.listChannelPlugins.mockReturnValue([
      {
        id: "openclaw-weixin",
        gatewayMethods: ["web.login.start"],
        gateway: { loginWithQrStart },
      },
    ]);
    const stopChannel = vi.fn();
    const startChannel = vi.fn();
    const context = {
      stopChannel,
      startChannel,
      getRuntimeSnapshot: vi.fn(
        (): ChannelRuntimeSnapshot => ({
          channels: {
            "openclaw-weixin": {
              accountId: "6b399038f486-im-bot",
              running: true,
            },
          },
          channelAccounts: {
            "openclaw-weixin": {
              "6b399038f486-im-bot": {
                accountId: "6b399038f486-im-bot",
                running: true,
              },
            },
          },
        }),
      ),
    } as unknown as GatewayRequestHandlerOptions["context"];

    await webHandlers["web.login.start"](
      createOptions(
        { channel: "openclaw-weixin", timeoutMs: 30_000 },
        { context },
      ),
    );

    expect(stopChannel).not.toHaveBeenCalled();
    expect(loginWithQrStart).toHaveBeenCalled();
  });

  it("stops a running Weixin channel before force re-login", async () => {
    const loginWithQrStart = vi.fn().mockResolvedValue({
      qrDataUrl: "data:image/png;base64,weixin-qr",
      message: "scan weixin qr",
    });
    mocks.listChannelPlugins.mockReturnValue([
      {
        id: "openclaw-weixin",
        gatewayMethods: ["web.login.start"],
        gateway: { loginWithQrStart },
      },
    ]);
    const stopChannel = vi.fn();
    const context = {
      stopChannel,
      startChannel: vi.fn(),
      getRuntimeSnapshot: vi.fn(
        (): ChannelRuntimeSnapshot => ({
          channels: {
            "openclaw-weixin": {
              accountId: "default",
              running: true,
            },
          },
          channelAccounts: {},
        }),
      ),
    } as unknown as GatewayRequestHandlerOptions["context"];

    await webHandlers["web.login.start"](
      createOptions(
        { channel: "openclaw-weixin", force: true },
        { context },
      ),
    );

    expect(stopChannel).toHaveBeenCalledWith("openclaw-weixin", undefined);
  });
});

describe("webHandlers web.login.wait", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes refreshed QR payloads back to the client while login is still pending", async () => {
    const loginWithQrWait = vi.fn().mockResolvedValue({
      connected: false,
      message: "QR refreshed. Scan the latest code in WhatsApp → Linked Devices.",
      qrDataUrl: "data:image/png;base64,next-qr",
    });
    mocks.listChannelPlugins.mockReturnValue([
      {
        id: "whatsapp",
        gatewayMethods: ["web.login.wait"],
        gateway: { loginWithQrWait },
      },
    ]);
    const respond = vi.fn();

    await webHandlers["web.login.wait"](
      createOptions(
        {
          accountId: "default",
          timeoutMs: 5000,
          currentQrDataUrl: "data:image/png;base64,current-qr",
        },
        {
          req: {
            type: "req",
            id: "req-2",
            method: "web.login.wait",
            params: {
              accountId: "default",
              timeoutMs: 5000,
              currentQrDataUrl: "data:image/png;base64,current-qr",
            },
          } as GatewayRequestHandlerOptions["req"],
          respond,
        },
      ),
    );

    expect(loginWithQrWait).toHaveBeenCalledWith({
      accountId: "default",
      timeoutMs: 5000,
      currentQrDataUrl: "data:image/png;base64,current-qr",
    });
    expect(respond).toHaveBeenCalledWith(
      true,
      {
        connected: false,
        message: "QR refreshed. Scan the latest code in WhatsApp → Linked Devices.",
        qrDataUrl: "data:image/png;base64,next-qr",
      },
      undefined,
    );
  });
});
