# Bossim Skill 安装与 ClawHub 导入

> 维护参考文档 — 说明 Bossim（`ui-react`）中 Skill 安装入口、多 Agent 行为、ClawHub URL 导入失败原因及最终方案。

## 背景

Bossim 是**多 Agent** 桌面产品。Skill 相关能力分布在：

| 页面 / 入口 | 组件 | 用户动作 |
|-------------|------|----------|
| **Skills** 页 → Add New Skill | `AddSkillDialog` | 从 URL 或本地上传**安装** skill 包 |
| **Employees / Profile** → Skills → Advanced → Add Skills | `AddSkillsDialog`（`agents/skills.tsx`） | 从已有目录中**勾选绑定**到当前 Agent |

目标：**安装的 skill 在本机多个 Agent 间可用**，且与上述两套 UI 语义一致；可接受**无 ClawHub 自动更新**（不依赖 workspace 的 `.clawhub/lock.json` 更新流）。

---

## 两套入口：含义与依赖

### 1. Skills 页 — Add New Skill（装到磁盘）

| 项 | 说明 |
|----|------|
| 代码 | `ui-react/src/components/skills/AddSkillDialog.tsx` → `skills.store.ts` → `importSkill` |
| RPC | `skills.import`（默认 `target: "managed"`） |
| 磁盘路径 | `~/.openclaw/skills/<skillName>/` |
| UI 来源标签 | `openclaw-managed` → **Installed** |
| 是否改 Agent 配置 | **否**（不写 `agents.list[].skills`） |

含义：**全局安装技能包**，本机所有 Agent 的 `skills.status` 都能看到（除非被白名单限制）。

### 2. Employee / Profile — Advanced → Add Skills（绑定白名单）

| 项 | 说明 |
|----|------|
| 代码 | `CoreSkillsSection` + `AddSkillsDialog`（`ui-react/src/components/agents/skills.tsx`） |
| 挂载 | `AgentsPage` → `AgentDetailDrawer`；Chat 侧 Profile 复用同一 Drawer |
| 数据 | `loadAgentSkills(agentId)` → `skills.status` + `{ agentId }` |
| 提交 | `setAgentSkills` → `agents.update`，写入 **`agents.list[].skills`** |
| 是否装磁盘 | **否** |

含义：从**已存在**的 skill 目录里多选，决定「该 Employee **允许使用**哪些 skill」。目录里没有的 skill 无法在此勾选（需先在 Skills 页安装）。

### 依赖关系

```
Skills 页 Add New Skill
    → skills.import (managed)
    → ~/.openclaw/skills/
    → skills.status 全局目录
    → Employee Advanced Add Skills（可选：写入该 Agent 白名单）
```

- **Advanced 依赖 Skills 页（或其它方式）先完成安装**。
- **Skills 页不依赖 Advanced**。

### Advanced 页「Install on Skills page」

在 `AddSkillsDialog` 底部提供按钮，关闭对话框并跳转 `#/skills`，引导用户先全局安装再在 Employee 里绑定。

---

## Managed vs Workspace：为何选 Managed

| 维度 | Managed `~/.openclaw/skills/` | Workspace `<workspace>/skills/` |
|------|-------------------------------|----------------------------------|
| 可见范围 | 本机**所有 Agent**（默认） | **仅该 Agent** 的 workspace |
| `skills.import` 默认 | **是** | 需 `target: "workspace"` |
| `skills.install` ClawHub 模式 | 否 | **是**（官方 CLI/UI 默认） |
| ClawHub `update` / lockfile | 无（可接受） | 有 |

Bossim 选择：**继续 `skills.import` → managed**，不改为 `skills.install` ClawHub（避免装到单 workspace、与多 Agent 全局共享目标冲突）。

同名 skill 时，加载优先级中 **workspace 高于 managed**（见 `src/agents/skills/workspace.ts`）。仅 managed 安装时无冲突。

### 多 Agent 下「能否用」

| Agent 配置 | 新装的 managed skill |
|------------|----------------------|
| **未设置** `agents.list[].skills` | **自动可用**（无白名单限制） |
| **有** 显式 `skills: [...]` 白名单 | 需在 Advanced 中勾选并 `agents.update` |

新建 Employee（`createAgent`）默认**不写** `skills` 字段 → 新 Agent 继承「全员可用」。

---

## 问题：ClawHub URL 导入报 SSRF

### 现象

在 Skills 页 **From URL** 粘贴例如：

- `https://clawhub.ai/steipete/obsidian`
- `https://clawhub.ai/steipete/notion`

UI 报错：

```text
Blocked: resolves to private/internal/special-use IP address
```

Gateway 日志示例：

```text
[security] blocked URL fetch (url-fetch) targetOrigin=https://clawhub.ai ...
[ws] ⇄ res ✗ skills.import ... errorMessage=Blocked: resolves to private/internal/special-use IP address
```

### 根因（演进）

1. **初版 UI**：将 ClawHub 页面 URL 改写为硬编码 `https://wry-manatee-359.convex.site/api/v1/download?slug=...`，再 `skills.import` → `downloadUrlToFile` → **`fetchWithSsrFGuard`**。Convex 域名解析到内网/特殊用途 IP → 被拦。

2. **改 clawhub.ai 下载 API 后仍失败**：部分环境（代理、VPN、本地 DNS）下 **`clawhub.ai` 解析结果同样落入 SSRF 策略禁止的地址段**，guarded fetch 依旧拦截。

3. **官方 ClawHub 安装路径不受影响**：`skills.install { source: "clawhub", slug }` → `downloadClawHubSkillArchive()` → `clawhubRequest()` 使用普通 `fetch`，**不经过** `fetchWithSsrFGuard`。Control UI 走此路径。

SSRF 实现：`src/infra/net/ssrf.ts`、`src/infra/net/fetch-guard.ts`。参见 `apps/electron/docs/security-notes.md`。

---

## 解决方案（最终）

### 原则

- **安装位置**：保持 `skills.import` → **managed**（`~/.openclaw/skills/`）。
- **ClawHub 链接**：Gateway 识别后走 **`downloadClawHubSkillArchive`**，与官方安装同源，绕过 guarded URL fetch。
- **非 ClawHub 的 http(s) URL**：仍走原有 `downloadUrlToFile` + SSRF guard。
- **上传 zip**：不变。
- **UI**：直接提交用户输入的 URL，不在前端改写域名。

### Gateway 逻辑（`src/agents/skills-import.ts`）

1. `parseClawHubSlugFromImportUrl(url)` 解析 slug，支持：
   - `https://clawhub.ai/{author}/{slug}`
   - `https://clawhub.ai/api/v1/download?slug=...`
   - 遗留 `https://*.convex.site/api/v1/download?slug=...`
2. 若识别为 ClawHub → `importManagedSkillFromClawHub()`：
   - `downloadClawHubSkillArchive({ slug })`
   - 解压到 `skillsBaseDir/<skillName>/`（默认 managed）
   - 安全扫描 `scanAndWarn`
3. 否则 → 原 `skills.import` URL 下载流程。

### UI 改动

| 文件 | 改动 |
|------|------|
| `AddSkillDialog.tsx` | URL 原样提交；移除 `resolveClawhubUrl` 前端转换 |
| `agents/skills.tsx` | Advanced 对话框增加说明 +「Install on Skills page」跳转 `/skills` |

### 相关源文件

| 路径 | 职责 |
|------|------|
| `src/agents/skills-import.ts` | 导入主逻辑 + ClawHub 分支 |
| `src/agents/skills-import.clawhub.test.ts` | URL 解析与 ClawHub 分支单测 |
| `src/infra/clawhub.ts` | `downloadClawHubSkillArchive` |
| `src/gateway/server-methods/skills.ts` | `skills.import` RPC |
| `ui-react/src/store/skills.store.ts` | 前端 `importSkill` |
| `ui-react/docs/skill-env-loading.md` | API Key / env 注入（与安装位置无关） |

---

## 与「依赖安装」按钮的区别

Skill 管理弹窗（`SkillManageDialog`）中的 **Install** 按钮是另一概念：

- RPC：`skills.install` 的 **Gateway installer 模式** `{ name, installId }`
- 含义：在 Gateway 主机上安装 skill 声明的**二进制依赖**（brew/node/go/uv 等）
- 条件：`skill.install.length > 0` 且 `missing.bins.length > 0`

与 **Add New Skill**（导入 skill 包）无关。

---

## 验证步骤

1. 重启或确认 Gateway 已加载最新代码（`pnpm gateway:watch:raw`）。
2. Skills → Add New Skill → From URL，粘贴 `https://clawhub.ai/steipete/notion`。
3. **预期**：
   - 成功：`Skill "notion" imported from ClawHub`（或解压/网络类错误，但**不是** SSRF Blocked）。
   - 日志中**不应**出现针对本次 import 的 `blocked URL fetch ... clawhub.ai`。
4. Skills 列表 **Installed** 筛选中可见该 skill。
5. Employees → 某 Agent → Advanced → 列表中应出现 `notion`；无白名单的 Agent 通常已自动可用。
6. Advanced → **Install on Skills page** 应跳转到 `#/skills`。

单测：

```bash
node scripts/run-vitest.mjs src/agents/skills-import.clawhub.test.ts
```

---

## 总结

| 主题 | 结论 |
|------|------|
| 产品模型 | Skills 页 = **全局安装**；Employee Advanced = **Agent 白名单绑定** |
| 多 Agent | 使用 **managed** 目录；无 `skills` 白名单的 Agent 自动可用 |
| ClawHub 更新 | 不依赖 workspace lockfile；可接受 |
| SSRF | 前端改 URL 无法根治；**Gateway 对 ClawHub URL 走 registry 下载 API** |
| 官方对齐 | 下载与 `skills.install` ClawHub 模式同源；安装目录仍为 managed 以满足 Bossim |

若未来需要「ClawHub 安装 + 自动更新 + 全局 managed」三者兼得，需在 Gateway 扩展 `skills.import` 或 `skills.install` 的 `target: managed` 参数（当前协议未提供）。

---

## 参考

- OpenClaw Skills 文档：[Skills — Locations and precedence](https://docs.openclaw.ai/tools/skills)
- ClawHub 示例页：[notion on ClawHub](https://clawhub.ai/steipete/notion)
- Gateway 协议：`docs/gateway/protocol.md`（`skills.import` / `skills.install`）
