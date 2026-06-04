# 合并进度

> **2026-05-20：** 已重新 `git merge upstream/main`，冲突按维度整理见 [CONFLICT_CATALOG.md](./CONFLICT_CATALOG.md)。**未 commit。**

---

## 总览

| 项目 | 值 |
|------|-----|
| 工作分支 | `merge-openclaw-main` |
| 安全点 tag | `fork-pre-upstream-merge-20260520` = `354df8b5d0` |
| Upstream tip | `a002c416c7` |
| Merge 状态 | **进行中**（MERGE_HEAD 存在） |
| 未合并文件 | **0**（阶段 9 后；原 215） |
| 核心 review | **169** 个 UU（双方修改；DU/UD **46** 已清） |

---

## 维度处理顺序（推荐）

| 顺序 | 维度 | 数量 | 策略 | 状态 |
|------|------|------|------|------|
| 1 | 波次 0 根配置 | 11 | upstream + 保留 `electron:*` / `ui:react:*` | 🔄 `package.json` + `pnpm-workspace.yaml` ✅ |
| 2 | `ui/` | 9 | **整目录 `--theirs`** | ✅ |
| 3 | 波次 1 DU/UD | 69 | 逐条 [modify-delete-decisions.md](./modify-delete-decisions.md) | ⬜ |
| 4 | **`src/` UU** | 168 | **逐文件人工**（见 CONFLICT_CATALOG §1） | ⬜ |
| 5 | `extensions/` | 46 | **全部 upstream**（UU=theirs，UD=rm） | ✅ |
| 6 | `apps/`（非 electron） | 20 | 偏 upstream；**`apps/ios/` 已 theirs** | 🔄 |
| 7 | docs / CI / test | 27 | **`docs/` 已 theirs**；workflows 已 theirs | 🔄 |
| — | `ui-react/`、`apps/electron/` | 0 冲突 | 已自动保留，合并后冒烟 | ⬜ |

---

## 阶段 checklist

| 阶段 | 说明 | 状态 |
|------|------|------|
| 0 | 文档 + 安全点 | ✅ |
| **0b** | **实施阶段 0：卫生与基线**（见下方日志） | ✅ 2026-05-20 |
| 1 | `git merge upstream/main` | ✅ 2026-05-20 |
| 2 | 生成 CONFLICT_CATALOG + unmerged 清单 | ✅ |
| 3 | 波次 0 根配置 | ✅ `package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml`（`pnpm install`） |
| 4 | `ui/` → upstream | ✅ 2026-05-20 |
| 5 | **实施阶段 1** 波次 1 DU/UD（46） | ✅ 2026-05-20 |
| 6 | **实施阶段 2** Gateway 协议（7） | ✅ 2026-05-20 |
| 7 | **实施阶段 3–9** `src/` UU 分模块 | ✅ 阶段 9 完成；见 [SRC_MERGE_QUEUE.md](./SRC_MERGE_QUEUE.md) |
| 7 | extensions / apps / docs / CI | 🔄 extensions ✅ |
| 8 | build / test / 冒烟（**冲突已清**） | ⬜ |
| 9 | merge commit | ⬜ |

**实施约定：** 合并进行中不跑全量 build；单测可选、**最终阶段再集中验证**。

---

## src 模块进度

见 [SRC_MODULES.md](./SRC_MODULES.md) M1–M10；文件级 checklist 见 [CONFLICT_CATALOG.md](./CONFLICT_CATALOG.md) §1。

---

## 日志

### 2026-05-20 — 实施阶段 0（卫生与基线）✅

- `GatewayChannel.swift`：用户已解冲突；已 `git add`，工作区无 `<<<<<<<`
- 扫描 `src/` / `test/` / `apps/`：**0** 个「有标记但不在 git U」的游离文件（与 215 未合并一致）
- `test/setup.ts`、`test/openclaw-npm-release-check.test.ts`：fork 有 diff（20/80 行），**不** `--theirs`，留待 UU 阶段处理
- 刷新 `unmerged-files.txt`（**215**）
- 未跑 `pnpm build` / ui-react 全量测（按约定合并后再验证）

**Review：** 未合并数仍为 215；下一阶段 → **实施阶段 1（DU/UD 46 条）**

### 2026-05-20 — 实施阶段 1（DU/UD 46）✅

- **DU×6** → `git checkout --theirs` + `git add`（tool-catalog、zod-schema.tts、launchd-handoff、device-token test、proxy-env test）
- **UD×40** → `git rm`（memory/telegram/web/wizard、onboard-auth*、minimax apply、agents 迁插件文件等）
- 决议表：[modify-delete-decisions.md](./modify-delete-decisions.md)
- 未合并：**215 → 169**
- **接回债：** `auth-choice.apply.ts`、`auth-choice.ts`、`server-methods/config.ts`、`server.impl.ts` 等 UU 仍 import 已删模块 → 在阶段 7/8 合并时改指向 `extensions/*` / `plugins/provider-auth*`

**Review：** 确认 169 仅剩 UU；下一阶段 → **实施阶段 2（Gateway 协议 7 文件）**

### 2026-05-20 — 实施阶段 2（Gateway 协议 7）✅

- 策略：**upstream 骨架**（`lazyCompile`、Talk/Tasks/ToolsEffective 等）+ **接回 fork RPC schema**
- `plugins.ts`：合并 upstream `PluginsUiDescriptors`/`SessionAction` + fork `plugins.status`/`enable`/`install`
- `channels.ts`：`channels.enable`、`channels.catalog`
- `logs-chat.ts`：`chat.tools.subscribe`
- `agents-models-skills.ts`：`skills.file.*`、`skills.import`、`skills.remove`
- `protocol-schemas.ts`、`types.ts`、`index.ts`：注册与 validator 同步
- 未合并：**169 → 162**

**Review：** 下一阶段 → **实施阶段 3（Gateway 注册壳 ~15 文件）**

### 2026-05-20 — 实施阶段 3（Gateway 注册壳 16）✅

- **方法清单/注册：** `server-methods-list.ts` → upstream `listCoreGatewayMethods()` + `GATEWAY_AUX_METHODS` + channel plugins；`methods/core-descriptors.ts` 接回 fork RPC（`channels.catalog/enable`、`config.provider.apply`、`skills.file.*`、`chat.tools.subscribe`、`profile.parse`、`plugins.status/enable/install` 等）
- **Handler 聚合：** `server-methods.ts` → upstream `pluginHostHookHandlers` + `artifactsHandlers` + fork `profileHandlers` + `pluginsHandlers`
- **Scopes：** `method-scopes.ts` → upstream（`core-descriptors` + 动态 `plugins.sessionAction`）
- **Upstream 骨架 + fork 补丁：** `session-utils.ts`（`resolveAssistantIdentity`、`looksLikeAvatarPath`、agents 列表 `bio`/`skills`/`video`）；`session-utils.fs.ts`（`cleanTranscriptText` + `stripInboundMetadata`）；`src/shared/session-types.ts`（`bio`、`skills` 字段）
- **`--theirs`：** `server-plugins.ts`、`tools-invoke-http*.ts`、`server/plugins-http*.ts`、`server.*.test.ts`（auth/chat/config/talk）、`server/ws-connection/message-handler.ts`
- 未合并：**162 → 146**（仍留 M3：`server-methods/chat*` 等 12 文件 + `server.impl.ts` 等）

**Review：** 确认 146；下一阶段 → **实施阶段 4（Gateway 方法 M3：chat/attachments/channels/config/skills ~12 文件）**

### 2026-05-20 — 实施阶段 4（Gateway 方法 M3，14 文件）✅

- **upstream 骨架 + fork RPC 行为：** `channels.ts`（保留 `channels.catalog/enable` + upstream `start/stop`）、`config.ts`（`config.provider.apply` → `plugins/provider-auth-helpers`）、`skills.ts`（upstream ClawHub + fork `skills.file.*`/`import`/`remove`）
- **`chat.ts`：** upstream 大文件 + fork `attachmentRefs`、`chat.tools.subscribe`、`chat.status`、附件路由 hint
- **`chat-attachments*`：** fork 文档解析逻辑（`--ours`）
- **`agent.ts`：** `--theirs`；**`agents.ts`：** `--ours`（`agents.update/delete/files.*`）
- **小文件：** `attachment-normalize`（合并 MIME 白名单 + upstream normalize）、`web.ts`（channel hint + `currentQrDataUrl`）、`devices.ts`/`chat.directive-tags.test.ts` → upstream
- 未合并：**146 → 132**（`src/gateway/` 仅剩 `server.impl.ts` → 阶段 5）

**Review：** 确认 132；下一阶段 → **实施阶段 5（`server.impl.ts`）**

### 2026-05-20 — 实施阶段 5（`server.impl.ts`）✅

- 策略：**upstream 骨架**（`server-startup-*`、`server-runtime-services`、method registry）+ fork **`ensureBuiltinAgents`**
- `registerToolEventRecipient`、`listGatewayMethods`、plugin bootstrap 已由 upstream 模块化覆盖（`server-startup-plugins.ts` 等）
- 未合并：**132 → 131**；**`src/gateway/` 全部清完**

**Review：** 确认 131；下一阶段 → **实施阶段 6（M1 `src/config/` ~19 文件）**

### 2026-05-20 — 实施阶段 6（M1 `src/config/` 16）✅

- 策略：**upstream 骨架** + fork 类型/会话补丁
- `types.openclaw.ts`：`profile.upload`（`profile.parse`）
- `sessions/types.ts` + `metadata.ts`：`SessionIdentityHints` / 飞书·微信 auto-learn
- `zod-schema.core.ts`：`IdentitySchema` 增加 `video`、`bio`
- 其余 schema/help/tests/io → upstream（fork 多为删 upstream 新增项，如 memory multimodal）
- 未合并：**131 → 115**

**Review：** 确认 115；下一阶段 → **实施阶段 7（M5–M6 `src/agents/` ~60 文件）**

### 2026-05-20 — 实施阶段 7（M5–M6 `src/agents/` 47）✅

- 基线：`git checkout --theirs -- src/agents/`（upstream 骨架）
- Fork 补丁（手工接回）：
  - `openclaw-tools.ts`：注册 ui-react 互动工具（weather_widget、question_flow、option_list 等）
  - `tools/common.ts`：`interactionPendingResult`
  - `pi-embedded-subscribe.handlers.tools.ts`：`interaction-pending` 抑制助手续写（沿用 upstream `deterministicApprovalPromptSent`）
  - `tools/message-tool.ts`：飞书/微信 `resolveAutoRecipient` 自动填 target
  - `tools/cron-tool.ts`：飞书 optional `delivery.to`、微信 ID 提取、channels.status 回退、`deleteAfterRun=false`、自动 job name
  - `workspace.ts`：`templateSubdir` + `loadTemplateWithFallback`（builtin-agents 模板子目录）
  - `skills/frontmatter.ts`：`primaryEnv` 解析顺序
  - `session-tool-result-guard-wrapper.ts` + `run/params.ts` + `run/attempt.ts`：`runId` / `messageMetadata` 持久化
- 未合并：**115 → 68**

**Review：** 确认 68；下一阶段 → **实施阶段 8（M7 `src/commands/` ~28 文件）**

### 2026-05-20 — 实施阶段 8（M7–M8 commands + auto-reply 23）✅

- 基线：`git checkout --theirs`（upstream 插件化 onboard/auth）
- 保留 fork 文件：`provider-config-orchestration.ts`（`gateway` `config.provider.apply` 仍用）
- Fork 补丁：
  - `agents.config.ts`：`applyAgentConfig` 支持 `skills` / `tools`（`builtin-agents`）
  - `agent-runner-run-params.ts`：传递 `messageMetadata`（ui-react 互动提交写 transcript）
- 说明：upstream 将 `auth-choice.apply.api-providers` 改为插件委托（`applyAuthChoiceApiProviders` → `null`）；不再内联 fork 的 provider 表
- 未合并：**68 → 45**

**Review：** 确认 45；下一阶段 → **实施阶段 9（M9–M10：channels/cli/plugins/infra/tts/terminal 等）**

### 2026-05-20 — 实施阶段 9（M9–M10 剩余 45）✅

- 基线：`git checkout --theirs`（cli/daemon/infra/plugins/tts/terminal/test 等）
- Fork 补丁：
  - `cron/isolated-agent/delivery-target.ts`：渠道别名重试、飞书/微信 target 纠错、`resolveAutoRecipient`
  - `plugins/sdk-alias.ts`：dist 内容哈希文件名回退（Electron/ui-react 打包别名）
- 冲突标记：**0**；未合并：**45 → 0**

**Review：** 全部 UU 已清；下一阶段 → **build / test / merge commit**（需你确认后再 commit）

### 2026-05-20 — A 类「fork 未改」→ `--theirs`（3）

- `src/agents/pi-hooks/context-pruning.test.ts`
- `src/agents/pi-hooks/context-pruning/pruner.ts`
- `test/helpers/auto-reply/trigger-handling-test-harness.ts`
- 未合并：218 → **215**

### 2026-05-20 — `pnpm-lock.yaml` + src 队列整理

- `pnpm install` 重生 lock（与已合并 `package.json` 对齐），已 `git add`
- 新增 [SRC_MERGE_QUEUE.md](./SRC_MERGE_QUEUE.md)（215 个 `src/` 待合并，按 M1–M10）

### 2026-05-20 — iOS `scripts/`

- `ios-beta-prepare.sh`、`ios-write-version-xcconfig.sh` → `--theirs`

### 2026-05-20 — `tsdown.config.ts`

- `--theirs` ✅

### 2026-05-20 — 清 `packages/`

- `memory-host-sdk` 4 文件（`embedding-inputs`、`embedding-vectors`、`internal`、`multimodal`）→ `--theirs`

### 2026-05-20 — 清 `skills/`

- UU：`openai-whisper-api`、`weather` → `--theirs`
- UD：`openai-image-gen/SKILL.md` → upstream 已删，`git rm`

### 2026-05-20 — 波次 0：`package.json`

- 基底 upstream + 补回 fork scripts / 21 deps / 2 devDeps；见 [package-json-merge-notes.md](./package-json-merge-notes.md)
- `pnpm-workspace.yaml`：upstream + `ui-react`、`apps/electron`、`allowBuilds.electron`

### 2026-05-20 — 清 `docs/`

- UU：`checkout --theirs`（15）；UD：`git rm`（`kilo-gateway-integration.md`、`platforms/mac/release.md`）
- 未合并：253 → **233**

### 2026-05-20 — 清 `.github/workflows/`

- `git checkout --theirs -- .github/workflows/ && git add`（6 文件）
- 未合并：271 → **253**

### 2026-05-20 — 清 `extensions/`

- UU：`checkout --theirs`；UD（upstream 删）：`git rm`（11 条，含 minimax-portal-auth、部分 CHANGELOG 等）
- **注意：** `extensions/feishu/` 已采用 upstream 版本；若 fork 飞书逻辑与 upstream 不同，后续需在 upstream 结构上 **重新接回** fork 能力
- 未合并：317 → **271**

### 2026-05-20 — 清 `apps/ios/`

- `git checkout --theirs -- apps/ios/ && git add apps/ios/`（8 文件）
- 未合并：327 → **317**

### 2026-05-20 — 清 `ui/`

- `git checkout --theirs -- ui/ && git add ui/`（9 文件）
- 未合并：336 → **327**

### 2026-05-20 — 重新启动 merge

- `git fetch upstream main` → tip `a002c416c7`
- `git merge upstream/main` → **336** 未合并
- 生成 `CONFLICT_CATALOG.md`、`unmerged-files.txt`、`unmerged-du-ud.txt`（69 DU/UD）
- 确认 `ui-react/`、`apps/electron/` **无冲突**（fork 独有已保留）

### 2026-05-20 — 回退（脚本 merge）

- `git merge --abort` → 见 [LESSONS.md](./LESSONS.md)
