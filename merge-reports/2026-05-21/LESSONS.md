# 历史教训

## 2026-05-20 — 第一次 merge 失败（批量 checkout --theirs）

| 做了啥 | 后果 |
|--------|------|
| 批量 `git checkout --theirs -- src/` | fork 定制实现丢失 |

**已回退：** `git reset --hard fork-pre-upstream-merge-20260520`

---

## 2026-05-20 — 第二次 merge 失败（脚本 merge-file 全自动）

| 做了啥 | 后果 |
|--------|------|
| `merge-wave2-merge-file.sh` 对 src/config、gateway、agents、commands 等 **205 文件** 全自动三路合并 | 无 conflict marker 但可能**语义错误、fork 逻辑静默丢失** |
| `merge-wave1-du-ud.sh` 批量删除 onboard-auth、minimax 等 UD 文件 | 波次 6 才被发现，风险极高 |
| 波次 5 对 ui/apps/docs 批量 `checkout --theirs` | C 区可接受，但不应与 src 脚本合并同一轮混做 |

**已回退：** `git merge --abort` → `354df8b5d0`

---

## 永久禁止

1. `git checkout --theirs -- src/` 或任何 **整目录 / 批量** 选边
2. `merge-wave2-merge-file.sh` 及类似 **对 `src/` 全自动 merge-file 循环**
3. 循环 `git show upstream/main:$f > $f` 处理所有冲突
4. 冲突 markers 未清零时运行 build / 全量 test
5. 在 `main` 分支直接 merge upstream
6. 使用 `try-merge-main`

---

## 正确做法（src 必须遵守）

- **每个文件**打开 conflict markers 或 `:2:` / `:3:` 对照，理解两边意图后再保存
- **按模块**推进（见 [SRC_MODULES.md](./SRC_MODULES.md)），每模块完成后 `git add` + INVENTORY 打勾 + 可选小范围 test
- B 区文件用 `git diff 841ee24340..354df8b5d0 -- path` 查 fork 独有 diff，**逐块接回**
- DU/UD 逐条登记 [modify-delete-decisions.md](./modify-delete-decisions.md)，**禁止脚本批量 rm**
