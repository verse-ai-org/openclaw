# 改/删冲突决议（阶段 1）

`DU` = fork 删、upstream 改 · `UD` = upstream 删、fork 改

> **2026-05-20 阶段 1 已全部执行**（46/46）

---

## 统计

| 指标 | 数量 |
|------|------|
| 已决议 | **46** |
| 待决议 | **0** |
| DU → 采纳 upstream | **6** |
| UD → 接受 upstream 删除 | **40** |

**合并后未解决 UU：** **169**（`git diff --name-only --diff-filter=U`）

---

## 决议表

| 路径 | 类型 | 决议 | 理由 | 日期 |
|------|------|------|------|------|
| `src/agents/tool-catalog.test.ts` | DU | **theirs** | upstream 新 tool-catalog 测试 | 2026-05-20 |
| `src/config/zod-schema.tts.test.ts` | DU | **theirs** | upstream TTS schema 测试 | 2026-05-20 |
| `src/daemon/launchd-restart-handoff.test.ts` | DU | **theirs** | fork 删、upstream 保留 handoff 测试 | 2026-05-20 |
| `src/daemon/launchd-restart-handoff.ts` | DU | **theirs** | 同上 | 2026-05-20 |
| `src/gateway/server.device-token-rotate-authz.test.ts` | DU | **theirs** | upstream 安全/authz 测试 | 2026-05-20 |
| `src/infra/net/proxy-env.test.ts` | DU | **theirs** | upstream proxy 测试 | 2026-05-20 |
| `src/memory/*`（8 文件） | UD | **rm** | 迁至 `extensions/memory-core/src/memory/` | 2026-05-20 |
| `src/telegram/*`（3 文件） | UD | **rm** | 迁至 `extensions/telegram/` | 2026-05-20 |
| `src/web/outbound*`（2 文件） | UD | **rm** | upstream 已移除该 outbound 层 | 2026-05-20 |
| `src/wizard/onboarding*`（2 文件） | UD | **rm** | 并入 upstream `commands/onboard*` 流程 | 2026-05-20 |
| `src/commands/onboard-auth*`（6 文件） | UD | **rm** | upstream 插件化 auth；Minimax 在 `extensions/minimax/onboard.ts` **阶段 8 接回** | 2026-05-20 |
| `src/commands/auth-choice.apply.minimax*`（2 文件） | UD | **rm** | 迁至 `src/plugins/provider-auth*` + minimax 插件 | 2026-05-20 |
| `src/commands/onboard-provider-auth-flags.ts` | UD | **rm** | 同上 | 2026-05-20 |
| `src/commands/onboard-non-interactive.provider-auth.test.ts` | UD | **rm** | 同上 | 2026-05-20 |
| `src/agents/huggingface-models.ts` | UD | **rm** | 迁至 `extensions/huggingface/` | 2026-05-20 |
| `src/agents/venice-models.ts` | UD | **rm** | 迁至 `extensions/venice/`；fork diff **阶段 8/插件** 接回 | 2026-05-20 |
| `src/agents/openai-ws-*`（3 文件） | UD | **rm** | upstream 重构 WS 路径 | 2026-05-20 |
| `src/agents/models-config.providers.*`（2 文件） | UD | **rm** | 合并进 upstream models-config 结构 | 2026-05-20 |
| `src/agents/models-config.fills-missing-provider-apikey-from-env-var.test.ts` | UD | **rm** | 测试随模块迁移 | 2026-05-20 |
| `src/agents/pi-embedded-runner/run/attempt.spawn-workspace.test.ts` | UD | **rm** | upstream 删/换测试路径 | 2026-05-20 |
| `src/agents/pi-extensions/context-pruning/pruner.test.ts` | UD | **rm** | 同上 | 2026-05-20 |
| `src/auto-reply/...defaults-think-low-reasoning...test.ts` | UD | **rm** | upstream 删该回归测试 | 2026-05-20 |
| `src/channels/plugins/outbound/whatsapp*`（2 文件） | UD | **rm** | WhatsApp 迁至插件/扩展 | 2026-05-20 |
| `src/config/config.discord.test.ts` | UD | **rm** | upstream 删/合并测试 | 2026-05-20 |
| `src/config/config.identity-defaults.test.ts` | UD | **rm** | 同上 | 2026-05-20 |
| `src/plugin-sdk/voice-call.ts` | UD | **rm** | 迁至 `extensions/voice-call/` | 2026-05-20 |

---

## 阶段 8+ 接回提醒（非本阶段）

合并仍带 `<<<<<<<` 的文件可能仍 `import` 已删路径，解决 UU 时改指向：

| 已删路径 | 接回方向 |
|----------|----------|
| `onboard-auth*.ts`、`auth-choice.apply.minimax.ts` | `extensions/minimax/onboard.ts`、`src/plugins/provider-auth-choice.js` |
| `onboard-auth.config-core`（fork +189 行） | 对照 `git diff 841ee24340..354df8b5d0` 迁入 minimax 插件或 `auth-choice.apply.ts` |
| `venice-models.ts`（fork +35 行） | `extensions/venice/` |
| `memory/*` | `extensions/memory-core/` |
