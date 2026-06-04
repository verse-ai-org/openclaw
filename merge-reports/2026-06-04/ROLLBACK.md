# 回退指南（2026-06-04）

## 安全点

| 标记 | SHA | 说明 |
|------|-----|------|
| **建议新建** `fork-pre-official-merge-20260604` | `7624806f93` | 本次 merge **开始前** fork tip |
| 历史 `fork-pre-upstream-merge-20260520` | `354df8b5d0` | 2026-05-21 第一次大合并前（更早） |
| Merge-base（上次已同步 official） | `a002c416c7` | 勿 reset 到此除非明确要丢弃 245 个 fork 提交 |

**实施前务必打 tag：**

```bash
git checkout merge-openclaw-main
git tag fork-pre-official-merge-20260604 7624806f93
```

---

## 场景 1：合并进行中（有冲突、未 commit）

```bash
git checkout merge-openclaw-main
git merge --abort
git status   # 应 clean，HEAD = 7624806f93（或 tag 指向的提交）
```

---

## 场景 2：已 commit merge，但验收失败

```bash
git checkout merge-openclaw-main
git reset --hard fork-pre-official-merge-20260604
```

---

## 场景 3：仅需放弃部分已 stage 的冲突解决

```bash
git checkout --conflict=merge <path>   # 恢复为未合并状态
# 或对单文件
git show :2:path > path && git add path   # 慎用，等同重置为 ours
```

---

## 历史参考

2026-05-21 两次错误合并（批量 `--theirs`、`merge-wave2` 脚本）见 [../2026-05-21/LESSONS.md](../2026-05-21/LESSONS.md) 与 [../2026-05-21/ROLLBACK.md](../2026-05-21/ROLLBACK.md)。

**本次禁止重复相同操作。**
