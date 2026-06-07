# Chat Artifacts 实施计划

> **设计依据**：[`artifacts-protocol-design.md`](./artifacts-protocol-design.md)  
> **状态**：可执行 backlog（按 PR 粒度拆分）  
> **协议版本**：不升级 `PROTOCOL_VERSION`；仅 additive schema / 行为

## 如何使用本文

1. 按 **Phase → Track → PR** 顺序做；同一 PR 内的任务可并行，跨 PR 看 **依赖** 列。
2. 每个 PR 合入前跑 **验证** 列命令；满足 **验收（AC）** 再勾 `[x]`。
3. 在 PR 描述里写 `Phase-X / PR-Y` 便于追踪。
4. 开放问题（设计 §13）在 Phase 1 不阻塞；标 `DECISION` 的项需在 Phase 2 前定案。

---

## 总览

| Phase | 目标 | 建议 PR 数 | 用户可见变化 |
|-------|------|------------|--------------|
| **1** | 协议 + Gateway 投影 + ui-react 读路径 | 4–6 | 发图后 history 有 `artifactRefs`；可 list/download |
| **2** | Electron 文档进 transcript 索引 | 2–3 | PDF 出现在 `artifacts.list`；附录缩短 |
| **3** | 流式、弃用、Control UI 对齐 | 3–4 | 助手图流式带 artifacts；旧 strip 退场 |

```text
Phase 1A (schema) → 1B (gateway send/history) → 1C (ui-react) → 1D (docs/tests)
Phase 2A (transcript blocks) → 2B (web fallback + appendix)
Phase 3A (chat.final) → 3B (deprecate) → 3C (ui/ registry)
```

---

## Phase 1 — 协议与投影（最小可行）

**Phase 退出标准（必须全部满足）**

- [x] 用户通过 `chat.send` 发送 **图片** 后，`chat.history` 返回的 user 消息含 `artifactRefs`，且 `content` 不含附件附录为主路径。
- [x] 同一 session 调用 `artifacts.list` 能列出该图（含 user `MediaPaths` 索引），`artifacts.download` 在 `mode: bytes` 时可预览。
- [x] ui-react 重载 history 后附件标签可见，**不依赖** `stripAttachmentContent`（strip 仍作 fallback）。
- [x] `pnpm protocol:gen` 完成；`src/gateway/chat-*-artifacts*.test.ts` + ui-react history/normalize 测试绿。
- [ ] `pnpm protocol:check`（含 Swift gen）在合入前全量跑一遍。

---

### Track 1A — Schema & codegen（Gateway）

| ID | 任务 | 文件 / 动作 | 依赖 | 验收（AC） |
|----|------|-------------|------|------------|
| 1A.1 | 新增 `ArtifactRefSchema` | `src/gateway/protocol/schema/artifacts.ts` | — | `artifactId` + 可选 `role`；`additionalProperties: false` |
| 1A.2 | 扩展 `ArtifactSummarySchema` | 同上 | 1A.1 | 新增可选：`source`, `role`, `contentIndex`, `ingestChannel`（string enum） |
| 1A.3 | 导出到 protocol barrel | `src/gateway/protocol/schema/protocol-schemas.ts` | 1A.2 | `ArtifactRef` 出现在 `protocol-schemas` / `schema.ts` |
| 1A.4 | 定义 `ChatSendAckSchema`（或扩展既有 result） | `src/gateway/protocol/schema/logs-chat.ts` 或新 `chat-results.ts` | 1A.2 | `{ runId, status, artifacts?: ArtifactSummary[] }` |
| 1A.5 | 定义 history 消息投影类型 | `logs-chat.ts` 或 `artifacts.ts` | 1A.1 | `ChatHistoryMessageProjection`: `artifactRefs?: ArtifactRef[]`；`attachments` 保留 Optional Unknown 作 compat |
| 1A.6 | 跑 codegen | `pnpm protocol:gen` `pnpm protocol:gen:swift` | 1A.3–1A.5 | `git diff dist/protocol.schema.json` 仅预期变更 |
| 1A.7 | protocol check | `pnpm protocol:check` | 1A.6 | CI 本地通过 |

**PR-1A 建议标题**：`gateway(protocol): additive ArtifactRef and chat send/history artifact fields`

**验证**

```bash
pnpm protocol:gen && pnpm protocol:gen:swift && pnpm protocol:check
```

---

### Track 1B — Gateway 行为（send ack + history 投影）

| ID | 任务 | 文件 / 动作 | 依赖 | 验收（AC） |
|----|------|-------------|------|------------|
| 1B.1 | 实现 `buildArtifactSummariesFromChatSend(...)` | 新模块 `src/gateway/chat-artifact-summaries.ts`（或扩 `chat-attachments.ts`） | 1A | 输入：ingest 结果（images、offloadedRefs、refs）；输出 `ArtifactSummary[]`，id 算法与 `artifacts.ts` `artifactId()` **一致** |
| 1B.2 | `chat.send` respond 附带 `artifacts` | `src/gateway/server-methods/chat.ts` | 1B.1, 1A.4 | 集成测试：send 带 png → ack payload 含 ≥1 artifact，`type: image` |
| 1B.3 | history 投影 helper | `src/gateway/chat-history-artifacts.ts`（或 `chat-display-projection.ts`） | 1A.1, `splitUserMessageForChatHistoryDisplay` | 对每条 user/assistant 消息：`displayText` + `artifactRefs`（从 transcript 块 + 附录 hints 推导） |
| 1B.4 | `chat.history` 挂载 `artifactRefs` | `chat.ts` `chat.history` handler | 1B.3 | 返回 messages 每项含 `artifactRefs`；display `content` 已剥附录 |
| 1B.5 | `collectArtifactsFromMessages` 对齐 | `server-methods/artifacts.ts` | 1B.1 | 新字段 `source`/`ingestChannel` 在 list 结果中可见（若块可索引） |
| 1B.6 | 单元测试 | `chat-artifact-summaries.test.ts`, 扩 `server.chat.gateway-server-chat-b.test.ts` 或 `chat.directive-tags.test.ts` | 1B.2–1B.4 | 覆盖：纯文本无 artifacts；单图 send+history；dedupe in_flight 仍稳定 |

**PR-1B 建议拆分**

- **PR-1B-send**：1B.1 + 1B.2 + send 测试  
- **PR-1B-history**：1B.3 + 1B.4 + history 测试  

**验证**

```bash
pnpm test src/gateway/chat-artifact-summaries.test.ts
pnpm test src/gateway/server.chat.gateway-server-chat-b.test.ts
pnpm test src/gateway/server-methods/artifacts.test.ts
```

---

### Track 1C — ui-react（canonical + UI）

| ID | 任务 | 文件 / 动作 | 依赖 | 验收（AC） |
|----|------|-------------|------|------------|
| 1C.1 | Wire 类型 | `ui-react/src/components/chat/types/artifact.ts`（新） | 1A.6 | 与 `ArtifactSummary` / `ArtifactRef` 同形；可从 JSON schema 手对齐或后续 gen |
| 1C.2 | Canonical 类型 | `conversation/types/message.ts`, `events.ts` | 1C.1 | `CanonicalMessage.artifactRefs?`；`message.start` 可带 `artifactRefs` |
| 1C.3 | Reducer | `conversation/reducer.ts` | 1C.2 | snapshot / start 保留 `artifactRefs`；replay 测试过 |
| 1C.4 | History 反序列化 | `serialization/history.ts` | 1B.4, 1C.2 | 读 `raw.artifactRefs`；无则 fallback `stripAttachmentContent` + synthetic ref（仅 title，id 占位或省略） |
| 1C.5 | `chat.send` ack 处理 | `GatewayChatRuntimeProvider.tsx` | 1B.2, 1C.3 | ack 后 patch 当前 user 消息的 `artifactRefs` |
| 1C.6 | Artifact cache store | `ui-react/src/store/artifact-cache.store.ts`（新，可选） | 1C.1 | `sessionKey → Map<id, ArtifactSummary>`；`artifacts.list` 填充 |
| 1C.7 | `UserMessage` 渲染 | `UserMessage.tsx` + `ArtifactChip.tsx`（新） | 1C.4, 1C.6 | 按 `artifactRefs` 显示；`download.mode` 控制预览按钮 |
| 1C.8 | `artifacts.list` 客户端 | `gateway` hook 或 loader | 1C.6 | session 切换时 prefetch list（可选 Phase 1） |
| 1C.9 | 测试 | `history.test.ts`, `parse-send-payload.test.ts`, reducer test | 1C.4–1C.7 | golden：history JSON 含 `artifactRefs` → UI 有 chip |

**PR-1C 建议拆分**

- **PR-1C-model**：1C.1–1C.4 + tests  
- **PR-1C-ui**：1C.5–1C.9  

**验证**

```bash
pnpm test ui-react/src/components/chat/serialization/history.test.ts
pnpm test ui-react/src/components/chat/conversation
```

---

### Track 1D — 文档与协议说明

| ID | 任务 | 文件 | 依赖 |
|----|------|------|------|
| 1D.1 | 更新 Gateway 协议文档 | `docs/gateway/protocol.md` | 1B |
| 1D.2 | 更新 chat 场景手册 | `ui-react/docs/chat/scenarios.md` | 1C |
| 1D.3 | 勾选设计 doc Phase 1 checklist | `artifacts-protocol-design.md` §10 | 全部 1x |

**PR-1D**：docs only（可在 1C 同 PR 末尾提交）

---

## Phase 2 — Electron 文档纳入 artifact 索引

**Phase 退出标准**

- [x] Electron `attachmentRefs` 发送 PDF 后，`artifacts.list` 能列出（`download.mode` 可能为 `unsupported`，但 **id/title/mime** 正确）。
- [x] `chat.history` 的 user 消息 `artifactRefs` 含该文档。
- [x] 用户可见 transcript / history **display 正文不含** path 附录（路径在 `formatAttachmentRefsForAgent` 当轮给 agent）。
- [ ] transcript `file` 块 + `ArtifactSummary` 含 **`localRevealPath`**（path-ref）；刷新后 Electron reveal（Interaction Phase I3）。

| ID | 任务 | 文件 | 依赖 | AC |
|----|------|------|------|-----|
| 2.1 | ingest refs 时写 transcript 块 | `chat.ts` + transcript append 路径 | Phase 1 | 块类型 `file` 或 internal `artifact` marker，可供 `isArtifactBlock` 识别 |
| 2.2 | 缩短 `buildAttachmentRefsAppendix` | `chat.ts` | 2.1 | display 路径无附录；测试 agent 仍收到 path（`formatAttachmentRefsForAgent`） |
| 2.3 | Web 文档 base64 fallback | `GatewayChatRuntimeProvider` + `attachment-adapter` | 2.1 | Web 非图可走 `attachments`；ack artifacts 一致 |
| 2.4 | `buildArtifactSummariesFromChatSend` 覆盖 refs | `chat-artifact-summaries.ts` | 2.1 | send ack `artifacts` 含 document |
| 2.5 | 测试 | `chat.directive-tags.test.ts`, electron e2e（若有） | 2.1–2.4 | PDF roundtrip list + history |
| 2.6 | **`localRevealPath` schema + 持久化** | `artifacts.ts`, `chat-send-artifacts.ts`, `artifacts.ts` collect | 2.1 | transcript `file.localRevealPath`；ack/history 投影；见交互 doc I3 |
| 2.7 | capability 门控 | `chat-history-artifacts.ts` | 2.6 | Web history 无 `localRevealPath` |
| 2.8 | ui-react 类型 + history 测试 | `types/artifact.ts`, `history.test.ts` | 2.6 | roundtrip 字段 |

**PR 建议**：2A = 2.1+2.2+2.4+测试；2B = 2.3 Web；**2C = 2.6+2.7+2.8**（`localRevealPath`，可与 Interaction I3 同 PR）

**DECISION（Phase 2 前）**：opaque `artifactId` vs 保持 hash — 默认 **保持 hash**。

**验证**

```bash
pnpm test src/gateway/server-methods/chat.directive-tags.test.ts
pnpm test src/gateway/server-methods/artifacts.test.ts
```

---

## Phase 3 — 流式、弃用、多客户端

**Phase 退出标准**

- [ ] `chat.final`（可选 `chat.delta`）payload 可带 `artifacts`。
- [ ] ui-react / Control UI 对 assistant 产出图使用同一 `ArtifactChip` 契约。
- [ ] `stripAttachmentContent` / `MessageAttachment` 标 `@deprecated`；doctor 或日志提示一次。

| ID | 任务 | 文件 | 依赖 |
|----|------|------|------|
| 3.1 | 扩展 `ChatFinalEventSchema` | `logs-chat.ts` | Phase 1 |
| 3.2 | 派发 final 时附 artifacts | `chat.ts` emit 路径 | 3.1 |
| 3.3 | ui-react event bridge | `use-gateway-event-bridge.ts` | 3.2 |
| 3.4 | Assistant 消息 artifact 渲染 | assistant message 组件 | 3.3 |
| 3.5 | Control UI 类型对齐 | `ui/src/ui/ui-types.ts` → 共用或镜像 `ArtifactRef` | 3.4 |
| 3.6 | 弃用 strip + hints | `history-attachment-strip.ts`, `message-normalize.ts` | 3.4 稳定 1 版本 |
| 3.7 | `openclaw doctor` 提示（可选） | doctor 模块 | 3.6 |

---

## Interaction Phase（chip 预览 / reveal，与协议 Phase 正交）

> 交互规范：**[`artifact-chip-interaction.md`](./artifact-chip-interaction.md)**；执行路线图：**[`artifact-chip-implementation-plan.md`](./artifact-chip-implementation-plan.md)**。  
> 建议在协议 Phase 1–2 完成后优先 **I1**，再 **I3 + I2**（`localRevealPath` + Electron reveal，可同 PR）。

| Phase | 概要 | 协议改动 |
|-------|------|----------|
| I1 | 扩展 Preview Dialog；`source`/`role` 驱动 chip 主点击 | 无 |
| I2 | `showItemInFolder` IPC；读 `summary.localRevealPath` | 无（消费 I3 字段） |
| I3 | Gateway 持久化 **`localRevealPath`**（**默认，已决 D1**） | additive schema + transcript |
| I4 | 编辑 staging / 默认副本编辑（产品） | Gateway + UI；见交互 doc §Phase I4 |

---

## 跨阶段任务（随时）

| ID | 任务 | 说明 |
|----|------|------|
| X.1 | SDK 类型同步 | `docs/concepts/openclaw-sdk.md` 示例用 `artifacts.list` + 新 ack 字段 |
| X.2 | 性能 | `artifacts.list` 对大 session 做 limit（若尚无） |
| X.3 | 安全审计 | `localRevealPath` 仅 path-ref + Electron capability；`artifacts.download` 仍不读本地 path；远程 Gateway 部署说明 |

---

## 建议 PR 顺序（甘特式）

| 周次 | PR | 内容 |
|------|-----|------|
| W1 | PR-1A | Schema + protocol:gen |
| W1 | PR-1B-send | send ack artifacts |
| W2 | PR-1B-history | history artifactRefs 投影 |
| W2 | PR-1C-model | ui-react canonical + history |
| W2–W3 | PR-1C-ui | UserMessage + cache + list |
| W3 | PR-1D | docs |
| W4 | PR-2A | transcript blocks + appendix |
| W4 | PR-2B | Web fallback |
| W5+ | PR-3* | 流式 + 弃用 + ui/ |

---

## 测试矩阵（最小）

| 场景 | Gateway | ui-react |
|------|---------|----------|
| 纯文本 send | ack 无 artifacts | 无 chip |
| 单图 send (web) | ack 1 image；history artifactRefs | chip + 重载仍在 |
| 单图 list/download | list 含 id；download bytes | 预览可选 |
| Electron PDF | Phase 2：list 含 file | chip FileText |
| in_flight dedupe | ack 不重复 artifacts | — |
| legacy 仅附录 history | artifactRefs 空；strip fallback | chip 仍显示 |

---

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| `artifactId` 与 transcript 块不一致 | 单一 helper `artifactId()` 共用；测试对照 `collectArtifactsFromMessages` |
| history 投影漏剥附录 | 复用 `splitUserMessageForChatHistoryDisplay`；双写测试 raw vs projected |
| 乐观 UI ack 竞态 | 用 `idempotencyKey` / user message id 关联 patch |
| 大 session list 慢 | Phase 1 仅 on-demand list；按 runId 过滤 |
| Swift/macOS 客户端未更新 | additive 字段可选；`protocol:check` 保证生成物同步 |

---

## 完成定义（整个计划）

- [ ] Phase 1–3 退出标准全部勾选  
- [ ] `artifacts-protocol-design.md` §10 checklist 同步勾选  
- [ ] `docs/gateway/protocol.md` 与 SDK 文档已更新  
- [ ] 无新增 `PROTOCOL_VERSION` bump（除非日后显式决策）  

---

## 变更记录

| 日期 | 变更 |
|------|------|
| 2026-06-04 | 初版实施计划，对应设计草案 |
