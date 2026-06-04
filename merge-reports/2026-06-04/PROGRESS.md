# 合并进度（2026-06-04）

> **状态：** **M8 完成** — merge commit 待执行（`pnpm build` 已通过）。  
> 实施时每完成一个 M* 模块，更新本表并勾选 [SRC_MERGE_QUEUE.md](./SRC_MERGE_QUEUE.md)。

---

## 总览

| 项目 | 值 |
|------|-----|
| 工作分支 | `merge-openclaw-main` |
| 建议安全点 tag | `fork-pre-official-merge-20260604` → `7624806f93`（✅ 已打） |
| Official tip | `50c3995894` |
| Merge-base | `a002c416c7` |
| Merge 状态 | **待 commit**（冲突已清，`pnpm build` ✅） |
| 未合并 UU | **0** |
| DU/UD | **0** |

---

## 波次 checklist

| 波次 | 模块 | 文件数 | 状态 | 备注 |
|------|------|--------|------|------|
| 0 | 准备（tag、清单） | — | ✅ | tag `fork-pre-official-merge-20260604` |
| 1 | M1 协议包 | 7 | ✅ | `git checkout --theirs` + add，无 marker |
| 2 | M2 config/sessions | 5 | ✅ | identityHints + official store API |
| 3 | M3 agents | 8 | ✅ | interactive tools + auto-fill + official runner |
| 4 | M4 auto-reply | 3 | ✅ | side-effect vs source delivery 拆分 |
| 5 | M5 feishu | 3 | ✅ | 全量 replace close + fallback + discard |
| 6 | M6 gateway | 18 | ✅ | protocol 迁包 + chat 附件/UI + channels catalog |
| 7 | M7 杂项 | 12 | ✅ | sinceMs / enableChannel / install-download |
| 8 | M8 lock + build + commit | 1 | ✅ | lock staged；build 绿；补 protocol 导出 |
| — | 无冲突回归 | ui-react / electron | ⬜ | merge commit 后 |

---

## 日志

### 2026-06-04 — 计划阶段 ✅

- 对比 [2026-05-21](../2026-05-21/)：本次仅 **55 UU**，无 DU/UD
- 导出 `unmerged-files.txt`
- 生成 `MERGE_PLAN.md`、`CONFLICT_CATALOG.md`、`SRC_MERGE_QUEUE.md`
- **未** 解决任何冲突 marker；**未** `pnpm build`

**下一步：** **M6 gateway**（18 文件，`chat.ts` 最后）

### 2026-06-04 — M2 ✅

- `metadata.ts`：保留飞书/微信 `deriveIdentityHintsPatch` + 官方 `deriveSessionOrigin`
- `types.ts`：官方 ACP re-export + 保留 `SessionIdentityHints`
- `store.ts`：官方 `runExclusiveSessionStoreWrite` + fork `maybePersistIdentityHintsToConfig`
- `types.openclaw.ts`：官方骨架 + fork `profile.upload` 配置
- `bundled-channel-config-metadata.generated.ts`：`--theirs`
- 未合并：**49 → 44**

### 2026-06-04 — M3 ✅

- `embedded-agent-runner/run*.ts`：official
- `openclaw-tools.ts`：official + 互动 UI 工具注册
- `message-tool.ts`：飞书/微信 auto-fill + official 抑制逻辑
- `common.ts`：`interactionPendingResult` + official progress API
- `session-tool-result-guard-wrapper.ts`：prepared turn + metadata/runId
- `workspace.ts`：attestation 检查 + `loadTemplateWithFallback`
- `openai-responses.reasoning-replay.test.ts`：official
- 顺带修复 `model-scan.ts` marker（非 M3 清单，工作区遗留）
- 未合并：**44 → 36**

### 2026-06-04 — M4 ✅

- `agent-runner.ts`：official 拆分 `hasSuccessfulSourceReplyDelivery` / `hasSuccessfulSideEffectDelivery`；cron/确定性投递留在 side-effect；统一 `didSendDeterministicPrompt`
- `get-reply-run.ts`：`inputProvenance` + fork `messageMetadata` + `suppressNextUserMessagePersistence`
- `get-reply-options.types.ts`：official 类型 + fork `suppressNextUserMessagePersistence`（及 modelOverride 字段保留）
- 未合并：**36 → 33**

### 2026-06-04 — M5 ✅

- `streaming-card.ts`：fork 全量 replace + 重试 `contentSynced`；official `discard()` + 空 final 清理
- `reply-dispatcher.ts`：sync 失败 fallback 卡片 + `markVisibleReplySent` / `streamingClosedForReply`
- `reply-dispatcher.test.ts`：保留 fork fallback 测试 + official assistant-message-start 测试
- 未合并：**33 → 30**

### 2026-06-04 — 波次 0 + M1 ✅

- Tag：`fork-pre-official-merge-20260604` @ `7624806f93`
- M1：`packages/gateway-protocol`（5）+ `packages/terminal-core/src/ansi.test.ts` → `--theirs`，已 `git add`
- 未合并：**55 → 49**
- 未跑 build/test（按约定收尾再验证）

---

## 未合并计数追踪（实施时填写）

| 日期 | 未合并数 | 完成模块 | 操作人/备注 |
|------|----------|----------|-------------|
| 2026-06-04 | 55 | — | 计划基线 |
| 2026-06-04 | 49 | M1 | 协议包 theirs |
| 2026-06-04 | 44 | M2 | config/sessions 三路合并 |
| 2026-06-04 | 36 | M3 | agents 8 文件 |
| 2026-06-04 | 33 | M4 | auto-reply 3 文件 |
| 2026-06-04 | 30 | M5 | feishu 3 文件 |
| 2026-06-04 | 13 | M6 | gateway 18 文件（chat 最后） |
