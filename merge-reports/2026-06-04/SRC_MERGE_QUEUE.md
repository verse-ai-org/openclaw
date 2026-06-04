# 合并执行队列（2026-06-04）

**未合并：** 55（全部为 UU）  
**原则：** 逐文件 review；`git diff a002c416c7..7624806f93 -- <path>` 查 fork 独有改动；禁止批量 `--theirs` on `src/` 或 `extensions/feishu/`。

**推荐总时长估算：** 1.5–3 人日（`chat.ts` + feishu + agent-runner 占一半）

---

## 模块顺序总览

| 序 | 模块 | 文件数 | 波次 | Fork 关切 |
|----|------|--------|------|-----------|
| M1 | `packages/gateway-protocol` + `terminal-core` | 7 | 1 | 协议地基；fork 0 提交 |
| M2 | `src/config/sessions` + types | 5 | 2 | session 名、channel 配置 |
| M3 | `src/agents` | 8 | 3 | message-tool、openclaw-tools |
| M4 | `src/auto-reply` | 3 | 4 | agent-runner 投递判定 |
| M5 | `extensions/feishu` | 3 | 5 | 流式卡片 |
| M6 | `src/gateway` | 18 | 6 | chat API、Electron 对接 |
| M7 | cli / commands / cron / 杂项 | 12 | 7 | 点状修复 |
| M8 | `pnpm-lock.yaml` + 收尾 | 1 | 8 | install / build / commit |

---

## M1 — 协议包（7 文件）✅ 2026-06-04

fork 自分叉点 **0 提交** → `git checkout --theirs` + `git add`，已确认无 `<<<<<<<`。

- [x] `packages/gateway-protocol/src/channels.schema.test.ts`
- [x] `packages/gateway-protocol/src/index.ts`
- [x] `packages/gateway-protocol/src/schema/channels.ts`
- [x] `packages/gateway-protocol/src/schema/config.ts`
- [x] `packages/gateway-protocol/src/schema/logs-chat.ts`
- [x] `packages/terminal-core/src/ansi.test.ts`

**验收：** `pnpm test packages/gateway-protocol`（可选，合并后再集中跑亦可）

---

## M2 — 配置 / sessions（5 文件）✅ 2026-06-04

- [x] `src/config/bundled-channel-config-metadata.generated.ts` — `--theirs`
- [x] `src/config/sessions/metadata.ts` — identityHints + deriveSessionOrigin
- [x] `src/config/sessions/types.ts` — SessionIdentityHints + ACP re-export
- [x] `src/config/sessions/store.ts` — exclusive write + identityHints persist
- [x] `src/config/types.openclaw.ts` — official + `profile.upload`

**验收：** session 列表显示正确名称（非随机数）

---

## M3 — Agents（8 文件）✅ 2026-06-04

- [x] `src/agents/embedded-agent-runner/run.ts` — official
- [x] `src/agents/embedded-agent-runner/run/attempt.ts` — official
- [x] `src/agents/openai-responses.reasoning-replay.test.ts` — official
- [x] `src/agents/openclaw-tools.ts` — official + 互动 UI 工具
- [x] `src/agents/session-tool-result-guard-wrapper.ts` — prepared turn + runId
- [x] `src/agents/tools/common.ts` — interactionPending + progress
- [x] `src/agents/tools/message-tool.ts` — auto-fill + suppression
- [x] `src/agents/workspace.ts` — attestation + templateSubdir

---

## M4 — Auto-reply（3 文件）✅ 2026-06-04

- [x] `src/auto-reply/get-reply-options.types.ts`
- [x] `src/auto-reply/reply/agent-runner.ts` — side-effect / source delivery
- [x] `src/auto-reply/reply/get-reply-run.ts` — messageMetadata + suppress persistence

**验收：** 回复不重复发送、cron 相关投递仍算「已发送」

---

## M5 — 飞书（3 文件）✅ 2026-06-04

- [x] `extensions/feishu/src/streaming-card.ts` — full replace close + discard
- [x] `extensions/feishu/src/reply-dispatcher.ts` — fallback card on sync fail
- [x] `extensions/feishu/src/reply-dispatcher.test.ts` — fork + official tests

**对照提交：**

```bash
git show baed57bcbf -- extensions/feishu/
git log --oneline official-main -- extensions/feishu/src/reply-dispatcher.ts | head -5
```

**验收：** 飞书长回复流式卡片正常、thread 回退仍可用

---

## M6 — Gateway（18 文件）✅ 2026-06-04

### 6a — 基础（7）

- [x] `src/gateway/protocol/schema/agents-models-skills.ts` — 删除（迁至 `packages/gateway-protocol`）+ fork skills schema
- [x] `src/gateway/method-scopes.ts`
- [x] `src/gateway/server-methods.ts` — lazy 注册 + channels/profile/plugins/skills/chat
- [x] `src/gateway/server.impl.ts` — `ensureBuiltinAgents` + official embedded path
- [x] `src/gateway/session-utils.fs.ts` — fork display strip + official normalization
- [x] `src/gateway/session-utils.search.test.ts` — cron 会话过滤
- [x] `src/gateway/chat-attachments.test.ts` — official

### 6b — server-methods（10，`chat.ts` 最后）

- [x] `src/gateway/server-methods/agent.ts` — same-session tool events
- [x] `src/gateway/server-methods/agents.ts` — `skills` on create/update
- [x] `src/gateway/server-methods/channels.ts` — catalog/enable/recipients
- [x] `src/gateway/server-methods/config.ts` — `config.provider.apply`
- [x] `src/gateway/server-methods/cron.ts` — `sinceMs`
- [x] `src/gateway/server-methods/skills.ts` — file.get/set, import, remove
- [x] `src/gateway/server-methods/web.ts` — 微信 channel hint + already-linked
- [x] `src/gateway/server-methods/web.start.test.ts` — official
- [x] `src/gateway/server-methods/server-methods.test.ts` — attachment ref tests
- [x] `src/gateway/server-methods/chat.ts` — tools.subscribe, status, attachmentRefs, metadata

**验收：** ui-react 连 gateway、发消息、附件、cron 会话过滤

---

## M7 — 杂项（12 文件）✅ 2026-06-04

- [ ] `src/cli/directory-cli.ts`
- [ ] `src/cli/dns-cli.ts`
- [ ] `src/cli/exec-approvals-cli.ts`
- [ ] `src/cli/pairing-cli.ts`
- [ ] `src/cli/update-cli/status.ts`
- [ ] `src/commands/channels/status.ts`
- [ ] `src/commands/status-all/report-lines.ts`
- [ ] `src/cron/isolated-agent/delivery-target.ts`
- [ ] `src/cron/run-log.ts`
- [ ] `src/plugins/enable.ts`
- [ ] `src/skills/lifecycle/install-download.ts` — theirs
- [ ] `src/infra/tsdown-config.test.ts`

---

## M8 — 收尾 ✅ 2026-06-04

- [x] `pnpm-lock.yaml` — `git checkout --ours` + `pnpm install` + `git add`
- [x] `rg '^<<<<<<< '` 全仓库为 0（src/packages）
- [x] `git diff --name-only --diff-filter=U | wc -l` → 0
- [x] `pnpm build`（含补 `ConfigProviderApply*` / `Plugins*` 导出、import 路径、UI type import）
- [ ] 冒烟（见 [MERGE_INVENTORY.md](./MERGE_INVENTORY.md)）
- [ ] `git commit` 完成 merge
