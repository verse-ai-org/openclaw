# Official-main 合并计划（2026-06-04）

**状态：** `git merge official-main` **已启动**，**55** 未合并；目录见 [CONFLICT_CATALOG.md](./CONFLICT_CATALOG.md)。**未 commit。**

**建议安全点（实施前）：**

```bash
git tag fork-pre-official-merge-20260604 7624806f93
```

| 基准 | SHA |
|------|-----|
| Fork tip（ours） | `7624806f93` |
| 分叉点 | `a002c416c7` |
| Official tip（theirs） | `50c3995894` |

---

## 零、按维度处理（总览）

本次 merge **绝大部分已自动完成**（约 1.2 万文件）。剩余 **55 个 UU** 集中在双方都改过的路径。

| 维度 | 数量 | 策略 | 人工强度 |
|------|------|------|----------|
| **packages/gateway-protocol/** | 6 | 以 **official 结构** 为主；fork 0 提交自分叉点 → 偏 `--theirs` + 编译验证 | 低 |
| **extensions/feishu/** | 3 | **三路合并**：保留 `baed57bcbf` 流式卡片逻辑 + 官方 streaming 修复 | **高** |
| **src/config/sessions/** | 4 | 官方 SQLite/元数据骨架 + 接回 session 名修复（`cbfc338ece`） | **高** |
| **src/agents/** | 8 | B 区：message-tool、openclaw-tools、embedded runner | **高** |
| **src/auto-reply/** | 3 | B 区：agent-runner 投递判定、cron 相关 | **高** |
| **src/gateway/** | 18 | B 区：chat.ts（11 fork 提交）、server-methods、session-utils | **最高** |
| **src/cli + commands + cron + 杂项** | 14 | 多数 1–2 fork 提交：官方骨架 + 点状接回 | 中 |
| **pnpm-lock.yaml** | 1 | **不手解**；源码波次完成后 `pnpm install` 重生 | 低 |

**禁止：** 对 `src/`、`extensions/feishu/` 批量 `git checkout --theirs`（见 [LESSONS.md](./LESSONS.md)）。

**推荐顺序：** 波次 0 准备 → **M1 协议** → **M2 配置** → **M3 agents** → **M4 auto-reply** → **M5 feishu** → **M6 gateway** → **M7 杂项** → **M8 lock + 收尾**

---

## 一、合并原则（必须遵守）

### 1. 这是 merge，不是「全选 official」

| 场景 | 做法 |
|------|------|
| 仅 fork 有（无冲突） | **保留 fork**（如 `ui-react/`、`apps/electron/` 已自动保留） |
| 仅 official 改（fork 自分叉点 0 提交） | **偏 official**，但仍打开文件确认无 marker |
| 双方都改（`UU`） | **三路合并**：`git diff a002c416c7..7624806f93 -- path` 查 fork 逻辑 |
| 改/删（`DU`/`UD`） | 本次 **无** |

### 2. 禁止操作（继承 2026-05-21）

- ❌ `git checkout --theirs -- src/`
- ❌ `git checkout --theirs -- extensions/feishu/`
- ❌ 全自动 `merge-file` 脚本循环处理 `src/`
- ❌ 冲突未清完就全量 `pnpm build` / `pnpm test`
- ❌ 在 `main` 上 merge

### 3. 推荐操作

```bash
# 单文件三方对照
git show :2:path    # ours
git show :3:path    # theirs

# fork 独有改动（自上次 official 同步后）
git diff a002c416c7..7624806f93 -- path

# 采用一方后仍须手工补 fork 逻辑
git checkout --theirs -- path && vim path   # 再 git add
```

---

## 二、Fork 资产分区

### A 区 — 以 fork 为主（本次 merge 无冲突，合并后冒烟）

| 路径 | 说明 |
|------|------|
| `apps/electron/` | 528 打包、Gateway、文件上传 |
| `ui-react/` | 聊天 UI、交互卡片、automation、token 导出 |
| `skills/*`（travel、office、minimax 等） | 内置 skills |
| `.github/workflows/electron-release.yml` | Electron CI |

### B 区 — official 骨架 + **必须接回 fork 逻辑**（55 冲突的主战场）

| 路径 | Fork 关切（`a002c416c7..7624806f93`） |
|------|--------------------------------------|
| `extensions/feishu/` | `baed57bcbf` 飞书卡片流式展示 |
| `src/auto-reply/reply/agent-runner.ts` | `successfulCronAdds`、`didSendDeterministicPrompt` 等投递判定 |
| `src/config/sessions/metadata.ts` | `cbfc338ece` 渠道 session 名称非随机数 |
| `src/gateway/server-methods/chat.ts` | 11 次 fork 提交：chat/会话/cron 隐藏等 |
| `src/agents/tools/message-tool.ts` | 飞书/微信 target 自动补全 |
| `src/gateway/server.impl.ts` | Gateway 重启 / Electron 重连 |

### C 区 — 以 official 为主（fork 0 提交自分叉点）

| 路径 | 说明 |
|------|------|
| `packages/gateway-protocol/src/*` | 协议 schema 演进 |
| `src/agents/embedded-agent-runner/run*.ts` | runner 重构 |
| `packages/terminal-core/src/ansi.test.ts` | 测试 |

### D 区 — 合并后验收

见 [MERGE_INVENTORY.md](./MERGE_INVENTORY.md)。

---

## 三、执行波次

### 阶段 0 — 准备（计划阶段，实施时勾选）

- [ ] 冻结 `merge-openclaw-main` 新功能
- [ ] `git fetch` 更新 `official-main`
- [ ] 打 tag：`fork-pre-official-merge-20260604` → `7624806f93`
- [ ] 确认 merge 进行中：`test -f .git/MERGE_HEAD`
- [ ] 导出 `unmerged-files.txt`（已完成）

### 阶段 1 — merge 已启动（不 commit）

```bash
# 若需重来（未 commit 时）
# git merge --abort
# git merge official-main -m "merge(official): sync openclaw official-main"
```

- [x] merge 启动（MERGE_HEAD = `50c3995894`）
- [x] 55 未合并清单 → [CONFLICT_CATALOG.md](./CONFLICT_CATALOG.md)
- [ ] **不要 commit** 直到波次 7 完成

### 波次 1 — M1：`packages/gateway-protocol`（6 文件）

**策略：** fork 自分叉点 **0 提交** → 优先 `git checkout --theirs`，再 `pnpm tsgo` / 相关 test。

详见 [SRC_MERGE_QUEUE.md](./SRC_MERGE_QUEUE.md) M1。

### 波次 2 — M2：`src/config` + sessions（5 文件）

**策略：** 官方 SQLite/session 类型 + 接回 `metadata.ts` / `types.ts` 的 session 名逻辑。

### 波次 3 — M3：`src/agents`（8 文件）

**策略：** embedded runner 偏 official；`message-tool`、`openclaw-tools`、`workspace` 人工合并。

### 波次 4 — M4：`src/auto-reply`（3 文件）

**策略：** `agent-runner.ts` 保留 fork 投递条件 + 官方 lint/结构。

### 波次 5 — M5：`extensions/feishu`（3 文件）

**策略：** **禁止整目录 theirs**；对照 `baed57bcbf` 与 official `preserve long streaming replies` 等修复。

### 波次 6 — M6：`src/gateway`（18 文件）

**策略：** 先 `protocol/schema/agents-models-skills.ts`，再 `server-methods.ts` / `method-scopes.ts`，最后 **`chat.ts`（最大）**。

### 波次 7 — M7：CLI / commands / cron / plugins / skills / infra（12 文件）

**策略：** 多数低 fork 提交数；逐文件过 marker。

### 波次 8 — M8：锁文件 + 收尾

```bash
git diff --name-only --diff-filter=U | wc -l   # 必须为 0（除 lock 策略外）
rg '^<<<<<<< ' --glob '!node_modules' && exit 1 || true

git checkout --theirs -- pnpm-lock.yaml   # 或删除后 install
pnpm install
pnpm build
# 分批 test，见 MERGE_INVENTORY
git commit -m "merge(official): sync official-main into merge-openclaw-main"
```

---

## 四、单文件工作流

```
1. 从 SRC_MERGE_QUEUE 取下一个 [ ] 文件
2. git log --oneline a002c416c7..7624806f93 -- <path>   # fork 提交数
3. 若 0 提交 → checkout --theirs + 快速扫 marker
4. 若 ≥1 提交 → :2: / :3: 对照 + git diff a002c416c7..7624806f93 -- <path>
5. 保存 → git add <path> → 更新 PROGRESS.md
```

---

## 五、进度与回滚

- 进度：[PROGRESS.md](./PROGRESS.md)
- 回滚：[ROLLBACK.md](./ROLLBACK.md)
