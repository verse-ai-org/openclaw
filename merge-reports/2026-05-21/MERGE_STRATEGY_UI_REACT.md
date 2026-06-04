# Fork × Upstream 合并总方案（ui-react 优先）

> **目标优先级：** ① **不丢 fork 能力（围绕 ui-react）** → ② **尽量保留 upstream 新功能** → ③ **可构建、可验收**  
> **状态：** 规划 only，**暂不实施**。  
> **当前：** 未合并 **215** 文件（`git diff --name-only --diff-filter=U`），几乎全部在 `src/`。

**关联文档：**

| 文档 | 用途 |
|------|------|
| [MERGE_INVENTORY.md](./MERGE_INVENTORY.md) | A/B/C 验收清单（A4–B13） |
| [UI_REACT_PHASED_MERGE_PLAN.md](./UI_REACT_PHASED_MERGE_PLAN.md) | P0–P10 阶段与测试金字塔 |
| [SRC_MERGE_QUEUE.md](./SRC_MERGE_QUEUE.md) | 215 文件 checklist |
| [MERGE_PLAN.md](./MERGE_PLAN.md) | 资产分区 A/B/C/D |
| [LESSONS.md](./LESSONS.md) | 禁止批量 theirs |

---

## 一、合并哲学（每条冲突怎么选）

### 1.1 三层决策

```
                    ┌─────────────────────────┐
                    │ 是否 ui-react 关键路径？ │
                    └───────────┬─────────────┘
                          是    │    否
                    ┌───────────▼───────────┐
                    │ fork 在 841ee..354df8   │
                    │ 是否有实质 diff？      │
                    └───────────┬───────────┘
                     有         │         无
          ┌──────────▼──────────┐ │ ┌───────▼────────┐
          │ 三路合并，以 upstream │ │ │ 倾向 upstream │
          │ 为骨架，接回 fork 块  │ │ │ (--theirs/rm) │
          └──────────────────────┘ │ └────────────────┘
```

| 层级 | 策略 | 典型路径 |
|------|------|----------|
| **L0 冻结** | **不碰**（已无冲突） | `ui-react/`、`apps/electron/` |
| **L1 接回** | upstream 骨架 + **mandatory fork diff** | gateway/chat、chat-attachments、message-tool、metadata、server.impl |
| **L2 吸收** | 以 upstream 为主，fork 无 diff 则 theirs | 大量 M10、已 auto-merge 的 upstream 新模块 |
| **L3 补票** | merge 后单独 PR | extensions/feishu 定制、upstream 删掉的 fork 文档 |

### 1.2 禁止 vs 允许

| ❌ 禁止 | ✅ 允许 |
|--------|--------|
| `git checkout --theirs -- src/` | 单文件 theirs 后 **再** 粘贴 fork diff 块 |
| merge-file 循环整目录 | `git diff 841ee24340..354df8b5d0 -- path` 作 checklist |
| 未清冲突就 `pnpm build` 当门禁 | `pnpm --dir ui-react test`（L0，随时） |
| 混用 `ui/` 与 `ui-react` | 仅 `ui-react` + upstream `ui/` 并存 |

---

## 二、ui-react 需求 → 后端依赖图

ui-react **不 import** `src/`，只通过 **WebSocket + JSON-RPC** 耦合。合并 `src/` 时必须守住下列契约。

### 2.1 契约层（文档即标准）

| 文档 | 约束 |
|------|------|
| [ui-react/docs/chat/gateway-integration.md](../ui-react/docs/chat/gateway-integration.md) | `chat`/`agent` 事件 → RunEvent 字段 |
| [ui-react/src/components/chat/gateway/gateway-run-adapter.ts](../ui-react/src/components/chat/gateway/gateway-run-adapter.ts) | **唯一** wire 字段知识 |
| upstream `src/gateway/protocol/schema/*` | RPC 方法名、参数 schema |

**规则：** 合并 `chat.ts` 或 agent 推送逻辑后，跑 `pnpm --dir ui-react test`（尤其 `gateway-run-adapter.test.ts`）。若 upstream 改了事件形态，**二选一**：改后端回兼容形态，或 **成对** 改 adapter。

### 2.2 RPC 清单（ui-react 直接调用）

| 能力 | 方法 | 合并重点文件 |
|------|------|----------------|
| 连接 | `connect` / hello | `server.impl.ts`、ws handler、auth |
| 发消息 | `chat.send` | `server-methods/chat.ts` |
| 历史 | `chat.history` | 同上 |
| 中止 | `chat.abort` | 同上 |
| 附件 | `chat.send` + attachments | `chat-attachments.ts`、`attachment-normalize.ts` |
| 会话列表 | `sessions.list` / `sessions.delete` | `session-utils.ts`、`chat.ts` |
| Agent/技能/配置 | `agents.*`、`skills.*`、`config.*` | `server-methods/agents.ts`、`config.ts` |
| 渠道页 | `channels.*`、`config.set` | `channels.ts`、extensions（见 §五） |
| 定时任务 | `cron.*` | M7/M10 |
| Profile 抽屉 | `agents.list`、`sessions.list`；fork 另有 `profile.parse` | `profile.ts`（已 staged）、agents |

### 2.3 Fork 功能矩阵（必须保留）

#### A 区 — 已进仓库、无冲突（merge 后验收即可）

| ID | 能力 | 路径 | 合并时注意 |
|----|------|------|------------|
| A1–A3 | Electron | `apps/electron/` | 仅适配 API/端口；`package.json` scripts 已保留 |
| A4–A12 | ui-react 全系 | `ui-react/` | **不要改**；冲突在 backend |
| A13–A18 | skills | `skills/*` | 无冲突；与 upstream skills 共存 |

#### B 区 — 必须在 `src/` merge 时接回

| ID | 能力 | 路径 | 未合并？ |
|----|------|------|--------|
| B6 | 附件解析 | `src/gateway/chat-attachments.ts` | ⬜ **是** |
| B7 | 历史注入 | `server-methods/chat-transcript-inject.ts` | ⬜ **是** |
| B8 | Profile API | `server-methods/profile.ts` | ✅ 已 staged（注意 pi 包名） |
| B9 | 重启重连 | `server.impl.ts` | ⬜ **是** |
| B3 | message-tool 自动 target | `agents/tools/message-tool.ts` | ⬜ **是** |
| B4 | office-helper boot | `pi-embedded-subscribe.handlers.tools.ts` | ⬜ **是** |
| B12 | identityHints | `config/sessions/metadata.ts` | ⬜ **是** |
| B1–B2 | 互动工具 | `question-flow-tool.ts` 等 | ✅ 多已 auto-merge（无冲突） |
| B10–B11 | 飞书/微信 | extensions | ⚠️ 已 `--theirs`，见 §五 |
| B13 | recipient-resolver | `infra/outbound/recipient-resolver.ts` | ✅ 已 staged |
| B5 | minimax/ollama | commands/models | M7 未合并 |

#### 互动工具（ui-react tool-ui / interactive）

以下 fork 新增 tool 多在 `src/agents/tools/`，**多数已无冲突**（merge 自动采纳了 fork 侧新增文件）：

`question-flow-tool.ts`、`approval-card-tool.ts`、`option-list-tool.ts`、`chart-tool.ts`、`geo-map-tool.ts`、`weather-widget-tool.ts` 等。

**风险：** 未冲突 ≠ 与 upstream 新 `tool-catalog` / policy 兼容 → P5 后跑 agent 相关单测 + E2E tool 卡片。

---

## 三、215 个未合并文件怎么处理

### 3.1 按类型

| 类型 | 数量 | 处理方式 |
|------|------|----------|
| **UU** | 168 | IDE 里三路合并；**B 区文件**先导出 fork diff 再合 |
| **DU/UD** | 47 | **无 `<<<<<<<`** 居多；查 [modify-delete-decisions.md](./modify-delete-decisions.md)，禁止脚本批量删 |

### 3.2 按 ui-react 优先级

| 优先级 | 模块 | 文件约数 | 阶段 |
|--------|------|----------|------|
| **P0** | `src/gateway/protocol` | 7 | P1 |
| **P0** | `server-methods*` 清单 + `chat*` + attachments | 20+ | P2–P3 |
| **P0** | `server.impl`、ws、session-utils | 15+ | P4 |
| **P1** | `agents` subscribe + `message-tool` + tools 冲突 | 8+ | P5 |
| **P1** | `config/sessions` | 2+ | P6 |
| **P2** | `commands` onboard/minimax | 28 | P8 |
| **P2** | `auto-reply` | 5 | P7 |
| **P3** | memory、telegram、cli、wizard… | 52+ | P9 |

### 3.3 「fork 未改」快速通道

`git diff 841ee24340..354df8b5d0 -- path` 为空 → 可 `--theirs`（**剩余 0**，已处理 3 个）。

---

## 四、分阶段执行计划（合并顺序）

与 [UI_REACT_PHASED_MERGE_PLAN.md](./UI_REACT_PHASED_MERGE_PLAN.md) 一致，此处强调 **fork 接回动作**。

### 阶段 0 — 准备（已完成大半）

- [x] `merge-openclaw-main`、`upstream` fetch、安全点 tag
- [x] `package.json` + `pnpm-workspace.yaml` + `pnpm install`
- [x] ui、extensions、docs、packages、scripts、skills 等 theirs
- [ ] `test/setup.ts` 等 2–3 个（可 `--theirs`）

**门禁：** `pnpm --dir ui-react test`（L0）

---

### 阶段 1 — Gateway 协议（P1）⏱ 0.5–1 天

**文件：** `src/gateway/protocol/**`（7 个未合并）

**做法：**

1. 以 **upstream schema** 为底（新 RPC、新字段）。
2. 对照 ui-react `client.request("…")` 列表，确认无方法名被删。
3. 若 upstream 重命名了 `chat.*` 参数，记录到「adapter 待改」列表（通常不需要改 ui-react）。

**门禁：** L0 + `pnpm test:gateway -- src/gateway/protocol/`（若可跑）

---

### 阶段 2 — Gateway 注册与路由壳（P2）⏱ 1 天

**文件：** `server-methods-list.ts`、`server-methods.ts`、`method-scopes.ts`、`server-plugins.ts`、`session-utils*.ts` 等

**做法：**

1. theirs 合并注册表骨架。
2. **确认 fork 独有 handler 仍注册：** `profile.parse`（`profile.ts` 已 staged）、plugins、chat-transcript-inject。
3. `git diff 841ee24340..354df8b5d0 -- src/gateway/server-methods-list.ts` 查 fork 是否加了方法名。

**门禁：** L2 子集单测

---

### 阶段 3 — 聊天 + 附件（P3）⭐ ⏱ 1–2 天

**核心未合并：**

- `server-methods/chat.ts`（**最大**，约 30 处 marker）
- `chat-attachments.ts`、`chat-attachments.test.ts`
- `chat-transcript-inject.ts`
- `attachment-normalize.ts`

**推荐单文件工作流（每个文件）：**

```bash
git show :3:path > /tmp/up.ts    # upstream
git show :2:path > /tmp/fork.ts  # fork
git diff 841ee24340..354df8b5d0 -- path > /tmp/fork-only.patch
# 编辑器：以 /tmp/up.ts 为底，手工并入 /tmp/fork-only.patch 中 B6/B7 相关块
git add path
```

**B6 必保块：** mammoth / pdf-parse / xlsx 解析、`chat.send` 附件字段、与 ui-react `GatewayChatRuntimeProvider` 的 attachments 形状一致。

**B7 必保块：** transcript inject 逻辑（ui-react 历史/上下文）。

**门禁：**

- `pnpm test:gateway -- src/gateway/chat-attachments.test.ts`
- L0 `gateway-run-adapter.test.ts`

---

### 阶段 4 — Gateway 运行时 + 重连（P4）⭐ ⏱ 1 天

**文件：** `server.impl.ts`、`server/ws-connection/message-handler.ts`、`server/plugins-http.ts`、auth 相关 test

**做法：**

1. upstream 新启动/插件/http 路径保留。
2. **接回 fork B9：** gateway 重启后 session/WS 可恢复、ui-react `GatewayRestartingOverlay` 依赖的行为。
3. `git diff 841ee24340..354df8b5d0 -- src/gateway/server.impl.ts` 重点看重启、graceful shutdown。

**门禁：** `pnpm test:gateway -- src/gateway/reconnect-gating.test.ts`、`client.test.ts`

---

### 阶段 5 — Agent 流式与工具（P5）⭐ ⏱ 2–3 天

**未合并 tools：** `message-tool.ts`、`cron-tool.ts`、`common.ts`、`sessions-helpers.ts` 等

**未合并 subscribe/runner：** `pi-embedded-subscribe*.ts`、`pi-embedded-runner/**`（大量）

**做法：**

1. **message-tool（B3）：** upstream 重构 + fork 飞书/微信 target 自动解析 → 必须保留 resolver 挂钩。
2. **handlers.tools（B4）：** office-helper 引导逻辑。
3. **pi-embedded-runner：** 以 upstream 为主（@earendil-works/pi-*），接回 fork 流式/附件相关小 diff。
4. **互动 tools：** 已无冲突；确认 `tool-catalog` / `openclaw-tools.ts` 仍注册 fork 工具名。

**pi 包迁移（全阶段横切）：**

- `profile.ts`（已 staged）仍 `import @mariozechner/pi-ai` → 在 P5 末改为 `@earendil-works/pi-ai` 或等价 API。

**门禁：** L0 adapter 全量 + `pnpm test:gateway -- src/agents/tools/message-tool.test.ts`

---

### 阶段 6 — 配置与会话（P6）⏱ 1 天

**文件：** `config/sessions/metadata.ts`、`types.ts`、`types.openclaw.ts`、`io.ts`、zod-schema 等

**做法：**

1. upstream 新 config schema 保留。
2. **接回 B12 identityHints**（飞书/微信 direct 会话学习 recipient）。

**门禁：** `metadata.identity-hints.test.ts`（若存在且可跑）

---

### 阶段 7 — Auto-reply（P7）⏱ 0.5 天

**文件：** `src/auto-reply/reply/*`（5）

**做法：** upstream 行为 + fork 附件/会话小改动（`agent-runner-execution.ts` 等）。

---

### 阶段 8 — Commands + 渠道（P8）⏱ 2 天

**文件：** `src/commands/**`（28）、`channels.ts`、`registry.ts`

**做法：**

1. onboard/minimax/ollama（B15/B16）接回。
2. **§五 extensions 补票** 可与本阶段并行。

---

### 阶段 9 — 长尾 M10（P9）⏱ 2–4 天

**策略：**

| 子类 | 做法 |
|------|------|
| 与 ui-react 无关的 memory/telegram/daemon | 偏 upstream，spot-check |
| DU/UD（wizard、旧 telegram 路径等） | 查 upstream 搬家文档，登记后 rm 或新路径接逻辑 |
| 纯测试 | 多数 theirs |

**门禁：** `pnpm test:gateway` → `pnpm test`（可选 low profile）

---

### 阶段 10 — 收尾（P10）⏱ 1 天

```bash
git diff --name-only --diff-filter=U | wc -l  # → 0
pnpm build
pnpm test:gateway
pnpm --dir ui-react test
pnpm openclaw gateway run ...
pnpm ui:react:dev
# INVENTORY A4–B13 人工勾选
git commit   # 完成 merge
```

---

## 五、特殊风险与补票

### 5.1 extensions/feishu 已用 upstream（A10 风险）

- 合并时选了 `--theirs`，fork 飞书定制可能丢失。
- **补票策略（merge 后）：** `git diff 841ee24340..354df8b5d0 -- extensions/feishu` → 在 upstream feishu 结构上 **cherry-pick 行为**（非整文件覆盖）。
- 验收：`ui-react` Channels 页 + 真机收发。

### 5.2 extensions/openclaw-weixin

- 若 fork 独有且未冲突，应仍在；与 B11、message-tool B3 联调。

### 5.3 profile.ts 与 pi 包

- 已 staged，但 import 可能过时；在 P5 统一 pi 迁移时修。

### 5.4 upstream 新功能不要丢

下列在冲突文件中 **优先保留 upstream 新增**（再在边上接 fork）：

- 新 channel、新 provider、新 gateway 安全/探针
- 新 cron、新 skills 管线、新 memory 架构
- 新 `test:gateway` 分片、新方法 scope

**操作习惯：** 合并时 **先读 `:3:`（theirs）全文**，划掉 conflict marker 后 **粘贴 fork diff 块**，而不是整文件保留 fork。

---

## 六、验收与回归（merge commit 后）

### 6.1 自动化（建议 CI 前本地跑）

| 顺序 | 命令 |
|------|------|
| 1 | `pnpm build` |
| 2 | `pnpm test:gateway` |
| 3 | `pnpm --dir ui-react test` |
| 4 | `OPENCLAW_TEST_PROFILE=low pnpm test`（可选） |

### 6.2 ui-react E2E（[MERGE_INVENTORY](./MERGE_INVENTORY.md)）

1. 连接 / 多 session  
2. 纯文本流式 + tool-ui  
3. 互动组件（question-flow）  
4. 附件 pdf/docx  
5. Profile / Cron / Channels  
6. Gateway 重启重连  
7. `pnpm electron:dev`（可选）

### 6.3 回滚

见 [ROLLBACK.md](./ROLLBACK.md)：`git merge --abort` 或 `fork-pre-upstream-merge-20260520`。

---

## 七、人力与里程碑建议

| 里程碑 | 内容 | 累计约 |
|--------|------|--------|
| Mα | P1–P2 完成，protocol + 注册 OK | 2 天 |
| Mβ | P3–P4 完成，聊天+重连单测 OK | +2–3 天 |
| Mγ | P5–P6 完成，tool 流+session OK | +3–4 天 |
| Mδ | P7–P9 完成，冲突为 0 | +3–5 天 |
| Mε | P10 E2E 通过，merge commit | +1 天 |

**合计约 2–3 周（兼职）或 7–12 人日（专注）。**

---

## 八、每日执行 checklist（实施时用）

1. 选一个阶段（如 P3），只 `git add` 该阶段路径。  
2. 每个 B 区文件先跑 `git diff 841ee24340..354df8b5d0 -- path`。  
3. 阶段末跑对应 L0/L1/L2 测试。  
4. 更新 [SRC_MERGE_QUEUE.md](./SRC_MERGE_QUEUE.md)、[PROGRESS.md](./PROGRESS.md)。  
5. **不要** 为赶进度对 `src/gateway` 或 `src/agents` 批量 theirs。

---

## 九、一句话总结

**以 upstream 为骨架，用 `841ee24340..354df8b5d0` 的 diff 当「fork 必留清单」，按 gateway 协议 → chat/附件 → 重连 → agent 流式 → config/commands 顺序手工合并；ui-react/electron 不动；merge 后再补 feishu 等 extension 定制；全程用单测代替 ui:react:dev，最后再跑一轮完整 E2E。**
