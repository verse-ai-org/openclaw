# Upstream 合并跟踪

Fork（`verse-ai-org/openclaw`）与 upstream（`openclaw/openclaw:main`）的合并工作区。所有合并操作在 `merge-openclaw-main` 分支进行，**不要**在 `main` 上直接 merge。

## 文档索引

| 文件 | 用途 |
|------|------|
| [MERGE_PLAN.md](./MERGE_PLAN.md) | 合并原则、资产分区、波次顺序、单文件工作流 |
| [CONFLICT_CATALOG.md](./CONFLICT_CATALOG.md) | 初始冲突全量目录（历史快照） |
| [SRC_MERGE_QUEUE.md](./SRC_MERGE_QUEUE.md) | **剩余 `src/` 合并队列**（按 M1–M10 模块 + checklist） |
| [MERGE_STRATEGY_UI_REACT.md](./MERGE_STRATEGY_UI_REACT.md) | **总方案：不丢 fork / 保留 upstream / 依赖图 / P1–P10** |
| [UI_REACT_ELECTRON_SRC_DEPENDENCY_MAP.md](./UI_REACT_ELECTRON_SRC_DEPENDENCY_MAP.md) | **ui-react / Electron ↔ src RPC·事件·模块映射 + merge 状态** |
| [MERGE_INVENTORY.md](./MERGE_INVENTORY.md) | Fork 必须保留的功能清单 + 验收用例 |
| [PROGRESS.md](./PROGRESS.md) | **每日/每波次进度**（冲突数、完成状态、备注） |
| [SRC_MODULES.md](./SRC_MODULES.md) | **`src/` 分模块手动合并顺序与验收** |
| [modify-delete-decisions.md](./modify-delete-decisions.md) | 波次 1：`DU`/`UD` 改删冲突逐条决议 |
| [ROLLBACK.md](./ROLLBACK.md) | 回退步骤与安全点 |
| [LESSONS.md](./LESSONS.md) | 历史教训与禁止操作 |
| `unmerged-files.txt` | 当前未合并文件清单（215 个，仅 `src/` + `test/`） |
| `unmerged-du-ud.txt` | 剩余 DU/UD 改删冲突（46 个，均在 `src/`） |

## 关键 SHA（2026-05-20 更新）

| 标记 | SHA | 说明 |
|------|-----|------|
| Fork tip / 安全点 tag | `354df8b5d0` | `fork-pre-upstream-merge-20260520` |
| 分叉点 | `841ee24340` | merge-base |
| Upstream main（merge 时） | `a002c416c7` | fetch 后 tip |
| Merge 状态 | **进行中** | **162** 未合并 UU（阶段 2 已清 protocol），见 [PROGRESS.md](./PROGRESS.md) |
| Fork 独有 commit | 218 | `841ee24340..354df8b5d0` |

## 快速命令

```bash
# 当前未合并文件数
git diff --name-only --diff-filter=U | wc -l

# 导出未合并清单
git diff --name-only --diff-filter=U > merge-reports/unmerged-files.txt

# 查看 fork 侧（ours）
git show :2:path/to/file

# 查看 upstream 侧（theirs）
git show :3:path/to/file

# 查看 fork 在某文件的独有 diff
git diff 841ee24340..354df8b5d0 -- path/to/file
```

## 工作分支

- **合并分支：** `merge-openclaw-main`
- **废弃分支（勿用）：** `try-merge-main`
