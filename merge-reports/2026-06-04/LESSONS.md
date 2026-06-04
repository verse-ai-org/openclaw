# 教训与禁止项（2026-06-04）

完整历史见 [../2026-05-21/LESSONS.md](../2026-05-21/LESSONS.md)。以下为**本次合并**的补充。

---

## 继承：永久禁止

1. `git checkout --theirs -- src/` 或 `extensions/feishu/`
2. 对 `src/` 全自动 `merge-file` 循环脚本
3. 冲突 marker 未清零时全量 build/test
4. 在 `main` 上 merge official
5. 使用 `try-merge-main`

---

## 2026-05-21 已验证的有效做法（继续沿用）

- **按模块** M1→M8 推进，每模块 `git add` + 更新 PROGRESS
- B 区文件：`git diff a002c416c7..7624806f93 -- path` 接回逻辑
- `ui/`、`extensions/`（非 feishu）上次可偏 upstream；**本次 feishu 例外**
- `pnpm-lock.yaml` 最后 `pnpm install` 重生

---

## 本次与上次的差异（勿照搬旧策略）

| 上次（05-21） | 本次（06-04） |
|---------------|---------------|
| `extensions/` 全部 `--theirs` | **feishu 3 文件必须人工**（fork 有 `baed57bcbf`） |
| 336 冲突含大量 DU/UD | **仅 55 UU**，无改删冲突登记波次 |
| merge-base `841ee24340` | merge-base **`a002c416c7`**（已含上次合并结果） |
| `src/` 168 UU 分 M1–M10 | 收敛为 **M1–M8**，gateway 仍是大头 |

---

## 易错点预警

| 风险 | 说明 |
|------|------|
| `chat.ts` 体量 | 11 个 fork 提交 + official 大改；不要一次会话硬啃完，可分段 `git add -p` |
| fork 0 提交 ≠ 无脑 theirs | 仅表示自 `a002c416c7` 未改；合并后仍要扫 `<<<<<<<` |
| `agent-runner.ts` 片段 | 官方删掉 `successfulCronAdds` 等条件 → **必须保留 ours 分支** |
| 自动合并的 `ui-react` | 无冲突不代表 API 仍兼容；M6 gateway 完成后再冒烟 UI |
