# Upstream 合并计划

**状态（2026-05-20）：** `git merge upstream/main` **已启动**，336 未合并；冲突目录见 [CONFLICT_CATALOG.md](./CONFLICT_CATALOG.md)。**未 commit。**  
**安全点：** `fork-pre-upstream-merge-20260520` = `354df8b5d0`

| 基准 | SHA |
|------|-----|
| Fork tip | `354df8b5d0` |
| 分叉点 | `841ee24340` |
| Upstream main | `a002c416c7`（merge 时 fetch） |

---

## 零、按维度处理（merge 后总览）

先 merge 再按维度消化，**不要**对 `src/` 批量 `--theirs`。

| 维度 | 策略 | 人工 |
|------|------|------|
| **`src/` UU（双方改）** | 三路合并 + `git diff 841ee24340..354df8b5d0 -- path` 接回 fork 逻辑 | **必须逐文件** |
| **`src/` DU/UD** | 查 upstream 搬家/重命名 → [modify-delete-decisions.md](./modify-delete-decisions.md) | 逐条 |
| **`ui/`** | **以 upstream 为主**（可 `git checkout --theirs -- ui/`） | spot-check |
| **`ui-react/`、`apps/electron/`** | fork 独有，merge 无冲突；合并后适配 gateway API | 冒烟 |
| **`extensions/`** | 飞书/微信等 fork 渠道保留；其余偏 upstream | 每插件 review |
| **根配置** | upstream 依赖 + 保留 `electron:*`、`ui:react:*` | 波次 0 |
| **docs / CI / test** | 偏 upstream（D 区 fork 文档除外） | 低 |

**推荐顺序：** 波次 0 → `ui/` → DU/UD → **`src/` UU（核心）** → extensions/apps → 收尾 build/test。

当前数量见 [CONFLICT_CATALOG.md](./CONFLICT_CATALOG.md) 总表。

---

## 一、合并原则（必须遵守）

### 1. 这是 merge，不是「全选 upstream」

| 场景 | 做法 |
|------|------|
| 仅 fork 有（无冲突） | **保留 fork** |
| 仅 upstream 改 | **采用 upstream** |
| 双方都改（`UU`） | **三路合并**：理解两边意图，合并行为 |
| 改/删（`DU`/`UD`） | **先查 upstream 是否搬家/重命名**，再决定删或留 |

### 2. 禁止操作

- ❌ `git checkout --theirs -- src/`（批量）
- ❌ **`merge-wave2-merge-file.sh` 或对 `src/` 的全自动 merge-file 循环**
- ❌ `merge-wave1-du-ud.sh` 等 **批量 DU/UD 脚本**（须逐条登记后人工处理）
- ❌ 循环 `git show upstream/main:$f > $f` 处理所有冲突
- ❌ 冲突未清完就 `pnpm build` / 全量 test
- ❌ 使用 `try-merge-main` 分支

### 3. 推荐操作

```bash
# 查看 fork 侧（ours = 当前分支在 merge 时）
git show :2:path/to/file

# 查看 upstream 侧（theirs）
git show :3:path/to/file

# 单文件采用一方后仍要手工改
git checkout --ours -- path    # 再以 upstream 为参考改
git checkout --theirs -- path  # 再补 fork 逻辑
```

---

## 二、Fork 资产分区（决定「保留谁」）

### A 区 — 以 fork 为主（冲突时优先保留己方，再适配 upstream API）

| 路径 | 说明 |
|------|------|
| `apps/electron/` | 桌面壳、Windows/macOS 打包 |
| `ui-react/` | 主聊天 UI（assistant-ui、run-projection） |
| `skills/travel-planner/` | 旅行规划 skill |
| `skills/office-helper-skill/` | Office 引导 skill |
| `skills/html-ppt-skill/` | HTML PPT skill |
| `skills/minimax-*` | Minimax 文档处理 skills |
| `skills/amap-lbs-skill/` | 高德 LBS |
| `.github/workflows/electron-release.yml` | Electron 发布 CI |

### B 区 — 以 upstream 为骨架，**必须接回 fork 逻辑**

| 路径 | Fork 相关能力 |
|------|---------------|
| `src/agents/` | 互动工具、office-helper 引导、boot、message-tool 自动补全 |
| `src/auto-reply/` | 聊天/附件/会话行为 |
| `src/gateway/` | ui-react / Electron 对接 API、chat-attachments、profile |
| `src/commands/` | onboard、channel、定时任务、minimax/ollama auth |
| `src/config/` | 飞书/微信 channel 配置、identityHints |
| `src/infra/outbound/recipient-resolver.ts` | 飞书/微信收件人自动解析 |
| `extensions/feishu/` | 飞书渠道 |
| `extensions/openclaw-weixin/` | 微信渠道（若有） |

### C 区 — 以 upstream 为主（少改或仅配置）

| 路径 | 说明 |
|------|------|
| `src/telegram/` 等 upstream 重构渠道 | 跟 upstream 结构，fork 若无独有行为则 theirs |
| `docs/`（除 fork 设计 doc） | 以 upstream 为准 |
| `.github/workflows/`（除 electron-release） | 以 upstream 为准 |
| `apps/ios`、`apps/macos` | 若不发行可偏 upstream |
| `ui/` | upstream control UI；fork 主 UI 在 `ui-react` **不要混** |

### D 区 — 合并后单独保留的 fork 文档

- `docs/design/kilo-gateway-integration.md`

---

## 三、执行波次（按顺序）

### 阶段 0 — 准备

- [x] 冻结 `main` 新功能，只在 `merge-openclaw-main` 工作
- [x] `git fetch upstream`
- [x] 确认 tag：`fork-pre-upstream-merge-20260520`
- [x] 创建 `merge-reports/` 文档体系
- [x] 填写 `MERGE_INVENTORY.md` 初稿

### 阶段 1 — 启动 merge（不 commit）

```bash
git checkout merge-openclaw-main
git status   # 必须 clean
git merge upstream/main -m "merge(upstream): sync openclaw/openclaw main"
```

- 导出清单：`git diff --name-only --diff-filter=U > merge-reports/unmerged-files.txt`
- 生成维度目录：`merge-reports/CONFLICT_CATALOG.md`（见仓库内脚本或重新跑统计）
- **不要 commit**

**2026-05-20 已完成阶段 1：** 336 未合并；`ui-react/`、`apps/electron/` 无冲突项。

### 波次 0 — 根配置（~10 文件）

| 文件 | 策略 |
|------|------|
| `package.json` | upstream 依赖/scripts + **保留** `electron:*`、`ui:react:*` |
| `pnpm-workspace.yaml` | upstream + `ui-react`、`apps/electron` |
| `pnpm-lock.yaml` | **不手解**；波次 0 其他文件 `git add` 后 `pnpm install` 重生 |
| `.npmrc`、`.oxlintrc.json`、`tsdown.config.ts`、`openclaw.mjs` | 以 upstream 为主 |
| `CHANGELOG.md`、`appcast.xml` | upstream（fork 发布笔记可另文档） |
| `git-hooks/pre-commit` | upstream |

**注意：** 为跑 `pnpm install`，extension 的 `package.json` 若仍有 `<<<<<<<` 可**仅对该文件**用 upstream 版本；**extension 源码不在此波次批量处理**。

### 波次 1 — 改/删冲突 `DU`/`UD`

维护 [modify-delete-decisions.md](./modify-delete-decisions.md)，逐条登记。

### 波次 2 — `src/config` + `src/gateway`（**逐文件人工**）

见 [SRC_MODULES.md](./SRC_MODULES.md) M1–M4。**禁止 merge-file 脚本。**

### 波次 3 — `src/agents` + `src/commands`（**逐文件人工**）

见 [SRC_MODULES.md](./SRC_MODULES.md) M5–M7。

### 波次 4 — `src/` 其余 + `extensions/` + `packages/`

见 [SRC_MODULES.md](./SRC_MODULES.md) M8–M10；extensions 逐插件 review。

### 波次 5 — `ui/`、`apps/`、`docs/`、CI、test

`ui/` 与 `ui-react` 不要混。

### 波次 6 — 收尾

```bash
git diff --name-only --diff-filter=U | wc -l   # 必须为 0
grep -r '^<<<<<<< ' --include='*.{ts,tsx,js,mjs,yml,yaml,json,swift,md}' . && exit 1 || true
pnpm install
pnpm build
pnpm test   # 可选分批
```

冒烟验收见 [MERGE_INVENTORY.md](./MERGE_INVENTORY.md)，通过后 `git commit` 完成 merge。

---

## 四、单文件合并工作流

```
1. git diff --name-only --diff-filter=U | grep '<模块>'
2. 取一个文件 path
3. git show :2:path > /tmp/ours.ts
   git show :3:path > /tmp/theirs.ts
4. 判断属于 A/B/C 哪区
5. 合并 → 保存 → git add path
6. 重复直到该模块列表为空
```

---

## 五、进度跟踪

详见 [PROGRESS.md](./PROGRESS.md)。

---

## 六、回滚

详见 [ROLLBACK.md](./ROLLBACK.md)。
