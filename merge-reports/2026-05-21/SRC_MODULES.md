# src/ 分模块手动合并顺序

> **强制：** `src/` 下每个冲突文件必须人工 review，禁止 merge-file / 批量 checkout 脚本。

Fork diff 查询：

```bash
git diff 841ee24340..354df8b5d0 -- <path>
git show :2:<path>   # fork
git show :3:<path>   # upstream
```

---

## 模块列表（按依赖顺序）

每完成一个模块：更新 [PROGRESS.md](./PROGRESS.md) 中「src 模块进度」表。

| 序 | 模块 | 路径前缀 | Fork 关切 | 状态 |
|----|------|----------|-----------|------|
| M1 | 配置 / schema | `src/config/` | identityHints、飞书/微信 session、tools schema | ✅ 阶段 6 |
| M2 | Gateway 协议 | `src/gateway/protocol/` | ui-react 所需 schema | ✅ 阶段 2 |
| M3 | Gateway 方法 | `src/gateway/server-methods/` | chat、attachments、profile、channels | ✅ 阶段 4 |
| M4 | Gateway 核心 | `src/gateway/`（除 M2/M3） | server.impl、session-utils、plugins-http | ✅ 阶段 5 |
| M5 | Agents 工具 | `src/agents/tools/` | message-tool、互动工具、cron、common | ✅ 阶段 7 |
| M6 | Agents 核心 | `src/agents/`（除 M5） | pi-embedded、workspace、skills、openclaw-tools | ✅ 阶段 7 |
| M7 | Commands / onboard | `src/commands/` | upstream 插件化 auth + `agents.config` skills/tools | ✅ 阶段 8 |
| M8 | Auto-reply | `src/auto-reply/` | `messageMetadata` 经 run-params 传递 | ✅ 阶段 8 |
| M9 | Channels / infra | `src/channels/`、`src/infra/`、`src/cron/` | cron delivery-target 飞书/微信 | ✅ 阶段 9 |
| M10 | 其余 src | `src/cli/`、`src/plugins/`、`src/tts/`、`test/` 等 | sdk-alias 哈希回退 | ✅ 阶段 9 |

---

## 单模块工作流

```
1. git diff --name-only --diff-filter=U | grep '^src/config/'
2. 取一个文件 → IDE 或 :2:/:3: 对照
3. 查 fork diff：git diff 841ee24340..354df8b5d0 -- path
4. 合并 → git add path
5. 模块内全部 add 后，可选：pnpm test -- path相关测试
6. 更新 PROGRESS.md
```

---

## 模块完成后验收（摘自 INVENTORY）

| 模块 | 最低验收 |
|------|----------|
| M1–M4 | gateway 启动；ui-react 连上 WS |
| M5–M6 | 发消息；tool 流式；message-tool 飞书/微信 target |
| M7 | minimax/ollama onboard 可选 |
| M8 | 附件、多 session 不串 |

---

## 非 src 波次（可半自动，但仍需 spot-check）

| 波次 | 范围 | 策略 |
|------|------|------|
| 0 | 根 package.json 等 | `merge-wave0-package-json.mjs`（仅根配置） |
| 1 | DU/UD | **逐条**登记 modify-delete-decisions，禁止批量 rm 脚本 |
| E | `extensions/` | 每个插件单独 review |
| A | `apps/electron/`、`ui-react/` | fork 为主，适配 upstream API |
| C | `ui/`、`docs/`、`.github/` | upstream 为主 |

**`src/` 不在上表半自动范围内。**
