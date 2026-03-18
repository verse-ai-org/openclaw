# Electron Onboarding OAuth 流程说明

## 目录

1. [整体架构](#整体架构)
2. [新 Protocol Handler 流程 vs 老轮询流程](#新-protocol-handler-流程-vs-老轮询流程)
3. [流程类型详解](#流程类型详解)
   - [Device Code Flow（MiniMax 等）](#device-code-flow)
   - [Simple OAuth Flow（openai-codex 等）](#simple-oauth-flow)
4. [文件职责索引](#文件职责索引)
5. [常见错误排查](#常见错误排查)

---

## 整体架构

```
渲染进程 (ui-react)
  └── ElectronWizardAdapter.startOAuth(authMethod)
        │
        │ IPC: onboarding:oauthStart
        ▼
主进程 (index.ts) → onboarding-oauth.ts:oauthStart()
        │
        ├── Device Code Flow (MiniMax)
        │     └── oauth-device-flow.ts:startDeviceCodeFlow(config)
        │           POST /oauth/code → 获取 user_code + verification_uri
        │           shell.openExternal(verificationUri) → 打开浏览器
        │           返回 { userCode, verificationUri } 给渲染进程展示
        │
        └── Simple OAuth Flow (openai-codex 等)
              shell.openExternal(providerUrl?redirect_uri=openclaw://oauth/callback&state=xxx)
              返回 { ok: true }

渲染进程每 2s 调用 ElectronWizardAdapter.pollOAuth(authMethod)
        │
        │ IPC: onboarding:oauthPoll
        ▼
主进程 → onboarding-oauth.ts:oauthPoll()
        │
        ├── Device Code Flow
        │     └── oauth-device-flow.ts:pollDeviceCodeFlow(session)
        │           POST /oauth/token (含 user_code + code_verifier)
        │           返回 { ok: true, token } / { ok: false, error: "pending" }
        │
        └── Simple OAuth Flow
              检查 completedCallbacks Map（内存）
              返回 { ok: true, token } / { ok: false, error: "pending" }

[Simple 流程专用] 浏览器完成授权后跳转到
  openclaw://oauth/callback?auth_method=xxx&code=yyy&state=zzz
        │
        ▼
macOS:   app.on("open-url")        ─┐
Windows: app.on("second-instance") ─┤→ dispatchOAuthCallback(url)
        │                          ─┘       (index.ts)
        ▼
onboarding-oauth.ts:handleOAuthProtocolCallback(url)
  验证 state（CSRF 检查）→ 写入 completedCallbacks
```

---

## 新 Protocol Handler 流程 vs 老轮询流程

### 老流程（已废弃）

```
oauthStart  → shell.openExternal(providerUrl)  // 无 redirect_uri，无 state
oauthPoll   → 读取 ~/.openclaw/agents/main/agent/auth-profiles.json
              if (profile.key?.trim()) return { ok: true, token }
              else return { ok: false, error: "pending" }
```

**问题一览：**

| 问题 | 说明 |
|---|---|
| 无 CSRF 保护 | 没有 state 参数，任何能写 auth-profiles.json 的进程都能注入 token |
| 竞态条件 | 文件轮询可能读到旧 token 当成新 token 返回 |
| 依赖外部 CLI | 需要 CLI 进程在恰当时机写文件，主进程无法控制时序 |
| 无错误传播 | 浏览器返回 error 参数时 Electron 完全不感知 |
| 跨平台限制 | Windows 下文件路径处理复杂 |

### 新流程（当前实现）

```
oauthStart → shell.openExternal(url?redirect_uri=openclaw://oauth/callback&state=RANDOM)
oauthPoll  → 检查 completedCallbacks（内存 Map，读后即清）

浏览器完成授权 → 跳转 openclaw://oauth/callback?code=xxx&state=xxx
  macOS:   app.on("open-url")        → handleOAuthProtocolCallback(url)
  Windows: app.on("second-instance") → handleOAuthProtocolCallback(url)
           验证 state（CSRF 检查）
           写入 completedCallbacks
oauthPoll  → 发现 completedCallbacks 有结果 → 返回 token
```

**新老对比：**

| 方面 | 老流程 | 新流程 |
|---|---|---|
| token 传递路径 | 文件系统（auth-profiles.json）| Electron Protocol URL（内存）|
| CSRF 保护 | 无 | state 参数（PKCE 随机生成）|
| 错误传播 | 无 | `error` query param 直接传回 |
| 外部依赖 | 需要 CLI 进程写文件 | 仅需浏览器能打开 URL Scheme |
| 平台支持 | macOS/Linux | macOS + Linux + Windows |
| 竞态风险 | 高（旧 token 可能误读）| 无（一次性 Map，读后即清）|

---

## 流程类型详解

### Device Code Flow

适用场景：提供商有自己的 `/oauth/code` + `/oauth/token` 端点，用户在浏览器页面输入 `user_code` 完成授权（无 redirect 回调）。当前实现：MiniMax Global / MiniMax CN。

```
用户点击 "Connect"       Electron 主进程              提供商服务器
      │                        │                              │
      │── oauthStart() ───────►│                              │
      │                        │── POST /oauth/code ─────────►│
      │                        │   client_id, scope           │
      │                        │   code_challenge (PKCE S256) │
      │                        │   state                      │
      │                        │◄─ { user_code,               │
      │                        │     verification_uri,        │
      │                        │     expired_in, interval }   │
      │                        │                              │
      │                        │── shell.openExternal ───────►│
      │◄─ { userCode,         │   (verification_uri)         │
      │     verificationUri } ─│                              │
      │                        │                              │
      │ 展示 user_code          │                              │
      │                        │                              │
每 2s │── oauthPoll() ────────►│                              │
      │                        │── POST /oauth/token ────────►│
      │                        │   grant_type, client_id      │
      │                        │   user_code, code_verifier   │
      │                        │◄─ { status: "pending" }      │
      │◄─ { error:"pending" } ─│                              │
      │                        │                              │
用户在浏览器完成授权              │                              │
      │                        │                              │
每 2s │── oauthPoll() ────────►│                              │
      │                        │── POST /oauth/token ────────►│
      │                        │◄─ { status: "success",       │
      │                        │     access_token,            │
      │                        │     refresh_token }          │
      │◄─ { ok:true, token } ──│                              │
```

**MiniMax 特殊说明：**

| 字段 | 说明 |
|---|---|
| `grant_type` | `urn:ietf:params:oauth:grant-type:user_code`（MiniMax 自定义，非标准 RFC 8628）|
| `expired_in` | 秒数（非 unix timestamp），runner 自动加 `Date.now()` 转换 |
| `x-request-id` | 每次 `/oauth/code` 请求必须携带，MiniMax 要求（通过 `extraCodeHeaders` 注入）|
| `state` | MiniMax **要求**在请求体中携带（缺失会返回 `status_code: 2013 invalid params`）|

---

### Simple OAuth Flow

适用场景：提供商使用标准 OAuth Authorization Code Flow，支持 `redirect_uri` 回调到客户端 URL Scheme。当前实现：openai-codex、google-gemini-cli、qwen-portal、github-copilot、chutes。

```
用户点击 "Connect"       Electron 主进程              提供商服务器
      │                        │                              │
      │── oauthStart() ───────►│                              │
      │                        │ 生成 state (PKCE 随机)         │
      │                        │── shell.openExternal ───────►│
      │                        │   https://provider.com/      │
      │                        │   ?redirect_uri=             │
      │                        │     openclaw://oauth/        │
      │                        │     callback?auth_method=xxx │
      │                        │   &state=yyy                 │
      │◄─ { ok: true } ────────│                              │
      │                        │                              │
      │ 展示「等待授权中」          │                              │
      │                        │                              │
用户在浏览器完成授权              │                              │
      │        浏览器跳转 openclaw://oauth/callback              │
      │                    ?auth_method=openai-codex            │
      │                    &code=TOKEN                          │
      │                    &state=yyy                           │
      │                        │                              │
      │  macOS:  app.on("open-url")                            │
      │  Windows: app.on("second-instance") → argv 解析         │
      │                        │                              │
      │          handleOAuthProtocolCallback(url)              │
      │              验证 state == session.state                │
      │              写 completedCallbacks[authMethod]          │
      │                        │                              │
每 2s │── oauthPoll() ────────►│                              │
      │                        │ 检查 completedCallbacks        │
      │◄─ { ok:true, token } ──│                              │
```

**注意：** Simple 流程中 `code` 参数直接作为 access token 使用。若平台需要额外的 token exchange（用 code 换 token），应升级为 Device Code Flow 并实现 `parseTokenResponse`。

---

## 文件职责索引

| 文件 | 职责 |
|---|---|
| `oauth-utils.ts` | `generatePkce()` / `toFormUrlEncoded()` 基础工具函数 |
| `oauth-device-flow.ts` | 通用 Device Code Flow 运行器 + 所有 Device Code 提供商配置对象 |
| `onboarding-oauth.ts` | OAuth 公共 API（`oauthStart` / `oauthPoll` / `clearOAuthSession` / `handleOAuthProtocolCallback`）+ Simple 流程配置表 |
| `onboarding-providers.ts` | `OAUTH_AUTH_METHODS` Set（所有 OAuth method 的单一来源）+ `PROVIDER_REGISTRY` |
| `onboarding-validate.ts` | API key 探测验证（OAuth 平台跳过）|
| `index.ts` | Protocol 注册（`setAsDefaultProtocolClient`）+ `open-url` / `second-instance` 事件监听 |
| `electron-builder.yml` | macOS/Linux 打包时 URL Scheme 注册配置 |

---

## 常见错误排查

### `status_code: 2013 invalid params`（MiniMax）

**原因：** `/oauth/code` 请求体缺少必填参数。MiniMax 要求 `state` 字段必须存在。

**排查：** 检查 `startDeviceCodeFlow` 是否在 PKCE 请求体中包含 `state`：

```typescript
// oauth-device-flow.ts 中应有：
if (config.usePKCE) {
  codeBody["code_challenge"] = challenge;
  codeBody["code_challenge_method"] = "S256";
  codeBody["state"] = state;  // 必须存在
}
```

### `OAuth state mismatch — possible CSRF`

**原因：** 浏览器回调中的 `state` 参数与启动时生成的不一致。

**排查：**
- 确认 `oauthStart` 中正确保存了 `state` 到 `activeSessions`
- 确认提供商会在回调 URL 中原样返回 `state`
- 若提供商不返回 `state`，`handleOAuthProtocolCallback` 中的校验会跳过（`session.state && stateParam !== session.state` 短路）

### Protocol 回调未触发（macOS 开发模式）

**原因：** 开发模式下 `process.defaultApp === true`，URL Scheme 注册到 `electron` 可执行文件而非 app bundle，需要先启动 app。

**排查步骤：**

```bash
# 1. 先启动 app（开发模式）
cd apps/electron && pnpm dev

# 2. 在另一个终端模拟回调
open "openclaw://oauth/callback?auth_method=openai-codex&code=test&state=xxx"

# 3. 检查 electron-onboarding.log
tail -f ~/.openclaw/electron-onboarding.log | grep oauth
```

### Protocol 回调未触发（macOS 打包后）

**排查：**

```bash
# 验证 URL Scheme 已注册
/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/\
LaunchServices.framework/Versions/A/Support/lsregister -dump | grep openclaw

# 预期输出包含：
# bindings:  openclaw
```

若未注册，检查 `electron-builder.yml` 的 `mac.protocols` 配置是否正确，并重新打包。

### `No active OAuth session for this method`

**原因：** `oauthPoll` 在 `oauthStart` 之前被调用，或 session 已因超时被清除。

**排查：** 确认前端在 `oauthStart` 返回 `{ ok: true }` 后再开始轮询，且轮询间隔不超过 5 分钟超时窗口。

### Windows Protocol 回调未触发

**原因：** `app.requestSingleInstanceLock()` 未在 `main()` 最开头调用，导致 `second-instance` 事件不触发。

**排查：** 检查 `index.ts` 开头：

```typescript
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}
```

这必须在 `app.whenReady()` 之前执行。
