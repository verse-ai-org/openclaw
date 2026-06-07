# Artifact Chip 交互 — 实施路线图

> **规范依据**：[`artifact-chip-interaction.md`](./artifact-chip-interaction.md)（交互矩阵、决策、DECISION）  
> **协议依据**：[`artifacts-protocol-design.md`](./artifacts-protocol-design.md)、[`artifacts-protocol-implementation-plan.md`](./artifacts-protocol-implementation-plan.md)  
> **状态**：可执行 backlog（**I1–I3 均未落地**；协议 Phase 1–2 已具备 `artifactRefs` / `ArtifactSummary` 基础）

## 如何使用

1. 按 **§建议执行顺序** 从上到下做；同一步内标 `可并行` 的任务可拆给不同人。  
2. 每步合入前勾选该步 **退出标准** 并跑 **验证命令**。  
3. PR 标题建议带前缀：`I1` / `I2` / `I3`，便于与协议 Phase 1–3 区分。  
4. 交互 registry 单测为行为真相；与规范漂移时先改测试再改实现。

---

## 当前基线（2026-06-05）

| 能力 | 状态 |
|------|------|
| `artifactRefs` + `ArtifactSummary` on history / send ack | ✅ 协议 Phase 1–2 |
| `ArtifactRefChip` 仅 `renderType` + `download.mode` | ❌ 待 I1 |
| `ArtifactPreviewDialog` 仅图片 | ❌ 待 I1 |
| `localRevealPath` on wire / transcript | ❌ 待 I3 |
| Electron `showItemInFolder` IPC | ❌ 待 I2 |
| path-ref chip reveal | ❌ 待 I2 + I3 |

**已知缺口（实施前扫一眼）**：G1 Web 文档 base64 发送未接通（阻塞 Web 用户 PDF 端到端）；G2 刷新后 reveal（I3 解决）；G3–G5 见交互规范 §已知缺口。

---

## 建议执行顺序

```text
┌─────────────────────────────────────────────────────────────────┐
│ 可选前置 G1-fix：Web 文档 base64 → chat.send.attachments        │
│ （不阻塞 I1 助手 PDF / Electron 验收）                           │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Phase I1 — 预览 + chip 主点击（ui-react + Electron CSP）         │
│ 无协议改动；可独立交付最大用户价值                                │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Phase I3 — Gateway localRevealPath（schema + transcript）       │
│ 与 I2 强相关；建议 gateway 先于或与 I2 同迭代                     │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Phase I2 — Electron reveal-in-folder（IPC + UI 读 localRevealPath）│
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Phase I4 — 编辑 staging（产品/backlog，非 I1–I3 阻塞）           │
└─────────────────────────────────────────────────────────────────┘
```

### PR 甘特（建议）

| 顺序 | PR | 范围 | 预估 |
|------|-----|------|------|
| 0（可选） | `G1-web-doc-send` | `GatewayChatRuntimeProvider` 非图 base64 | 0.5–1d |
| 1 | `PR-I1-ui` | I1.1–I1.5 + I1.7 | 2–3d |
| 2 | `PR-I1-electron-csp` | I1.4c（可并进 PR-I1-ui） | 0.5d |
| 3 | `PR-I3-gateway` | I3.1–I3.6 | 1–2d |
| 4 | `PR-I2-electron` | I2.1–I2.2 | 0.5–1d |
| 5 | `PR-I2-ui` | I2.3–I2.7（依赖 PR-I3） | 1d |

**可合并**：`PR-I3-gateway` + `PR-I2-ui` 同一 PR（gateway + ui-react），`PR-I2-electron` 可提前于 I3 合入（仅 IPC，无业务依赖）。

---

## Phase I1 — 预览与 chip 主点击

**目标**：助手 / 用户 `bytes` 文件 chip 可预览；chip 本体 = 主操作；下载降为次操作。  
**协议改动**：无。  
**依赖**：协议 Phase 1–2（已有）。

### 退出标准（全部勾选才算完成）

- [ ] 助手 PDF / 文本 / 音频：`download.mode: bytes` → chip 主点击 → Preview Dialog  
- [ ] 同上：次操作下载图标可用  
- [ ] 用户 Web base64 文档：chip 预览（G1 未做时仅 Electron/助手路径验收）  
- [ ] 图片：内联 + chip 预览行为不变  
- [ ] Electron Dialog 内 PDF iframe 非空白（CSP）  
- [ ] 相关单测绿  

### 步骤

| 步 | ID | 做什么 | 主要文件 | 依赖 |
|----|-----|--------|----------|------|
| 1 | I1.1 | 扩展 `ArtifactChipInteraction`（+`preview-file`、`reveal-in-folder` 占位）；resolver 入参加 `source`、`ingestChannel`、`role` | `artifact-renderer-registry.ts` | — |
| 2 | I1.2 | `resolveArtifactPrimaryInteraction()` — 实现决策矩阵（用户/助手、MIME、平台） | 同上 | I1.1 |
| 3 | I1.3 | `resolveArtifactSecondaryInteraction()` — `preview-*` → 次操作为 `download-file` | 同上 | I1.1 |
| 4 | I1.4a | `isPreviewableMime()`、`PREVIEW_MAX_BYTES`（D5：建议 20MB） | `artifact-preview-mime.ts`（新） | — |
| 5 | I1.4a | 预览字节拉取 / blob 工具 | `artifact-preview-bytes.ts`（新） | — |
| 6 | I1.4b | 扩展 Dialog：PDF iframe+blob、文本 `<pre>`、音频 `<audio>`、footer Download | `ArtifactPreviewDialog.tsx`、`artifact-preview-content.tsx`（新） | I1.4a |
| 7 | I1.4c | Electron CSP：`frame-src blob:` | `apps/electron/src/main/window.ts` | I1.4b |
| 8 | I1.5 | `ArtifactRefChip`：主点击 → 主操作；左侧图标 → 次操作；关闭时 `revokeObjectURL` | `ArtifactChip.tsx` | I1.2–I1.4b |
| 9 | I1.6 | 助手消息手动验收 | `AssistantMessage.tsx` | I1.5 |
| 10 | I1.7 | 单测：registry 矩阵、MIME 阈值、Preview 分支 | `*.test.ts` | I1.1–I1.5 |

### 验证

```bash
pnpm test ui-react/src/components/chat/artifacts/artifact-renderer-registry.test.ts
pnpm test ui-react/src/components/chat/artifacts/artifact-gateway-client.test.ts
pnpm test ui-react/src/components/chat/artifacts/artifact-preview-mime.test.ts
```

**手动**：助手产出 PDF → chip → Dialog 可见；>20MB → 下载 + toast；图片回归。

---

## Phase I3 — Gateway 持久化 `localRevealPath`

**目标**：path-ref 原始 path 写入 transcript；`chat.history` / send ack 投影；刷新后 UI 可 reveal。  
**协议改动**：additive `ArtifactSummary.localRevealPath`（**D1 已决**）。  
**依赖**：协议 Phase 2 path-ref transcript 块（已有 `file` 块，待加字段）。

### 退出标准

- [ ] transcript `file` 块含 `localRevealPath`（与 `contentIndex` / `attachmentRefs[i]` 对齐）  
- [ ] send ack + `chat.history` 的 summary 含该字段（path-ref only）  
- [ ] Web 客户端（无 electron capability）history **不含** `localRevealPath`  
- [ ] `artifacts.download` **仍不**读本地 path  
- [ ] `pnpm protocol:gen` + gateway / ui-react 测试绿  

### 步骤

| 步 | ID | 做什么 | 主要文件 | 依赖 |
|----|-----|--------|----------|------|
| 1 | I3.1 | Schema 增加 `localRevealPath?: string` | `src/gateway/protocol/schema/artifacts.ts` | — |
| 2 | I3.1 | `pnpm protocol:gen` + `protocol:check` | `dist/protocol.schema.json` 等 | I3.1 |
| 3 | I3.2 | `buildUserTranscriptContentWithAttachmentRefs` 写入 `localRevealPath: ref.path` | `src/gateway/chat-send-artifacts.ts` | I3.1 |
| 4 | I3.2 | 更新单测：display 正文仍无 path 附录；块字段含 `localRevealPath` | `chat-send-artifacts.test.ts` | I3.2 |
| 5 | I3.3 | `collectArtifactsFromMessage` 从 `file` 块读出 → summary | `src/gateway/server-methods/artifacts.ts` | I3.2 |
| 6 | I3.3 | send ack `buildChatSendAckArtifacts` 携带字段 | `chat-send-artifacts.ts` | I3.3 |
| 7 | I3.4 | history 投影：无 electron capability 时剥离 `localRevealPath` | `chat-history-artifacts.ts` 或 `chat.ts` | I3.3 |
| 8 | I3.5 | ui-react wire 类型对齐 | `ui-react/src/components/chat/types/artifact.ts` | I3.1 |
| 9 | I3.6 | 往返测试：send → history → `localRevealPath`；Web 投影无字段 | `artifacts.test.ts`、`history.test.ts` | I3.2–I3.5 |

### 验证

```bash
pnpm protocol:gen && pnpm protocol:check
pnpm test src/gateway/chat-send-artifacts.test.ts
pnpm test src/gateway/server-methods/artifacts.test.ts
pnpm test ui-react/src/components/chat/serialization/history.test.ts
```

**手动（I3 后、I2 前）**：DevTools 看 `chat.history` payload 是否含 `localRevealPath`（Electron 握手）。

---

## Phase I2 — Electron「在文件夹中显示」

**目标**：path-ref chip 点击 → `showItemInFolder(localRevealPath)`。  
**协议改动**：无（消费 I3 字段）。  
**依赖**：I1（registry 含 `reveal-in-folder`）、**I3**（`localRevealPath` 有值）。

### 退出标准

- [ ] 有 `localRevealPath` 的 path-ref chip → Finder/Explorer 定位  
- [ ] 刷新后仍可用（依赖 I3）  
- [ ] 无 `localRevealPath` → `none` + 弱提示（D9）  
- [ ] IPC 失败 → toast「找不到文件」  
- [ ] **不**以 localStorage 为主存储  
- [ ] Web 无回归  

### 步骤

| 步 | ID | 做什么 | 主要文件 | 依赖 |
|----|-----|--------|----------|------|
| 1 | I2.1 | Main：`shell.showItemInFolder`；可选 `shell.openPath`（D6） | `apps/electron/src/main/` | — |
| 2 | I2.1 | Preload 暴露 `showItemInFolder` / `openPath` | `apps/electron/src/preload/` | I2.1 |
| 3 | I2.2 | `electron-env.ts` 类型 | `ui-react/src/utils/electron-env.ts` | I2.1 |
| 4 | I2.3 | registry：`path-ref` + Electron + `localRevealPath` → `reveal-in-folder` | `artifact-renderer-registry.ts` | I1.*, I3.* |
| 5 | I2.4 | chip 主点击：读 `summary.localRevealPath`，调 IPC | `ArtifactChip.tsx` | I2.2, I2.3 |
| 6 | I2.5 | 空态：无字段弱提示；IPC 失败 toast | `ArtifactChip.tsx` | I2.5 |
| 7 | I2.6 | path-ref 风险提示 tooltip（G3 / I4 前） | `ArtifactChip.tsx` 或帮助链 | — |
| 8 | I2.7 | 单测：有/无 `localRevealPath`；mock bridge | `artifact-renderer-registry.test.ts` | I2.3–I2.6 |

### 验证

```bash
pnpm test ui-react/src/components/chat/artifacts/artifact-renderer-registry.test.ts
```

**手动（Electron）**：

1. 发送本地 PDF（path-ref）→ 点击 user chip → 文件管理器定位  
2. 刷新页面 → 再点 chip → 仍定位（验证 I3）  
3. 移动/删除原文件 → toast「找不到文件」  

---

## Phase I4 — 编辑 staging（未来，不阻塞 I1–I3）

> 详见交互规范 §Phase I4、§编辑安全。需产品决 **D7/D8** 后再排期。

| 步 | 概要 |
|----|------|
| I4.1 | 决议：默认 staging vs 就地 opt-in |
| I4.2 | Gateway：编辑意图 → 副本到 workspace |
| I4.3 | prompt 指向 staging path；`localRevealPath` 仍表原件 |
| I4.4 | UI：另存为 / 替换原文件 / 丢弃副本（✅ ui-react Electron） |
| I4.5 | 可选 `stagingRevealPath` 字段 |

---

## 已决 DECISION（实施时直接采用）

| ID | 决议 |
|----|------|
| D1 | `localRevealPath` 持久化在 Gateway transcript（**不用** localStorage 作默认） |
| D2 | 用户 base64 文档主操作 = **预览** |
| D3 | `tool-output` 与 `assistant-output` 交互 **合并** |
| D4 | Phase I1 Markdown = `<pre>` |
| D5 | 预览上限 `PREVIEW_MAX_BYTES` ≈ 20MB |
| D6 | I2 默认仅 reveal；`openPath` 可选 |
| D9 | I3 前弱提示；I3 后仅旧消息/换机/远程 |
| D10 | I1 不用 pdf.js；iframe 失败再评 |

**已决（I4）**：D7/D8 见 `artifact-chip-interaction.md` §DECISION；D8 就地 opt-in UI 仍为 backlog。

---

## 验收测试矩阵（按 Phase 勾选）

| 场景 | 环境 | 预期 | Phase |
|------|------|------|-------|
| 助手 PDF | Web | chip → Dialog 预览；次操作下载 | I1 |
| 助手 PDF | Electron | Dialog iframe 可见 | I1 + CSP |
| 助手 PDF | 任意 >20MB | 下载，跳过预览 | I1 |
| 助手 `.txt` | Web | 文本预览 | I1 |
| 助手 `.docx` | Web | 下载（不可预览） | I1 |
| 用户 PNG | Web | 内联预览（不变） | — |
| 用户 PDF base64 | Web | chip 预览 | I1（需 G1） |
| 用户 PDF path-ref | Electron | reveal | I2+I3 |
| 用户 PDF path-ref | Electron 刷新后 | reveal | I3+I2 |
| 无 `localRevealPath` | Electron | none + 弱提示 | I2 |
| 原件已删 | Electron | toast 找不到文件 | I2 |
| legacy 合成 id | 任意 | none | — |

---

## 完成定义（整个 Chip 交互计划）

- [ ] Phase I1 退出标准全部勾选  
- [ ] Phase I3 退出标准全部勾选  
- [ ] Phase I2 退出标准全部勾选  
- [ ] 交互规范 §完成定义 其余项（协议 §7.3 链接、`scenarios.md` 已同步）  
- [ ] D7/D8 有记录（可写「维持现状至 I4」）  

---

## 相关文档

| 文档 | 用途 |
|------|------|
| [`artifact-chip-interaction.md`](./artifact-chip-interaction.md) | 交互矩阵、UI 规范、DECISION 全文 |
| [`artifacts-protocol-design.md`](./artifacts-protocol-design.md) | `localRevealPath` wire 语义、§12 安全 |
| [`artifacts-protocol-implementation-plan.md`](./artifacts-protocol-implementation-plan.md) | 协议 Phase 2C = I3 任务 2.6–2.8 |
| [`../chat/scenarios.md`](../chat/scenarios.md) | send / history 事件流 |

---

## 变更记录

| 日期 | 变更 |
|------|------|
| 2026-06-05 | 初版：I1→I3→I2 执行顺序、PR 甘特、分步清单与验证命令 |
