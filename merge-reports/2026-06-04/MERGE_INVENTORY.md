# Fork 资产清单与验收用例（2026-06-04 增量）

在 [2026-05-21 MERGE_INVENTORY](../2026-05-21/MERGE_INVENTORY.md) 基础上，补充 **自 `a002c416c7` 以来** 的 fork 提交（245 commits）相关验收。合并完成后逐项勾选。

**Fork diff 范围：** `a002c416c7..7624806f93`

---

## P0 — 必须通过（与 55 冲突文件直接相关）

| ID | 功能 | 关键路径 | 验收用例 | 状态 |
|----|------|----------|----------|------|
| P0-1 | 飞书流式卡片 | `extensions/feishu/src/streaming-card.ts` | 长回复流式更新卡片内容正确 | ⬜ |
| P0-2 | 飞书 reply 投递 | `extensions/feishu/src/reply-dispatcher.ts` | 收发、thread 回退无空白回复 | ⬜ |
| P0-3 | Session 显示名 | `src/config/sessions/metadata.ts` | 渠道 chat 中 session 名非随机 ID | ⬜ |
| P0-4 | 回复投递判定 | `src/auto-reply/reply/agent-runner.ts` | cron/确定性 prompt 仍计为已投递，无重复发信 | ⬜ |
| P0-5 | Gateway chat API | `src/gateway/server-methods/chat.ts` | ui-react 发消息、流式、会话列表 | ⬜ |
| P0-6 | message-tool target | `src/agents/tools/message-tool.ts` | 飞书/微信缺 target 时自动解析 | ⬜ |

---

## P1 — 无冲突路径，merge 后仍须冒烟

| ID | 功能 | 关键路径 | 验收用例 | 状态 |
|----|------|----------|----------|------|
| P1-1 | 交互卡片状态 | `ui-react/` | 会话中卡片不可误编辑；`7624806f93` | ⬜ |
| P1-2 | 聊天闪烁修复 | `ui-react/` | 流式过程无异常闪烁 | ⬜ |
| P1-3 | 隐藏 cron 会话 | `ui-react/` + gateway chat | 列表不展示 cron 专用会话 | ⬜ |
| P1-4 | Token 信息/导出 | `ui-react/` | token 面板与导出可用 | ⬜ |
| P1-5 | Automation / Mytask | `ui-react/` | automations 流程、过滤 dream task | ⬜ |
| P1-6 | Electron 文件上传 | `apps/electron/` | 拖拽/选择上传 | ⬜ |
| P1-7 | Electron Gateway | `apps/electron/src/main/gateway/` | 启动、重连、调试 Web | ⬜ |
| P1-8 | 微信渠道 | `extensions/openclaw-weixin/`（若存在） | 绑定、收发、`165e9546bb` | ⬜ |
| P1-9 | ClawHub SSRF | 相关 import 路径 | 恶意 URL 拦截，`813b51c500` | ⬜ |
| P1-10 | History 重载/tap 索引 | `ui-react/` | run 结束后无静默重载错乱，`6498359b57` | ⬜ |

---

## P2 — 构建与发布

| ID | 功能 | 验收用例 | 状态 |
|----|------|----------|------|
| P2-1 | 全量构建 | `pnpm build` 通过 | ⬜ |
| P2-2 | 528 打包 | `pnpm electron:package:local`（或项目等价命令） | ⬜ |
| P2-3 | 核心测试 | `pnpm test src/auto-reply/reply/agent-runner` 等冲突相关路径 | ⬜ |

---

## 继承项（2026-05-21 A/B 区）

以下仍适用，见 [../2026-05-21/MERGE_INVENTORY.md](../2026-05-21/MERGE_INVENTORY.md)：

- A1–A19：Electron、ui-react、skills
- B1–B14：互动工具、office-helper、identityHints、微信/飞书渠道等

若 official 已内置同等能力，在验收备注中标注「由 upstream 覆盖」。
