# 冲突维度目录（2026-06-04）

**生成时间：** 2026-06-04  
**未合并文件总数：** 55  
**冲突类型：** 全部为 **UU**（双方修改）  
**Official tip：** `50c3995894`  
**Fork tip（ours）：** `7624806f93`  
**Merge-base：** `a002c416c7`  
**状态：** merge 进行中，**未 commit**

---

## 处理策略总表

| 模块 | 文件数 | Fork 提交* | 策略 | 人工强度 |
|------|--------|------------|------|----------|
| `packages/gateway-protocol/` | 6 | 0 | **偏 official**（`--theirs`）+ schema test | 低 |
| `packages/terminal-core/` | 1 | 0 | **偏 official** | 低 |
| `extensions/feishu/` | 3 | 1 each | **三路合并**，保留流式卡片 | **高** |
| `src/config/` | 5 | 1–2 | official 骨架 + session 名 | **高** |
| `src/agents/` | 8 | 0–5 | runner 偏 official；tools 人工 | **高** |
| `src/auto-reply/` | 3 | 1–3 | **三路合并**（投递逻辑） | **高** |
| `src/gateway/` | 18 | 1–11 | **三路合并**；`chat.ts` 最后 | **最高** |
| `src/cli/` | 5 | 2 | official + spot-check | 中 |
| `src/commands/` | 2 | 2 | official + spot-check | 中 |
| `src/cron/` | 2 | 1–2 | 接回 cron 通知/投递 | 中 |
| 其它 `src/` | 4 | 0–1 | 见队列 | 低–中 |
| `pnpm-lock.yaml` | 1 | 37† | **波次末 `pnpm install` 重生** | 低 |

\* `git log a002c416c7..7624806f93 -- <path>` 提交数  
† lock 的「37」为 fork 侧 lock 历史提交数，不表示需手改 37 处

---

## 1. `packages/gateway-protocol/`（6）— M1

| Fork# | 文件 | 策略 |
|-------|------|------|
| 0 | `packages/gateway-protocol/src/channels.schema.test.ts` | theirs |
| 0 | `packages/gateway-protocol/src/index.ts` | theirs |
| 0 | `packages/gateway-protocol/src/schema/channels.ts` | theirs |
| 0 | `packages/gateway-protocol/src/schema/config.ts` | theirs |
| 0 | `packages/gateway-protocol/src/schema/logs-chat.ts` | theirs |

---

## 2. `packages/terminal-core/`（1）— M1

| Fork# | 文件 | 策略 |
|-------|------|------|
| 0 | `packages/terminal-core/src/ansi.test.ts` | theirs |

---

## 3. `src/config/`（5）— M2

| Fork# | 文件 | 策略 | Fork 线索 |
|-------|------|------|-----------|
| 1 | `src/config/bundled-channel-config-metadata.generated.ts` | theirs + 必要时 regen | — |
| 2 | `src/config/sessions/metadata.ts` | **merge** | `cbfc338ece` session 名 |
| 2 | `src/config/sessions/types.ts` | **merge** | 同上 |
| 1 | `src/config/sessions/store.ts` | **merge** | SQLite 路径 |
| 2 | `src/config/types.openclaw.ts` | **merge** | channel 配置 |

---

## 4. `src/agents/`（8）— M3

| Fork# | 文件 | 策略 | Fork 线索 |
|-------|------|------|-----------|
| 0 | `src/agents/embedded-agent-runner/run.ts` | theirs | — |
| 0 | `src/agents/embedded-agent-runner/run/attempt.ts` | theirs | — |
| 2 | `src/agents/openai-responses.reasoning-replay.test.ts` | merge/test | — |
| 5 | `src/agents/openclaw-tools.ts` | **merge** | 互动工具注册 |
| 3 | `src/agents/session-tool-result-guard-wrapper.ts` | **merge** | — |
| 2 | `src/agents/tools/common.ts` | **merge** | — |
| 2 | `src/agents/tools/message-tool.ts` | **merge** | 飞书/微信 target |
| 2 | `src/agents/workspace.ts` | **merge** | — |

---

## 5. `src/auto-reply/`（3）— M4

| Fork# | 文件 | 策略 | Fork 线索 |
|-------|------|------|-----------|
| 1 | `src/auto-reply/get-reply-options.types.ts` | **merge** | — |
| 1 | `src/auto-reply/reply/agent-runner.ts` | **merge** | cron/deterministic 投递 |
| 3 | `src/auto-reply/reply/get-reply-run.ts` | **merge** | — |

**已知冲突片段：** `agent-runner.ts` 中 `successfulCronAdds` / `didSendDeterministicPrompt`（ours）vs 官方精简判定（theirs）→ **保留 ours 条件**。

---

## 6. `extensions/feishu/`（3）— M5

| Fork# | 文件 | 策略 | Fork 线索 |
|-------|------|------|-----------|
| 1 | `extensions/feishu/src/reply-dispatcher.ts` | **merge** | `baed57bcbf` |
| 1 | `extensions/feishu/src/reply-dispatcher.test.ts` | **merge** | 同上 |
| 1 | `extensions/feishu/src/streaming-card.ts` | **merge** | 流式卡片展示 |

---

## 7. `src/gateway/`（18）— M6

### 7a. 协议与注册（先）

| Fork# | 文件 | 策略 |
|-------|------|------|
| 5 | `src/gateway/protocol/schema/agents-models-skills.ts` | **merge** |
| 4 | `src/gateway/method-scopes.ts` | **merge** |
| 4 | `src/gateway/server-methods.ts` | **merge** |
| 2 | `src/gateway/server.impl.ts` | **merge** |
| 3 | `src/gateway/session-utils.fs.ts` | **merge** |
| 1 | `src/gateway/session-utils.search.test.ts` | merge/test |
| 2 | `src/gateway/chat-attachments.test.ts` | merge/test |

### 7b. `server-methods/`（`chat.ts` 放本组最后）

| Fork# | 文件 | 策略 | 备注 |
|-------|------|------|------|
| 2 | `src/gateway/server-methods/agent.ts` | **merge** | |
| 2 | `src/gateway/server-methods/agents.ts` | **merge** | |
| 5 | `src/gateway/server-methods/channels.ts` | **merge** | |
| **11** | `src/gateway/server-methods/chat.ts` | **merge** | **最大文件，单独预留时间** |
| 4 | `src/gateway/server-methods/config.ts` | **merge** | |
| 1 | `src/gateway/server-methods/cron.ts` | **merge** | cron 会话隐藏 |
| 3 | `src/gateway/server-methods/server-methods.test.ts` | merge/test | |
| 4 | `src/gateway/server-methods/skills.ts` | **merge** | |
| 1 | `src/gateway/server-methods/web.start.test.ts` | merge/test | |
| 2 | `src/gateway/server-methods/web.ts` | **merge** | |

---

## 8. 杂项（12）— M7

| Fork# | 文件 | 策略 |
|-------|------|------|
| 2 | `src/cli/directory-cli.ts` | merge |
| 2 | `src/cli/dns-cli.ts` | merge |
| 2 | `src/cli/exec-approvals-cli.ts` | merge |
| 2 | `src/cli/pairing-cli.ts` | merge |
| 2 | `src/cli/update-cli/status.ts` | merge |
| 2 | `src/commands/channels/status.ts` | merge |
| 2 | `src/commands/status-all/report-lines.ts` | merge |
| 2 | `src/cron/isolated-agent/delivery-target.ts` | merge |
| 1 | `src/cron/run-log.ts` | merge |
| 1 | `src/plugins/enable.ts` | merge |
| 0 | `src/skills/lifecycle/install-download.ts` | theirs |
| 1 | `src/infra/tsdown-config.test.ts` | merge/test |

---

## 9. `pnpm-lock.yaml`（1）— M8

| 策略 |
|------|
| 所有源码 `git add` 后：`git checkout --theirs pnpm-lock.yaml` 或删除 → `pnpm install` → `git add pnpm-lock.yaml` |

---

## 10. 已自动合并、无冲突但需回归

以下路径本次 **不在** `unmerged-files.txt`，但 fork 有大量提交，合并后须冒烟：

| 路径 | Fork 关切 |
|------|-----------|
| `ui-react/` | 交互卡片、automation、闪烁、history 重载 |
| `apps/electron/` | Gateway、上传、528 打包 |
| `extensions/openclaw-weixin/`（若有） | 微信渠道 |
| `package.json` / `pnpm-workspace.yaml` | 已自动合并，build 时验证 scripts |
