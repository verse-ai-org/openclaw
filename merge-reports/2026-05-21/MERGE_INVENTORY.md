# Fork 资产清单与验收用例

合并完成后，以下功能必须仍可用。每完成一个波次，在「验收状态」列更新。

**Fork diff 范围：** `841ee24340..354df8b5d0`（218 commits，1717 files changed）

---

## A 区 — Fork 独有（冲突时优先保留）

### 桌面应用

| ID | 功能 | 关键路径 | 验收用例 | 验收状态 |
|----|------|----------|----------|----------|
| A1 | Electron 桌面壳 | `apps/electron/` | `pnpm electron:dev` 启动；窗口加载 ui-react | ⬜ |
| A2 | Windows/macOS 打包 | `apps/electron/scripts/` | `pnpm electron:package:local` 成功产出 | ⬜ |
| A3 | Electron CI 发布 | `.github/workflows/electron-release.yml` | workflow 语法有效（合并后可选 dry-run） | ⬜ |

### 主 UI（ui-react）

| ID | 功能 | 关键路径 | 验收用例 | 验收状态 |
|----|------|----------|----------|----------|
| A4 | React 聊天主界面 | `ui-react/` | `pnpm ui:react:dev` 可连接 gateway 并发消息 | ⬜ |
| A5 | Run projection | `ui-react/src/run-projection/` | 流式文本 + tool 事件同屏展示 | ⬜ |
| A6 | 多 session 隔离 | `ui-react/src/stores/` | 切换 session 不共用 chat 状态 | ⬜ |
| A7 | 文件/图片上传 | `ui-react/src/components/composer/` | 附件消息发送与展示正常 | ⬜ |
| A8 | 互动式 UI 组件 | `ui-react/src/components/chat/interactive/` | question-flow、option-list 等可交互 | ⬜ |
| A9 | 富工具 UI | `ui-react/src/components/tool-ui/` | chart、geo-map、weather 等渲染 | ⬜ |
| A10 | 渠道绑定 UI | `ui-react/src/components/channels/` | 飞书/微信绑定表单可用 | ⬜ |
| A11 | Schedule 定时任务页 | `ui-react/`（schedule 相关路由） | 创建/查看定时任务 | ⬜ |
| A12 | Profile 页面 | `ui-react/` + `src/gateway/server-methods/profile.ts` | profile 读写正常 | ⬜ |

### 内置 Skills

| ID | 功能 | 关键路径 | 验收用例 | 验收状态 |
|----|------|----------|----------|----------|
| A13 | travel-planner | `skills/travel-planner/` | agent 可触发路线规划 workflow | ⬜ |
| A14 | office-helper-skill | `skills/office-helper-skill/` | 引导创建 PPT/文档（中英文） | ⬜ |
| A15 | html-ppt-skill | `skills/html-ppt-skill/` | 主题切换、HTML 复制 assets 正常 | ⬜ |
| A16 | minimax docx/xlsx/pdf | `skills/minimax-*` | 文档生成/预览 | ⬜ |
| A17 | amap-lbs-skill | `skills/amap-lbs-skill/` | 地图/LBS 工具调用 | ⬜ |
| A18 | 12306 火车票 | `skills/12306/` | 查询技能可用 | ⬜ |
| A19 | my-office-Helper agent | `src/agents/builtin-agents.ts` | 内置 agent 列表含 office helper | ⬜ |

---

## B 区 — Upstream 骨架 + Fork 逻辑（合并重点）

### Agent / 工具

| ID | 功能 | 关键路径 | 验收用例 | 验收状态 |
|----|------|----------|----------|----------|
| B1 | 互动询问工具 | `src/agents/tools/question-flow-tool.ts` | agent 发起问答流程 | ⬜ |
| B2 | 审批/选项/轮播工具 | `src/agents/tools/approval-card-tool.ts` 等 | control-ui 工具 schema 有效 | ⬜ |
| B3 | message-tool 自动补全 target | `src/agents/tools/message-tool.ts` | 飞书/微信 send 缺 target 时自动解析 | ⬜ |
| B4 | office-helper boot 引导 | `src/agents/pi-embedded-subscribe.handlers.tools.ts` | 首次对话引导创建 PPT | ⬜ |
| B5 | Minimax/Ollama provider | `src/agents/models-config.*` | onboard 可选 minimax/ollama | ⬜ |

### Gateway / 会话

| ID | 功能 | 关键路径 | 验收用例 | 验收状态 |
|----|------|----------|----------|----------|
| B6 | Chat attachments | `src/gateway/chat-attachments.ts` | 上传/下载附件 API | ⬜ |
| B7 | Chat transcript inject | `src/gateway/server-methods/chat-transcript-inject.ts` | 历史消息注入 | ⬜ |
| B8 | Gateway profile API | `src/gateway/server-methods/profile.ts` | profile CRUD | ⬜ |
| B9 | Gateway 重启修复 | `src/gateway/server.impl.ts` | gateway 重启后 ui-react 可重连 | ⬜ |

### 渠道 / 配置

| ID | 功能 | 关键路径 | 验收用例 | 验收状态 |
|----|------|----------|----------|----------|
| B10 | 飞书渠道 | `extensions/feishu/` | 绑定、收发消息 | ⬜ |
| B11 | 微信渠道 | `extensions/openclaw-weixin/`（或等价路径） | 绑定、收发消息 | ⬜ |
| B12 | identityHints 自动学习 | `src/config/sessions/metadata.ts` | direct 消息学习 recipient | ⬜ |
| B13 | recipient-resolver | `src/infra/outbound/recipient-resolver.ts` | 唯一目标时自动补全 | ⬜ |
| B14 | 定时任务飞书通知 | `src/agents/tools/cron-tool.ts` + 相关 | cron 触发后可通知飞书 | ⬜ |

### Onboard / Commands

| ID | 功能 | 关键路径 | 验收用例 | 验收状态 |
|----|------|----------|----------|----------|
| B15 | Minimax onboard | `src/commands/onboard-auth.config-minimax.ts` | 非交互/交互 onboard 可选 minimax | ⬜ |
| B16 | Ollama onboard | `src/commands/ollama-setup.ts` | ollama 本地模型配置 | ⬜ |
| B17 | Channel status | `src/commands/channels/status.ts` | 飞书/微信状态展示 | ⬜ |

---

## C 区 — 以 Upstream 为主（冒烟即可）

| ID | 功能 | 验收用例 | 验收状态 |
|----|------|----------|----------|
| C1 | Telegram/Discord 等核心渠道 | upstream 渠道 status 不 regression | ⬜ |
| C2 | Memory 新架构 | memory 相关命令不 crash | ⬜ |
| C3 | Upstream control UI (`ui/`) | `pnpm ui:dev` 可启动（不与 ui-react 混） | ⬜ |

---

## D 区 — Fork 文档

| ID | 文件 | 验收状态 |
|----|------|----------|
| D1 | `docs/design/kilo-gateway-integration.md` | ⬜ |
| D2 | `ui-react/docs/feishuwechat-channel-binding.md` | ⬜ |

---

## 合并后全量冒烟脚本（参考）

```bash
# 1. 依赖与构建
pnpm install && pnpm build

# 2. Gateway
pnpm openclaw gateway run --bind loopback --port 18789 &
pnpm openclaw channels status --probe

# 3. UI
pnpm ui:react:dev   # 另开终端

# 4. Electron（可选）
pnpm electron:dev
```

验收人：________　合并完成日期：________
