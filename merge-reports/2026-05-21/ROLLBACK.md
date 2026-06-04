# 回退指南

## 安全点

| 标记 | SHA | 说明 |
|------|-----|------|
| `fork-pre-upstream-merge-20260520` | `354df8b5d0` | 合并前 fork 完整状态 |

---

## 场景 1：合并进行中（有冲突、未 commit）

```bash
git checkout merge-openclaw-main
git merge --abort
git status   # 应 clean，HEAD = 354df8b5d0
```

---

## 场景 2：已 commit merge，但验收失败

```bash
git checkout merge-openclaw-main
git reset --hard fork-pre-upstream-merge-20260520
```

---

## 历史回退记录

### 2026-05-20（第一次错误合并 — 批量 checkout --theirs）

**撤销 commit：** `690dac8eae`

**原因：** 波次 2 后批量用 upstream 覆盖 168 个冲突文件。

**操作：** `git reset --hard fork-pre-upstream-merge-20260520`

---

### 2026-05-20（第二次错误合并 — 脚本 merge-file 全自动）

**操作：**

```bash
git merge --abort   # 合并进行中，未 commit
```

**结果：** `HEAD` = `354df8b5d0`，工作区 clean，merge 状态清除。

**原因：** 使用 `merge-wave2-merge-file.sh` 等对 `src/` 等 **205+ 文件做全自动三路合并**，无人工 review，存在功能静默丢失风险。**此方式永久禁止。**

**保留：** `merge-reports/` 文档（已更新合并策略）；**删除/不恢复** `scripts/merge-wave*.sh`。

**后续：** 重新 `git merge upstream/main`，`src/` **按模块逐文件人工合并**（见 [MERGE_PLAN.md](./MERGE_PLAN.md) 与 [SRC_MODULES.md](./SRC_MODULES.md)）。
