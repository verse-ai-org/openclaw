# Official-main 合并跟踪（2026-06-04）

Fork（`merge-openclaw-main`）与官方镜像（`official-main`）的第二次大规模同步。上一次合并止于 `a002c416c7`（见 [2026-05-21](../2026-05-21/)）。

**工作分支：** `merge-openclaw-main`（勿在 `main` 上 merge）

## 文档索引

| 文件 | 用途 |
|------|------|
| [MERGE_PLAN.md](./MERGE_PLAN.md) | 合并原则、资产分区、波次顺序、单文件工作流 |
| [CONFLICT_CATALOG.md](./CONFLICT_CATALOG.md) | 55 个未合并文件目录 + 策略标注 |
| [SRC_MERGE_QUEUE.md](./SRC_MERGE_QUEUE.md) | **按 M1–M8 的执行队列与 checklist** |
| [MERGE_INVENTORY.md](./MERGE_INVENTORY.md) | Fork 必须保留的功能 + 验收用例（本次增量） |
| [PROGRESS.md](./PROGRESS.md) | 波次进度（实施时更新） |
| [ROLLBACK.md](./ROLLBACK.md) | 回退步骤与安全点 |
| [LESSONS.md](./LESSONS.md) | 继承 2026-05-21 禁止项 + 本次差异说明 |
| `unmerged-files.txt` | 当前未合并清单（55） |

## 关键 SHA（2026-06-04 快照）

| 标记 | SHA | 说明 |
|------|-----|------|
| Fork tip（merge 前 ours） | `7624806f93` | `fix(chat): 修复交互卡片在会话中状态…` |
| 分叉点 / merge-base | `a002c416c7` | 与 2026-05-21 合并后的 upstream tip 一致 |
| Official tip（theirs） | `50c3995894` | `fix(e2e): fail secret provider startup exits fast` |
| MERGE_HEAD | `50c3995894` | merge 进行中，**未 commit** |
| 未合并 | **55** | 全部为 **UU**（双方修改），无 DU/UD |
| Fork 独有 commit（自分叉点） | **245** | `a002c416c7..7624806f93` |
| Official 前进 commit | **5534** | `a002c416c7..50c3995894` |

## 与 2026-05-21 的差异

| 项目 | 2026-05-21 | 2026-06-04 |
|------|------------|------------|
| 未合并规模 | 336 → 215（src） | **55**（仅热点） |
| 冲突类型 | UU + DU + UD | **仅 UU** |
| `extensions/` | 批量 upstream | **飞书 3 文件须人工**（fork 有流式卡片修复） |
| `ui/` / 根配置 | 独立波次 | **已自动合并**（无冲突项） |
| 安全点 tag | `fork-pre-upstream-merge-20260520` | 建议新建 `fork-pre-official-merge-20260604` |

## 快速命令

```bash
# 未合并数
git diff --name-only --diff-filter=U | wc -l

# 导出清单
git diff --name-only --diff-filter=U > merge-reports/2026-06-04/unmerged-files.txt

# merge 三方对照
git show :2:path/to/file   # ours（merge-openclaw-main）
git show :3:path/to/file   # theirs（official-main）

# fork 自上次合并后的独有 diff
git diff a002c416c7..7624806f93 -- path/to/file

# fork 在某文件的提交列表
git log --oneline a002c416c7..7624806f93 -- path/to/file
```

## 推荐入口

1. 读 [MERGE_PLAN.md](./MERGE_PLAN.md) 波次 0–7  
2. 按 [SRC_MERGE_QUEUE.md](./SRC_MERGE_QUEUE.md) 从 **M1** 开始勾选  
3. 每波次后更新 [PROGRESS.md](./PROGRESS.md)
