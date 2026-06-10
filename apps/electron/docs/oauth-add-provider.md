# 新增 OAuth 平台操作手册

> 架构原理和流程说明见 [oauth-flows.md](./oauth-flows.md)。

## 目录

1. [选择流程类型](#选择流程类型)
2. [新增 Device Code Flow 平台](#新增-device-code-flow-平台)
3. [新增 Simple OAuth Flow 平台](#新增-simple-oauth-flow-平台)
4. [改动清单速查](#改动清单速查)
5. [验证步骤](#验证步骤)

---

## 选择流程类型

根据平台的 OAuth 实现方式选择接入类型：

| 判断条件 | 流程类型 |
|---|---|
| 平台提供 `/code` 端点返回 `user_code` + `verification_uri`，用户在浏览器页面输入 code | **Device Code Flow** |
| 平台支持 `redirect_uri` 参数，授权完成后浏览器跳转回调 URL | **Simple OAuth Flow** |
| 平台既有 `/code` 端点，又需要用 `code` 换 token（Authorization Code Flow）| **Device Code Flow**（在 `parseTokenResponse` 实现换 token 逻辑）|

**当前各流程的实现提供商：**

- Device Code Flow：MiniMax Global、MiniMax CN
- Simple OAuth Flow：openai-codex、google-gemini-cli、qwen-portal、github-copilot、chutes

---

## 新增 Device Code Flow 平台

适用：平台有 `/code` + `/token` 两个端点，用户在浏览器输入 `user_code` 完成授权。

**共 3 处必须改动，1 处可选改动（按顺序操作）：**

---

### 改动 1（必须）：`oauth-device-flow.ts` — 新增配置对象

文件路径：`apps/electron/src/main/oauth-device-flow.ts`

在文件末尾 `MINIMAX_CN_FLOW` 之后追加新的配置对象。以 GitHub Device Flow 为例：

```typescript
/**
 * GitHub Device Flow (RFC 8628 标准实现)
 * 文档：https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow
 */
export const GITHUB_DEVICE_FLOW: DeviceCodeFlowConfig = {
  name: "GitHub",
  // POST → 返回 user_code + verification_uri
  codeEndpoint: "https://github.com/login/device/code",
  // POST → 轮询获取 access_token
  tokenEndpoint: "https://github.com/login/oauth/access_token",
  clientId: "YOUR_GITHUB_CLIENT_ID",
  scope: "read:user",
  // RFC 8628 标准 grant_type（MiniMax 使用自定义 grant_type，注意区分）
  grantType: "urn:ietf:params:oauth:grant-type:device_code",
  // GitHub Device Flow 不使用 PKCE；MiniMax 使用 PKCE，设为 true
  usePKCE: false,

  // 解析 /code 端点的响应
  parseCodeResponse(raw) {
    const p = raw as {
      device_code?: string;     // 发给服务端的 code（不展示给用户）
      user_code?: string;       // 展示给用户输入的 code
      verification_uri?: string;
      expires_in?: number;      // 秒
      interval?: number;        // 轮询间隔秒数
      error?: string;
    };
    if (!p.user_code || !p.verification_uri) {
      throw new Error(p.error ?? "GitHub /code: missing user_code or verification_uri");
    }
    return {
      userCode: p.user_code,
      verificationUri: p.verification_uri,
      // 注意：expiredIn 必须是绝对 unix timestamp（ms），需加 Date.now()
      expiredIn: Date.now() + (p.expires_in ?? 900) * 1000,
      intervalMs: (p.interval ?? 5) * 1000,
      // state 字段可选；usePKCE=false 时 runner 不发送 state，此处可省略
    };
  },

  // 解析 /token 端点的响应
  // 返回 status: "pending" 表示用户尚未授权，runner 会在下次 poll 时重试
  parseTokenResponse(raw) {
    const p = raw as {
      access_token?: string;
      token_type?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    };
    if (p.access_token) {
      return { status: "success", accessToken: p.access_token };
    }
    // authorization_pending = 用户还没操作；slow_down = 轮询太频繁
    if (p.error === "authorization_pending" || p.error === "slow_down") {
      return { status: "pending" };
    }
    if (p.error) {
      return { status: "error", errorMessage: p.error_description ?? p.error };
    }
    return { status: "pending" };
  },
};
```

**`DeviceCodeFlowConfig` 字段说明：**

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | `string` | 日志中显示的名称 |
| `codeEndpoint` | `string` | POST → 获取 `user_code` |
| `tokenEndpoint` | `string` | POST → 轮询 `access_token` |
| `clientId` | `string` | OAuth App Client ID |
| `scope` | `string` | 请求的权限范围 |
| `grantType` | `string` | token 请求的 `grant_type` |
| `usePKCE` | `boolean` | 是否启用 PKCE（启用时自动生成并发送 `code_challenge` + `state`）|
| `parseCodeResponse` | `fn` | 解析 `/code` 响应，必须返回 `userCode` / `verificationUri` / `expiredIn`（绝对 ms）/ `intervalMs` |
| `parseTokenResponse` | `fn` | 解析 `/token` 响应，返回 `status: "pending"\|"success"\|"error"` |
| `extraCodeHeaders` | `fn?` | 可选，返回额外请求头（如 `x-request-id`）|

---

### 改动 2（必须）：`onboarding-oauth.ts` — 新增路由分支

文件路径：`apps/electron/src/main/onboarding-oauth.ts`

**2a. 顶部 import 中增加新的配置对象：**

```typescript
import {
  startDeviceCodeFlow,
  pollDeviceCodeFlow,
  MINIMAX_GLOBAL_FLOW,
  MINIMAX_CN_FLOW,
  GITHUB_DEVICE_FLOW,   // 新增
  type DeviceCodeSession,
} from "./oauth-device-flow.js";
```

**2b. `oauthStart()` 函数中，在现有 `minimax-portal-cn` 分支之后追加：**

```typescript
  if (authMethod === "github-device") {
    const result = await startDeviceCodeFlow(GITHUB_DEVICE_FLOW);
    if (result.ok && result.session) activeSessions.set(authMethod, result.session);
    return {
      ok: result.ok,
      userCode: result.userCode,
      verificationUri: result.verificationUri,
      error: result.error,
    };
  }
```

> `oauthPoll` 无需改动。它通过 `session.kind === "device-code"` 自动路由到 `pollDeviceCodeFlow()`，与具体提供商无关。

---

### 改动 3（必须）：`onboarding-providers.ts` — 注册 auth method

文件路径：`apps/electron/src/main/onboarding-providers.ts`

在 `OAUTH_AUTH_METHODS` Set 中追加新的 auth method id：

```typescript
export const OAUTH_AUTH_METHODS = new Set([
  // ... 现有条目 ...
  "github-device",   // 新增
]);
```

如果平台也有对应的 API 模型配置（非必须，仅当 `PROVIDER_REGISTRY` 中有相关 provider 时才需要）：

```typescript
export const PROVIDER_REGISTRY = {
  // ... 现有条目 ...
  github: {
    displayName: "GitHub Copilot",
    baseUrl: "https://api.githubcopilot.com",
    models: ["gpt-4o"],
  },
};
```

---

### 改动 4（可选）：`onboarding-validate.ts` — API key 验证

OAuth 平台通常不需要 API key 验证（用户通过浏览器授权，没有 API key 输入步骤）。`validateApiKey` 在 `AUTH_METHOD_TO_PROVIDER` 中找不到对应条目时，自动返回 `{ ok: true }`（非空即通过）。

**仅当平台同时支持 API key 模式时才需要在此添加。**

---

## 新增 Simple OAuth Flow 平台

适用：平台支持标准 OAuth Authorization Code Flow，授权完成后浏览器通过 `redirect_uri` 跳回应用。

**共 2 处必须改动：**

---

### 改动 1（必须）：`onboarding-oauth.ts` — 在两个 Map 中各加一行

文件路径：`apps/electron/src/main/onboarding-oauth.ts`

以新增 Notion OAuth 为例：

```typescript
// 提供商的 OAuth 授权页面 URL（基础 URL，无需包含 redirect_uri 和 state）
const SIMPLE_OAUTH_URLS: Record<string, string> = {
  "openai-codex":      "https://platform.openai.com",
  "google-gemini-cli": "https://aistudio.google.com",
  "qwen-portal":       "https://dashscope.aliyuncs.com",
  "github-copilot":    "https://github.com/login/device",
  chutes:              "https://chutes.ai",
  "notion-oauth":      "https://api.notion.com/v1/oauth/authorize",  // 新增
};

// auth method id → provider key 的映射（用于日志和会话管理）
const SIMPLE_AUTH_METHOD_TO_PROVIDER: Record<string, string> = {
  "openai-codex":      "openai",
  "google-gemini-cli": "google",
  "qwen-portal":       "qwen",
  "github-copilot":    "copilot",
  chutes:              "chutes",
  "notion-oauth":      "notion",  // 新增
};
```

`oauthStart` 会自动处理以下所有逻辑，无需额外代码：
- 生成随机 `state`（CSRF 保护）
- 拼接 `redirect_uri=openclaw://oauth/callback?auth_method=notion-oauth`
- 调用 `shell.openExternal()` 打开浏览器
- 启动 5 分钟超时计时

---

### 改动 2（必须）：`onboarding-providers.ts` — 注册 auth method

文件路径：`apps/electron/src/main/onboarding-providers.ts`

```typescript
export const OAUTH_AUTH_METHODS = new Set([
  // ... 现有条目 ...
  "notion-oauth",  // 新增
]);
```

**完成。** 浏览器完成授权后，提供商将用户重定向到：

```
openclaw://oauth/callback
  ?auth_method=notion-oauth
  &code=ACCESS_TOKEN_OR_CODE
  &state=RANDOM_STATE
```

Electron 的 `open-url`（macOS）/ `second-instance`（Windows）事件自动接收并处理回调，`oauthPoll` 返回 token。

> **注意：** 当前 Simple 流程将 `code` 参数直接用作 access token。若平台需要额外的 token exchange（用 authorization code 换 access token），应改用 Device Code Flow 并在 `parseTokenResponse` 中实现换 token 的 POST 请求。

---

## 改动清单速查

### Device Code Flow

```
必须：
  [1] oauth-device-flow.ts       新增 XxxConfig 配置对象（export const XXX_FLOW）
  [2] onboarding-oauth.ts        import 新配置 + oauthStart() 加 if 分支
  [3] onboarding-providers.ts    OAUTH_AUTH_METHODS.add("xxx")

可选：
  [4] onboarding-validate.ts     仅当平台也支持 API key 模式时添加
  [5] auth-choice-groups.ts      前端展示（ui-react，新增 group/method 定义）
```

### Simple OAuth Flow

```
必须：
  [1] onboarding-oauth.ts        SIMPLE_OAUTH_URLS 加 URL
                                 SIMPLE_AUTH_METHOD_TO_PROVIDER 加映射
  [2] onboarding-providers.ts    OAUTH_AUTH_METHODS.add("xxx")

可选：
  [3] auth-choice-groups.ts      前端展示（ui-react，新增 group/method 定义）
```

---

## 验证步骤

### 1. TypeScript 类型检查

```bash
cd apps/electron
npx tsc --noEmit
```

零错误后继续。

### 2. 开发模式功能验证

```bash
# 终端 1：启动 Electron（开发模式）
cd apps/electron
pnpm dev

# 终端 2：等 app 启动后，模拟 Protocol 回调（Simple 流程）
open "openclaw://oauth/callback?auth_method=notion-oauth&code=test-token-abc&state=REPLACE_WITH_REAL_STATE"

# 检查日志
tail -f ~/.bossim/electron-onboarding.log | grep -E "oauth|OAuth"
```

**预期日志输出（Simple 流程）：**

```
[main] oauthStart: authMethod=notion-oauth
[onboarding-oauth] Simple OAuth: opened "https://api.notion.com/..." for notion-oauth
[main] OAuth protocol callback: openclaw://oauth/callback?auth_method=notion-oauth&code=...
[onboarding-oauth] handleOAuthProtocolCallback: got code for "notion-oauth"
[main] oauthPoll: {"ok":true,"token":"test-token-abc"}
```

**预期日志输出（Device Code Flow）：**

```
[oauth-device-flow] GitHub: requesting device code from https://github.com/login/device/code
[oauth-device-flow] GitHub: got user_code=XXXX-XXXX, opening browser → https://github.com/login/device
[oauth-device-flow] GitHub: /token status=pending
[oauth-device-flow] GitHub: /token status=success
```

### 3. State 校验验证（CSRF 保护）

```bash
# 先触发 oauthStart（UI 操作或直接调用）
# 然后用错误的 state 模拟回调
open "openclaw://oauth/callback?auth_method=notion-oauth&code=evil-token&state=WRONG_STATE"
```

**预期日志：**

```
[onboarding-oauth] handleOAuthProtocolCallback: state mismatch for "notion-oauth" — possible CSRF
```

`oauthPoll` 随后返回 `{ ok: false, error: "OAuth state mismatch — possible CSRF" }`。

### 4. 打包验证（macOS）

```bash
# 打包
pnpm package:mac

# 验证 URL Scheme 注册
/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/\
LaunchServices.framework/Versions/A/Support/lsregister -dump | grep openclaw
# 预期输出含：bindings: openclaw

# 触发回调
open "openclaw://oauth/callback?auth_method=notion-oauth&code=test&state=xxx"
```
