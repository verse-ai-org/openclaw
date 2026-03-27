# Skill 环境变量加载机制

> 维护参考文档 — 描述 OpenClaw skill 系统如何将 `~/.openclaw/openclaw.json` 中的配置注入为运行时环境变量。

## 概览

Skill 所需的 API key 和环境变量**不需要用户手动 export 到 shell**。系统在每次 agent run 开始前自动将配置文件中的值注入为 `process.env`，run 结束后还原。

---

## 完整数据流

```
用户在 UI Skills 页面填写 API key / env 变量
        ↓
  skills.update RPC  (src/gateway/server-methods/skills.ts)
        ↓
  ~/.openclaw/openclaw.json
  {
    "skills": {
      "entries": {
        "<skillKey>": {
          "apiKey": "sk-xxx",          ← UI 保存的 API key
          "env": {                     ← UI 保存的其他 env 键值对
            "MY_OTHER_VAR": "value"
          }
        }
      }
    }
  }
        ↓
  agent run 开始
  applySkillEnvOverridesFromSnapshot()  (有 snapshot 时)
  或 applySkillEnvOverrides()           (无 snapshot 时)
  — src/agents/skills/env-overrides.ts —
        ↓
  process.env["OPENAI_API_KEY"] = "sk-xxx"  ← 注入进程环境
        ↓
  agent / bash tool 运行，可直接读取 process.env
        ↓
  run 结束 → restoreSkillEnv() → 还原 process.env
```

---

## 关键源文件

| 文件 | 职责 |
|------|------|
| `src/agents/skills/env-overrides.ts` | env 注入 / 还原核心逻辑 |
| `src/agents/skills/config.ts` | `resolveSkillConfig()` 读取 config 中的 skill 配置 |
| `src/agents/skills/workspace.ts` | `buildWorkspaceSkillSnapshot()` 构建 snapshot |
| `src/agents/pi-embedded-runner/run/attempt.ts` | agent run 入口，调用注入和还原 |
| `src/gateway/server-methods/skills.ts` | `skills.update` RPC handler，写入 config |
| `src/config/types.skills.ts` | `SkillConfig` 类型定义 |
| `ui-react/src/store/skills.store.ts` | 前端调用 `skills.update` 的 store |
| `ui-react/src/types/skills.ts` | 前端 skill 类型定义 |

---

## env 注入判断逻辑（逐步）

### 步骤 1：必须有 skillConfig

```typescript
const skillConfig = resolveSkillConfig(config, skillKey);
if (!skillConfig) {
  continue; // 跳过，没有配置就不注入
}
```

用户必须在 UI 中为该 skill 保存过 API key 或 env，否则 `config.skills.entries` 中没有对应条目，直接跳过。

### 步骤 2：`apiKey` 注入 `primaryEnv`

```typescript
// 条件全部满足时，apiKey 才会注入到 primaryEnv 变量
const canInjectPrimaryEnv =
  normalizedPrimaryEnv &&                           // SKILL.md 声明了 primary-env
  (
    process.env[normalizedPrimaryEnv] === undefined // 系统 env 中没有该变量
    || activeSkillEnvEntries.has(normalizedPrimaryEnv) // 或已由 skill 系统管理
  );

if (canInjectPrimaryEnv && resolvedApiKey) {
  if (!pendingOverrides[normalizedPrimaryEnv]) {    // env 字段未覆盖同名变量
    pendingOverrides[normalizedPrimaryEnv] = resolvedApiKey;
  }
}
```

### 步骤 3：`env` 字段注入

```typescript
for (const [rawKey, envValue] of Object.entries(skillConfig.env)) {
  const hasExternallyManagedValue =
    process.env[envKey] !== undefined        // 系统已有该 key
    && !activeSkillEnvEntries.has(envKey);   // 且不由 skill 系统管理

  if (!envKey || !envValue || hasExternallyManagedValue) {
    continue; // 外部已设置时跳过（外部优先）
  }
  pendingOverrides[envKey] = envValue;
}
```

### 步骤 4：安全过滤

- `allowedSensitiveKeys` = `{primaryEnv}` ∪ `{requires.env[]}` （来自 SKILL.md frontmatter）
- 敏感变量（如 `OPENAI_API_KEY`）**必须在 allowedSensitiveKeys 中**才能通过 `sanitizeEnvVars`
- 以下 key **永久阻止**，无论是否声明：
  - `isDangerousHostEnvVarName`：`PATH`、`LD_PRELOAD`、`DYLD_*`、`BASH_ENV`、`SHELL` 等
  - `OPENSSL_CONF`

---

## 所有失败原因一览

| # | 失败原因 | 触发条件 | 解决方式 |
|---|---------|---------|----------|
| A | 没有 skillConfig | 用户从未在 UI 配置该 skill | 在 UI Skills 页面保存 API key 或 env |
| B | 系统 env 已存在同名 key | `process.env[primaryEnv]` 不为 `undefined` | 检查 shell profile，移除冲突的 `export` |
| C | SKILL.md 未声明 `primary-env` | frontmatter 缺少 `primary-env` 字段 | 添加 `primary-env: MY_KEY` |
| D | apiKey 为空 | 用户没有在 UI 填 API key | 在 UI 填入并保存 API key |
| E | env 字段同名覆盖 apiKey | `skillConfig.env.OPENAI_API_KEY` 已存在 | env 字段优先于 apiKey，保持一致即可 |
| F | 外部 env 已设置 | shell/系统已有同名环境变量（哪怕值为空） | 清除系统环境变量，留给 config 管理 |
| G | 敏感 key 未声明 | SKILL.md 未声明 `requires.env` | 添加 `requires: env: [MY_KEY]` |

---

## SKILL.md 正确写法

要让 env 注入机制完整工作，**必须同时声明以下两个字段**：

```yaml
---
name: my-openai-skill
description: Uses OpenAI API

# 必须：声明所需 env，让 key 进入 allowedSensitiveKeys（安全过滤白名单）
requires:
  env:
    - OPENAI_API_KEY

# 必须：声明主 API key 对应的 env 变量名，apiKey 才会注入到这里
primary-env: OPENAI_API_KEY
---
```

### 只写其中一个字段的后果

| 只写 `requires.env`，不写 `primary-env` | 只写 `primary-env`，不写 `requires.env` |
|---|---|
| apiKey 无法注入（不知道注入到哪个变量） | apiKey 可以注入到 primaryEnv |
| env 字段中同名 key 可以注入 | 其他 requires.env 中的 key 不在白名单，被过滤 |

---

## 引用计数与并发安全

`activeSkillEnvEntries` 是一个进程级 `Map`，通过引用计数支持多个并发 agent run 共享同一个 env key：

```
第一个 run 注入 OPENAI_API_KEY → count = 1
第二个 run 注入 OPENAI_API_KEY → count = 2
第一个 run 结束 → count = 1，env 保留
第二个 run 结束 → count = 0，env 还原为 baseline
```

还提供 `getActiveSkillEnvKeys()` 供 ACP harness 子进程 spawn 时剥离 skill 注入的 key，防止泄漏（见 issue #36280）。

---

## 两条调用路径

### 路径 A — 有 snapshot（正常 agent run）

```typescript
// attempt.ts
restoreSkillEnv = applySkillEnvOverridesFromSnapshot({
  snapshot: params.skillsSnapshot,  // 含 skills[].{name, primaryEnv, requiredEnv}
  config: params.config,
});
```

`primaryEnv` / `requiredEnv` 在构建 snapshot 时从 SKILL.md frontmatter 读取并缓存：

```typescript
// workspace.ts - buildWorkspaceSkillSnapshot()
skills: eligible.map((entry) => ({
  name: entry.skill.name,
  primaryEnv: entry.metadata?.primaryEnv,
  requiredEnv: entry.metadata?.requires?.env?.slice(),
})),
```

> **注意**：snapshot 有版本缓存。修改 SKILL.md frontmatter 后需重启 gateway 或触发 `bumpSkillsSnapshotVersion()` 才能生效。

### 路径 B — 无 snapshot（直接用 entries）

```typescript
restoreSkillEnv = applySkillEnvOverrides({
  skills: skillEntries ?? [],
  config: params.config,
});
```

直接从 `SkillEntry.metadata` 读取，实时生效。

---

## 调试 env 注入问题的快速检查清单

```
□ SKILL.md frontmatter 有 primary-env 字段？
□ SKILL.md frontmatter 有 requires.env 列表，且包含目标 key？
□ UI Skills 页面已为该 skill 填写并保存 API key？
□ ~/.openclaw/openclaw.json 中 skills.entries.<key>.apiKey 不为空？
□ shell 环境（~/.zshrc / ~/.bashrc）没有同名 export 语句？
□ 修改 SKILL.md 后是否已重启 gateway（snapshot 版本缓存）？
□ 通过路径 B（无 snapshot）调用时，SkillEntry.metadata 是否已正确解析？
```

---

## `primaryEnv` 自动推断机制

> `src/agents/skills/frontmatter.ts` — `resolveOpenClawMetadata()`

部分第三方 skill（如来自 Clawhub 的 skill）只声明了 `requires.env` 而未显式设置 `primaryEnv`，例如：

```yaml
---
name: gaode_map
description: A skill to interact with Gaode Map (AMap).
metadata:
  openclaw:
    requires:
      env: ["AMAP_API_KEY"]
      bins: ["python"]
---
```

`resolveOpenClawMetadata` 按以下优先级解析 `primaryEnv`：

```
1. metadata.openclaw.primaryEnv   （metadata 块中显式 camelCase 字段）
2. 顶层 primary-env frontmatter key  （如 primary-env: AMAP_API_KEY）
3. 自动推断：requires.env 恰好只有一个元素时，用该唯一 key
   → requires.env = ["AMAP_API_KEY"]  →  primaryEnv = "AMAP_API_KEY"
   → requires.env 有多个元素          →  不推断（歧义，保持 undefined）
   → requires.env 为空               →  不推断
```

这样，上面的 `gaode_map` skill 无需修改文件，`AMAP_API_KEY` 就会被自动识别为 `primaryEnv`，env 注入机制正常工作。

**三种合法的写法（等价效果）：**

```yaml
# 写法 1：metadata 块内 camelCase（最明确）
metadata:
  openclaw:
    primaryEnv: AMAP_API_KEY
    requires:
      env: ["AMAP_API_KEY"]

# 写法 2：顶层 primary-env key
primary-env: AMAP_API_KEY
metadata:
  openclaw:
    requires:
      env: ["AMAP_API_KEY"]

# 写法 3：只写 requires.env 单元素，自动推断
metadata:
  openclaw:
    requires:
      env: ["AMAP_API_KEY"]   ← 自动推断为 primaryEnv

# 写法 4：env 直接放在 metadata.openclaw 下（兼容格式）
metadata:
  openclaw:
    env:
      - "AMAP_API_KEY"        ← 等价于 requires.env，会被合并
    requires:
      bins: ["python3"]
```

---

## 多 env key 的情况（`primaryEnv` 不自动推断）

当 skill 需要多个 env key 时（如聚合多个地图服务），`primaryEnv` **不会**自动推断，因为无法确定哪个 key 是「主」key。

```yaml
# 示例：map-search skill，三个 API key
metadata:
  openclaw:
    env:
      - "AMAP_API_KEY"
      - "BAIDU_MAP_API_KEY"
      - "TENCENT_MAP_API_KEY"
    requires:
      bins: ["python3"]
```

**处理方式：**

| 字段 | UI 中配置位置 | 注入行为 |
|------|-------------|----------|
| `primaryEnv`（未声明） | 无主 API key 字段 | apiKey 不注入 |
| `AMAP_API_KEY` | UI → skill env 字段 | 通过 `skillConfig.env` 注入 |
| `BAIDU_MAP_API_KEY` | UI → skill env 字段 | 通过 `skillConfig.env` 注入 |
| `TENCENT_MAP_API_KEY` | UI → skill env 字段 | 通过 `skillConfig.env` 注入 |

用户需要在 Skills UI 的「环境变量」部分逐一填写每个 key，而不是使用「API Key」快捷输入框。三个 key 各自通过 `env` 字段注入，功能完整，只是 UI 体验上没有主 key 的快捷入口。

如果 skill 作者希望指定其中一个为「主」key（在 UI 中显示为 API Key 输入框），需显式声明：

```yaml
metadata:
  openclaw:
    primaryEnv: AMAP_API_KEY   ← 指定高德为主 key，显示在 UI API Key 输入框
    env:
      - "AMAP_API_KEY"
      - "BAIDU_MAP_API_KEY"
      - "TENCENT_MAP_API_KEY"
    requires:
      bins: ["python3"]
```

---

## 从 SKILL.md 读取 env 配置的备选方案分析

> 本节记录「在 SKILL.md 中说明可从 `.openclaw.json` 读取」方案的评估结论。

### 背景

有时 skill 在运行时读取不到 env，根本原因是用户未通过 UI 配置、或 SKILL.md 缺少声明。  
一个备选思路是：在 SKILL.md 最后加一段说明，告诉 agent（LLM）如果找不到环境变量，可以尝试读取 `~/.openclaw/openclaw.json`。

### 方案评估

**可行性：技术上可行**

agent（LLM）可以执行 bash 工具，直接读取文件：

```bash
cat ~/.openclaw/openclaw.json | jq -r '.skills.entries["my-skill"].apiKey'
```

**问题：不推荐，原因如下**

| 问题 | 说明 |
|------|------|
| 安全风险 | 让 LLM 读取含有所有 skill API key 的配置文件，存在 prompt injection 或意外泄漏风险 |
| 职责混乱 | env 注入本应是基础设施层（`env-overrides.ts`）的职责，不应由 LLM 自行决定读哪里 |
| 治标不治本 | 根本原因是 SKILL.md 缺少声明或用户未配置，应修复声明而非绕过注入机制 |
| 与现有机制重复 | `env-overrides.ts` 已经从 `openclaw.json` 读取并注入，LLM 再读一遍是多余的 |

**推荐的正确做法**

1. 检查并补全 SKILL.md frontmatter（`primary-env` + `requires.env`）
2. 引导用户在 UI Skills 页面填写 API key
3. 让基础设施层（`env-overrides.ts`）完成注入，skill 直接读取 `process.env` 即可

如果确实需要在 SKILL.md 中添加提示，推荐的写法是：

```markdown
## 配置

本 skill 需要 API key。请通过 OpenClaw UI 的 Skills 页面配置，  
而非手动设置环境变量。系统会在 agent run 时自动注入。
```

这样只说明配置入口，不暴露底层文件路径，也不鼓励 LLM 自行读取敏感文件。

---

## config 文件结构参考

`~/.openclaw/openclaw.json` 中 skill 相关的完整结构：

```json
{
  "skills": {
    "entries": {
      "openai-skill": {
        "apiKey": "sk-proj-xxx",
        "env": {
          "OPENAI_ORG_ID": "org-xxx",
          "OPENAI_BASE_URL": "https://api.openai.com/v1"
        }
      },
      "anthropic-skill": {
        "apiKey": "sk-ant-xxx",
        "env": {}
      }
    }
  }
}
```

对应的 TypeScript 类型（`src/config/types.skills.ts`）：

```typescript
export interface SkillConfig {
  apiKey?: string;         // UI 中填写的主 API key
  env: Record<string, string>; // 其他 env 键值对
}

export interface SkillsConfig {
  entries: Record<string, SkillConfig>;
}
```

`resolveSkillConfig(config, skillKey)` 通过 `skillKey`（通常是 skill 目录名或 name 字段）在 `entries` 中查找对应配置。

---

## 相关 RPC 与前端交互

### skills.update（写入配置）

```typescript
// ui-react/src/store/skills.store.ts
await rpc.skills.update({
  key: skillKey,
  config: {
    apiKey: formValues.apiKey,
    env: formValues.env,
  },
});
```

### skills.list（读取当前状态）

前端通过 `skills.list` RPC 获取所有 skill 的状态，包括：
- 是否已安装
- 是否已配置 API key
- env 变量是否已设置
- skill metadata（name、description、requires 等）

前端**不会**直接读取 `openclaw.json`，所有配置读写都通过 gateway RPC 完成。
