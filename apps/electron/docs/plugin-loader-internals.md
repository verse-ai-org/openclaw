# 插件加载机制与常见问题

本文档记录 gateway 插件加载系统的核心设计，以及在开发/生产环境中遇到的典型问题和解决方案。

---

## 核心文件

| 文件 | 职责 |
|------|------|
| `src/plugins/loader.ts` | 插件发现、jiti 加载、注册的主入口 |
| `src/plugins/runtime.ts` | 全局插件 registry 状态（`globalThis` 单例） |
| `src/plugin-sdk/root-alias.cjs` | `openclaw/plugin-sdk` 的运行时别名解析 |
| `src/plugins/discovery.ts` | 在文件系统中扫描可加载插件候选 |
| `src/plugins/manifest-registry.ts` | 读取插件 `manifest.json` 元信息 |
| `apps/electron/packaged-runtime.json` | 声明 Electron 包内嵌的运行时依赖 |

---

## 插件加载流程

```
loadOpenClawPlugins(options)
  │
  ├─ 构建 cacheKey（workspaceDir + plugins config JSON）
  ├─ 命中 registryCache？→ 直接 setActivePluginRegistry + return（不重新加载）
  │
  ├─ clearPluginCommands()           ← 清空旧命令注册
  ├─ discoverOpenClawPlugins()        ← 扫描文件系统，收集插件候选
  ├─ loadPluginManifestRegistry()     ← 读取各插件 manifest.json
  │
  ├─ 对每个 candidate：
  │     ├─ 解析 enable/disable 状态
  │     ├─ getJiti().import(pluginPath)  ← jiti 加载插件 JS/TS 模块
  │     ├─ validatePluginConfig()        ← JSON Schema 校验配置
  │     └─ register(api)                 ← 调用插件 register/activate
  │
  ├─ registryCache.set(cacheKey, registry)  ← 写入进程级缓存
  └─ setActivePluginRegistry(registry)      ← 更新全局单例
```

---

## 关键设计：进程级缓存

`registryCache` 是 `loader.ts` 模块级别的 `Map<string, PluginRegistry>`，其生命周期与 **gateway 进程** 绑定：

```ts
// src/plugins/loader.ts
const registryCache = new Map<string, PluginRegistry>();

if (cacheEnabled) {
  const cached = registryCache.get(cacheKey);
  if (cached) {
    activatePluginRegistry(cached, cacheKey);
    return cached; // 不重新加载
  }
}
```

cacheKey 由 `workspaceDir + plugins config JSON` 拼成。只要 gateway 进程不重启，已加载的 registry 就一直复用。

---

## 问题一：安装/启用插件后需要重启什么？

### 结论

**只需重启 gateway 进程**，不需要重启整个 Electron 应用（菜单栏 app 保持运行）。

### 原因

插件加载的配置变更流程：

```
用户在 UI 安装/启用插件
  → 写入 ~/.openclaw/config.json（或 workspace config）
  → UI 通知 gateway 重新加载插件
       ↓ 需要以下任一条件才能生效
  1. gateway 进程重启（registryCache 被清空，重新 loadOpenClawPlugins）
  2. 或者 gateway 以 cache: false 重新调用 loadOpenClawPlugins
```

因为 `registryCache` 是进程内 `Map`，进程不重启它就不会被清空，即使配置文件已更新，返回的仍是旧 registry。

### 操作方式

根据 `CLAUDE.md`：

> Gateway currently runs only as the menubar app. Restart via the OpenClaw Mac app or `scripts/restart-mac.sh`.

通过菜单栏 app 重启 gateway，或运行：

```bash
scripts/restart-mac.sh
```

---

## 问题二：jiti 别名为什么还会出现 `device-pair-DZdPL6gL.js` 加载失败？

### 背景：别名的作用

插件代码中 `import ... from "openclaw/plugin-sdk/device-pair"` 并不是标准 Node.js 模块路径，需要 jiti 的别名机制来拦截并重定向到真实文件：

```
开发环境：openclaw/plugin-sdk/device-pair → src/plugin-sdk/device-pair.ts
生产环境：openclaw/plugin-sdk/device-pair → dist/plugin-sdk/device-pair.js
```

这样插件代码可以在开发和生产中用同一个 import 路径，无需修改。

### 根本原因：构建产物使用内容哈希文件名

`tsdown.config.ts` 的 `entryFileNames` 规则：

```ts
outputOptions: {
  entryFileNames: ({ name }) => {
    if (name === "index" || name === "entry" || name === "warning-filter") {
      return "[name].js";        // 固定名称（豁免列表）
    }
    return "[name]-[hash].js";   // 其他所有 entry 都加内容哈希
  },
}
```

`device-pair` 不在豁免列表，所以构建产物实际文件名是：

```
dist/plugin-sdk/device-pair-DZdPL6gL.js   ← 实际存在
dist/plugin-sdk/device-pair.js             ← 不存在！
```

### 失败链路

```
getJiti() 构建别名 map
  → resolvePluginSdkAliasFile({ distFile: "device-pair.js" })
  → 查找 dist/plugin-sdk/device-pair.js
  → 文件不存在 → 返回 null
  → 别名 map 中 openclaw/plugin-sdk/device-pair 没有对应路径
  → jiti 按普通模块解析 → 找不到 → 报错
```

### 修复方案：哈希文件 fallback

在 `resolvePluginSdkAliasFile` 中，当精确路径不存在时，扫描同目录下第一个匹配 `<stem>-*.js` 的文件：

```ts
// src/plugins/loader.ts
if (candidate.endsWith(".js") && candidate.includes(`${path.sep}dist${path.sep}`)) {
  const dir = path.dirname(candidate);
  const stem = path.basename(candidate, ".js");
  const hashed = fs
    .readdirSync(dir)
    .find((f) => f.startsWith(`${stem}-`) && f.endsWith(".js") && !f.endsWith(".d.js"));
  if (hashed) {
    return path.join(dir, hashed); // → device-pair-DZdPL6gL.js
  }
}
```

修复后别名能正确解析到带哈希的实际文件，插件加载正常。

### 为什么开发环境没问题？

开发环境下 `resolvePluginSdkAliasCandidateOrder` 优先返回 `["src", "dist"]`，别名指向 `src/plugin-sdk/device-pair.ts`，该文件以确定性路径存在，不受哈希影响。问题只出现在生产/Electron 打包环境。

---

## jiti 别名的完整解析逻辑

`getJiti()` 在第一次调用时构建别名 map，此后缓存（与 gateway 进程同生命周期）：

```ts
const aliasMap = {
  // 根别名：openclaw/plugin-sdk → root-alias.cjs
  ...(pluginSdkAlias ? { "openclaw/plugin-sdk": pluginSdkAlias } : {}),
  // 分路径别名：openclaw/plugin-sdk/device-pair → dist/.../device-pair-xxxx.js
  ...resolvePluginSdkScopedAliasMap(),
};
```

`resolvePluginSdkScopedAliasMap()` 读取 `package.json` 的 `exports` 字段，枚举所有 `./plugin-sdk/*` 子路径，逐一调用 `resolvePluginSdkAliasFile` 解析真实路径。

`resolvePluginSdkAliasFile` 的查找策略：

1. 从当前 `loader.ts` 所在目录向上最多 6 级遍历
2. 在每一级按优先顺序检查 `src/plugin-sdk/<name>.ts` 和 `dist/plugin-sdk/<name>.js`
3. 精确路径不存在时，fallback 到同目录下 `<name>-*.js`（哈希文件）
4. 返回第一个存在的路径，或 `null`

---

## 常见问题速查

| 现象 | 可能原因 | 处理方式 |
|------|---------|----------|
| 启用插件后无效 | registryCache 命中旧缓存 | 重启 gateway |
| `Cannot find module openclaw/plugin-sdk/xxx` | 哈希文件 fallback 失败 | 确认 `dist/plugin-sdk/` 下存在对应 `xxx-*.js` 文件，检查 `pnpm build` 是否完整运行 |
| 插件在开发环境正常，打包后失败 | 别名指向了 src 而非 dist | 检查 `NODE_ENV` 和 `loader.ts` 路径是否在 `dist/` 下 |
| 插件加载 `invalid config` | manifest 的 configSchema 与实际 config 不匹配 | 检查 `~/.openclaw/config.json` 中该插件的 config 字段 |
| 多个同 id 插件 | 同一插件从 bundled 和 workspace 都发现了 | 后发现的被标记 `overridden`，以 origin 优先级为准 |
