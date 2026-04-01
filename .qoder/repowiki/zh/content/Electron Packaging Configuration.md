# Electron 打包配置

<cite>
**本文档引用的文件**
- [apps/electron/package.json](file://apps/electron/package.json)
- [apps/electron/electron-builder.yml](file://apps/electron/electron-builder.yml)
- [apps/electron/tsup.config.ts](file://apps/electron/tsup.config.ts)
- [apps/electron/tsdown.config.electron.ts](file://apps/electron/tsdown.config.electron.ts)
- [apps/electron/packaged-runtime.json](file://apps/electron/packaged-runtime.json)
- [apps/electron/scripts/download-node.sh](file://apps/electron/scripts/download-node.sh)
- [apps/electron/scripts/package-electron.sh](file://apps/electron/scripts/package-electron.sh)
- [apps/electron/scripts/package-electron-win.sh](file://apps/electron/scripts/package-electron-win.sh)
- [apps/electron/scripts/generate-runtime-package.mjs](file://apps/electron/scripts/generate-runtime-package.mjs)
- [apps/electron/scripts/notarize.cjs](file://apps/electron/scripts/notarize.cjs)
- [apps/electron/src/main/index.ts](file://apps/electron/src/main/index.ts)
- [apps/electron/src/preload/index.ts](file://apps/electron/src/preload/index.ts)
- [apps/electron/src/main/window.ts](file://apps/electron/src/main/window.ts)
- [apps/electron/src/main/gateway.ts](file://apps/electron/src/main/gateway.ts)
- [apps/electron/resources/entitlements.mac.plist](file://apps/electron/resources/entitlements.mac.plist)
- [scripts/package-mac-app.sh](file://scripts/package-mac-app.sh)
- [scripts/create-dmg.sh](file://scripts/create-dmg.sh)
- [scripts/release-mac-local.sh](file://scripts/release-mac-local.sh)
- [scripts/notarize-mac-artifact.sh](file://scripts/notarize-mac-artifact.sh)
- [extensions/memory-core/openclaw.plugin.json](file://extensions/memory-core/openclaw.plugin.json)
- [extensions/device-pair/openclaw.plugin.json](file://extensions/device-pair/openclaw.plugin.json)
- [extensions/qwen-portal-auth/openclaw.plugin.json](file://extensions/qwen-portal-auth/openclaw.plugin.json)
- [extensions/minimax-portal-auth/openclaw.plugin.json](file://extensions/minimax-portal-auth/openclaw.plugin.json)
- [extensions/google-gemini-cli-auth/openclaw.plugin.json](file://extensions/google-gemini-cli-auth/openclaw.plugin.json)
- [extensions/copilot-proxy/openclaw.plugin.json](file://extensions/copilot-proxy/openclaw.plugin.json)
- [extensions/telegram/openclaw.plugin.json](file://extensions/telegram/openclaw.plugin.json)
- [extensions/discord/openclaw.plugin.json](file://extensions/discord/openclaw.plugin.json)
- [extensions/openclaw-weixin/openclaw.plugin.json](file://extensions/openclaw-weixin/openclaw.plugin.json)
- [extensions/openclaw-weixin/package.json](file://extensions/openclaw-weixin/package.json)
- [extensions/openclaw-weixin/index.ts](file://extensions/openclaw-weixin/index.ts)
- [src/plugins/bundled-dir.ts](file://src/plugins/bundled-dir.ts)
- [src/plugins/bundled-sources.ts](file://src/plugins/bundled-sources.ts)
- [apps/electron/BUILDING.md](file://apps/electron/BUILDING.md)
- [apps/electron/Makefile](file://apps/electron/Makefile)
</cite>

## 更新摘要
**所做更改**
- 优化了 electron-builder.yml 中的文件过滤规则，增强了扩展打包策略
- 改进了扩展过滤规则，支持更精细的文件排除控制
- 优化了运行时依赖的打包策略，提升了打包效率和体积控制
- 增强了跨平台打包的文件过滤一致性
- 改进了 WeChat 扩展的打包配置和过滤规则

## 目录
1. [简介](#简介)
2. [项目结构概览](#项目结构概览)
3. [核心组件分析](#核心组件分析)
4. [架构总览](#架构总览)
5. [详细组件分析](#详细组件分析)
6. [运行时依赖管理系统](#运行时依赖管理系统)
7. [多部署模式支持](#多部署模式支持)
8. [跨平台打包增强](#跨平台打包增强)
9. [签名和公证自动化](#签名和公证自动化)
10. [WeChat 扩展集成](#wechat-扩展集成)
11. [依赖关系分析](#依赖关系分析)
12. [性能考虑](#性能考虑)
13. [故障排除指南](#故障排除指南)
14. [结论](#结论)

## 简介

OpenClaw 项目的 Electron 打包配置经过重大增强，从单一平台支持发展为完整的跨平台打包解决方案。本次更新特别引入了 Windows 打包系统，通过新增的 package-electron-win.sh 脚本实现了在 macOS/Linux 上交叉编译 Windows 版本的能力。该系统现在支持：
- 多平台打包（macOS、Windows、Linux）
- 内置 Node.js 运行时环境
- React 控制界面集成
- OAuth 认证流程支持
- 硬化运行时配置
- 自动更新机制
- **Windows 打包支持**（新增）
- **跨平台构建流程**（新增）
- **统一打包脚本**（增强）
- **架构特定优化**（增强）

**更新** Windows 打包系统的关键改进：
- **package-electron-win.sh**：全新的 Windows 打包脚本，支持交叉编译
- **Makefile 增强**：新增 Windows 打包目标和命令
- **electron-builder 配置**：更新以支持 Windows 平台特定设置
- **Node.js 运行时**：改进的跨平台 Node 二进制下载和管理
- **打包流程**：统一的构建和打包逻辑，支持多平台

## 项目结构概览

```mermaid
graph TB
subgraph "Electron 应用结构"
A[apps/electron/] --> B[package.json]
A --> C[electron-builder.yml]
A --> D[tsup.config.ts]
A --> E[tsdown.config.electron.ts]
A --> F[packaged-runtime.json]
A --> G[src/]
A --> H[resources/]
A --> I[release/]
A --> J[scripts/]
A --> K[BUILDING.md]
A --> L[Makefile]
E --> M[tsdown 打包配置]
F --> N[运行时依赖配置]
J --> O[download-node.sh]
J --> P[package-electron.sh]
J --> Q[package-electron-win.sh]
J --> R[generate-runtime-package.mjs]
J --> S[notarize.cjs]
G --> T[main/]
G --> U[preload/]
T --> V[index.ts]
T --> W[gateway.ts]
T --> X[window.ts]
U --> Y[index.ts]
H --> Z[icon.icns]
H --> AA[entitlements.mac.plist]
end
subgraph "构建脚本"
AB[scripts/] --> AC[package-mac-app.sh]
AB --> AD[create-dmg.sh]
AB --> AE[release-mac-local.sh]
AB --> AF[notarize-mac-artifact.sh]
end
subgraph "配置文件"
AG[.env.example] --> AH[签名配置]
AG --> AI[R2 上传配置]
end
subgraph "扩展捆绑系统"
AJ[基础设施扩展] --> AK[memory-core]
AJ --> AL[device-pair]
AJ --> AM[基础功能]
AN[认证扩展] --> AO[qwen-portal-auth]
AN --> AP[minimax-portal-auth]
AN --> AQ[google-gemini-cli-auth]
AN --> AR[copilot-proxy]
AS[通信渠道扩展] --> AT[telegram]
AS --> AU[discord]
AS --> AV[slack]
AS --> AW[signal]
AS --> AX[whatsapp]
AS --> AY[imessage]
AS --> AZ[matrix]
AS --> BA[msteams]
AS --> BB[feishu]
AS --> BC[googlechat]
AS --> BD[irc]
AS --> BE[line]
AS --> BF[mattermost]
AS --> BG[nextcloud-talk]
AS --> BH[nostr]
AS --> BI[synology-chat]
AS --> BJ[zalo]
AS --> BK[zalouser]
AS --> BL[twitch]
AS --> BM[bluebubbles]
AS --> BN[openclaw-weixin]
BV[扩展清单] --> BW[插件发现机制]
BV --> BX[自动捆绑配置]
end
```

**图表来源**
- [apps/electron/package.json:1-44](file://apps/electron/package.json#L1-L44)
- [apps/electron/electron-builder.yml:1-315](file://apps/electron/electron-builder.yml#L1-L315)
- [apps/electron/packaged-runtime.json:1-157](file://apps/electron/packaged-runtime.json#L1-L157)
- [apps/electron/scripts/package-electron.sh:1-232](file://apps/electron/scripts/package-electron.sh#L1-L232)
- [apps/electron/scripts/package-electron-win.sh:1-198](file://apps/electron/scripts/package-electron-win.sh#L1-L198)
- [apps/electron/Makefile:1-221](file://apps/electron/Makefile#L1-L221)

**章节来源**
- [apps/electron/package.json:1-44](file://apps/electron/package.json#L1-L44)
- [apps/electron/electron-builder.yml:1-315](file://apps/electron/electron-builder.yml#L1-L315)
- [apps/electron/packaged-runtime.json:1-157](file://apps/electron/packaged-runtime.json#L1-L157)
- [apps/electron/BUILDING.md:1-244](file://apps/electron/BUILDING.md#L1-L244)
- [apps/electron/Makefile:1-221](file://apps/electron/Makefile#L1-L221)

## 核心组件分析

### 主进程配置

主进程是 Electron 应用的核心，负责管理应用生命周期、窗口管理和与系统交互。

```mermaid
classDiagram
class MainProcess {
+app : Application
+BrowserWindow : BrowserWindow
+ipcMain : IpcMain
+startGateway() void
+createWindow() BrowserWindow
+loadRendererPage() void
+patchConfigForElectron() void
}
class WindowManager {
+createWindow() BrowserWindow
+configureSession() void
+loadRendererPage() void
+startStaticServer() Promise~number~
}
class OAuthManager {
+oauthStart() Promise~void~
+oauthPoll() Promise~void~
+clearOAuthSession() void
}
class GatewayManager {
+startGateway() Promise~void~
+stopGateway() void
+restartGateway() Promise~void~
+auditBundledExtensions() void
+auditConfigPlugins(cfg) void
}
class PluginManager {
+bundlePlugins() void
+resolveBundledPlugins() string
+patchConfigForElectron() void
}
MainProcess --> WindowManager : "使用"
MainProcess --> OAuthManager : "使用"
MainProcess --> GatewayManager : "使用"
MainProcess --> PluginManager : "使用"
```

**图表来源**
- [apps/electron/src/main/index.ts:1-419](file://apps/electron/src/main/index.ts#L1-L419)
- [apps/electron/src/main/window.ts:1-326](file://apps/electron/src/main/window.ts#L1-L326)
- [apps/electron/src/main/gateway.ts:1-674](file://apps/electron/src/main/gateway.ts#L1-L674)

### 预加载脚本安全桥

预加载脚本实现了安全的上下文桥接，限制渲染进程对 Node.js API 的访问。

```mermaid
sequenceDiagram
participant Renderer as 渲染进程
participant Preload as 预加载脚本
participant Main as 主进程
participant Gateway as Gateway服务
Renderer->>Preload : electronBridge.saveOnboardingConfig(config)
Preload->>Main : ipcRenderer.invoke("onboarding : saveConfig", config)
Main->>Main : 验证配置并保存
Main-->>Preload : {ok : true}
Preload-->>Renderer : Promise结果
Renderer->>Preload : electronBridge.getGatewayInfo()
Preload->>Main : ipcRenderer.invoke("gateway : info")
Main->>Gateway : 获取连接信息
Gateway-->>Main : 端口和令牌
Main-->>Preload : {port, token, wsUrl}
Preload-->>Renderer : Promise结果
```

**图表来源**
- [apps/electron/src/preload/index.ts:1-96](file://apps/electron/src/preload/index.ts#L1-L96)
- [apps/electron/src/main/index.ts:114-206](file://apps/electron/src/main/index.ts#L114-L206)

**章节来源**
- [apps/electron/src/main/index.ts:1-419](file://apps/electron/src/main/index.ts#L1-L419)
- [apps/electron/src/preload/index.ts:1-96](file://apps/electron/src/preload/index.ts#L1-L96)

## 架构总览

```mermaid
graph TB
subgraph "应用层"
A[Electron 主进程]
B[渲染进程]
C[预加载脚本]
end
subgraph "系统层"
D[Node.js 运行时]
E[Gateway 服务]
F[OAuth 流程]
G[扩展捆绑系统]
H[运行时依赖管理]
I[签名和公证]
J[WeChat 扩展]
K[Windows 打包系统]
end
subgraph "资源层"
L[React 控制界面]
M[静态资源]
N[配置文件]
O[基础设施扩展]
P[认证扩展]
Q[通信渠道扩展]
R[可移植Node运行时]
S[依赖包生成器]
T[跨平台打包脚本]
U[自动公证脚本]
V[WeChat 登录界面]
W[二维码生成器]
X[消息处理系统]
Y[Windows 资源处理]
Z[Node.exe 可执行文件]
AA[NSIS 安装程序]
BB[Windows 架构支持]
end
A --> D
A --> E
A --> F
A --> G
B --> L
C --> A
D --> M
E --> N
G --> O
G --> P
G --> Q
H --> R
H --> S
I --> T
I --> U
O --> AC[memory-core]
O --> AD[device-pair]
P --> AE[qwen-portal-auth]
P --> AF[minimax-portal-auth]
P --> AG[google-gemini-cli-auth]
P --> AH[copilot-proxy]
Q --> AI[telegram]
Q --> AJ[discord]
Q --> AK[slack]
Q --> AL[signal]
Q --> AM[whatsapp]
Q --> AN[imessage]
Q --> AO[matrix]
Q --> AP[msteams]
Q --> AQ[feishu]
Q --> AR[googlechat]
Q --> AS[irc]
Q --> AT[line]
Q --> AU[mattermost]
Q --> AV[nextcloud-talk]
Q --> AW[nostr]
Q --> AX[synology-chat]
Q --> AY[zalo]
Q --> AZ[zalouser]
Q --> BA[twitch]
Q --> BB[bluebubbles]
Q --> BC[openclaw-weixin]
J --> V
J --> W
J --> X
K --> Y
K --> Z
K --> AA
K --> BB
```

**图表来源**
- [apps/electron/src/main/index.ts:301-386](file://apps/electron/src/main/index.ts#L301-L386)
- [apps/electron/src/main/window.ts:99-136](file://apps/electron/src/main/window.ts#L99-L136)
- [apps/electron/packaged-runtime.json:17-73](file://apps/electron/packaged-runtime.json#L17-L73)
- [apps/electron/scripts/notarize.cjs:1-84](file://apps/electron/scripts/notarize.cjs#L1-L84)
- [apps/electron/scripts/package-electron-win.sh:1-198](file://apps/electron/scripts/package-electron-win.sh#L1-L198)

## 详细组件分析

### 打包配置详解

electron-builder.yml 定义了完整的打包配置，现已支持更全面的扩展捆绑和运行时管理，包括新增的 WeChat 扩展和 Windows 平台支持：

```mermaid
flowchart TD
A[开始打包] --> B[设置基础配置]
B --> C[配置输出目录]
C --> D[启用 ASAR 打包]
D --> E[配置不打包文件]
E --> F[添加额外资源]
F --> G[配置 macOS 特定选项]
G --> H[设置硬化工作者]
H --> I[配置 DMG 创建]
I --> J[添加扩展捆绑]
J --> K[捆绑基础设施扩展]
K --> L[memory-core 插件]
L --> M[device-pair 插件]
M --> N[捆绑认证扩展]
N --> O[qwen-portal-auth 插件]
O --> P[minimax-portal-auth 插件]
P --> Q[google-gemini-cli-auth 插件]
Q --> R[copilot-proxy 插件]
R --> S[捆绑通信渠道扩展]
S --> T[telegram 插件]
T --> U[discord 插件]
U --> V[slack 插件]
V --> W[signal 插件]
W --> X[whatsapp 插件]
X --> Y[imessage 插件]
Y --> Z[matrix 插件]
Z --> AA[msteams 插件]
AA --> AB[feishu 插件]
AB --> AC[googlechat 插件]
AC --> AD[irc 插件]
AD --> AE[line 插件]
AE --> AF[mattermost 插件]
AF --> AG[nextcloud-talk 插件]
AG --> AH[nostr 插件]
AH --> AI[synology-chat 插件]
AI --> AJ[zalo 插件]
AJ --> AK[zalouser 插件]
AK --> AL[twitch 插件]
AL --> AM[bluebubbles 插件]
AM --> AN[openclaw-weixin 插件]
AN --> AO[配置插件过滤规则]
AO --> AP[添加运行时依赖]
AP --> AQ[安装核心运行时依赖]
AQ --> AR[安装额外运行时依赖]
AR --> AS[裁剪原生模块]
AS --> AT[配置公证钩子]
AT --> AU[配置 Windows 特定选项]
AU --> AV[设置 NSIS 安装程序]
AV --> AW[配置 Windows 资源]
AW --> AX[区分 node.exe 可执行文件]
AX --> AY[配置 URL Scheme]
AY --> AZ[完成打包]
AZ --> BA[Windows 产物输出]
BA --> BB[.exe 安装包]
BA --> BC[.zip 压缩包]
```

**更新** 新增的 Windows 平台配置：
- **win 配置块**：完整的 Windows 平台打包配置
- **NSIS 安装程序**：支持一键安装和桌面快捷方式创建
- **Windows 资源处理**：区分 Windows 的 node.exe 可执行文件
- **URL Scheme 配置**：支持 openclaw:// 协议回调
- **架构支持**：固定支持 x64 架构（可扩展为 arm64）

**图表来源**
- [apps/electron/electron-builder.yml:286-315](file://apps/electron/electron-builder.yml#L286-L315)
- [apps/electron/packaged-runtime.json:145-147](file://apps/electron/packaged-runtime.json#L145-L147)

### 构建工具配置

**更新** tsdown.config.electron.ts 引入了基于配置的依赖管理：

| 配置项 | 值 | 说明 |
|--------|-----|------|
| entry | main/index | 主进程入口文件 |
| outDir | dist | 输出目录 |
| format | cjs | CommonJS 格式 |
| target | node20 | Node.js 20 目标 |
| platform | node | Node.js 平台 |
| external | electron | 外部依赖 |
| sourcemap | true | 生成源码映射 |
| bundle | true | 启用打包 |
| **neverBundle** | packagedRuntime.neverBundleDependencies | **基于配置的原生依赖** |

**更新** 新增的运行时依赖配置：
- **neverBundleDependencies**：定义不能内联的原生/特殊模块
- **NATIVE_EXTERNALS**：从 packaged-runtime.json 动态导入的原生外部依赖
- **智能依赖排除**：自动排除 electron、sharp、playwright-core 等原生模块

**章节来源**
- [apps/electron/electron-builder.yml:1-315](file://apps/electron/electron-builder.yml#L1-L315)
- [apps/electron/tsdown.config.electron.ts:14-28](file://apps/electron/tsdown.config.electron.ts#L14-L28)
- [apps/electron/packaged-runtime.json:2-16](file://apps/electron/packaged-runtime.json#L2-L16)

### macOS 硬化运行时配置

entitlements.mac.plist 定义了 macOS 应用的权限配置：

```mermaid
graph LR
subgraph "权限配置"
A[com.apple.security.cs.allow-jit] --> B[JIT 编译]
C[com.apple.security.cs.allow-unsigned-executable-memory] --> D[未签名内存]
E[com.apple.security.network.client] --> F[出站网络]
G[com.apple.security.network.server] --> H[入站网络]
I[com.apple.security.files.user-selected.read-write] --> J[用户文件]
K[com.apple.security.files.downloads.read-write] --> L[下载文件]
M[com.apple.security.cs.debugger] --> N[调试器访问]
O[com.apple.security.application-groups] --> P[应用组]
end
```

**图表来源**
- [apps/electron/resources/entitlements.mac.plist:1-25](file://apps/electron/resources/entitlements.mac.plist#L1-L25)

**章节来源**
- [apps/electron/resources/entitlements.mac.plist:1-25](file://apps/electron/resources/entitlements.mac.plist#L1-L25)

### 用户配置管理

openclaw.json 包含了完整的用户配置信息：

| 配置类别 | 说明 | 关键字段 |
|----------|------|----------|
| meta | 应用元数据 | lastTouchedVersion, lastTouchedAt |
| wizard | 引导向导配置 | lastRunAt, lastRunVersion |
| auth | 认证配置 | profiles, provider, mode |
| models | 模型配置 | providers, models, contextWindow |
| agents | 代理配置 | defaults, workspace |
| gateway | 网关配置 | port, mode, auth, nodes |
| **plugins** | **扩展配置** | **entries, minimax-portal-auth: enabled** |
| **channels** | **消息通道配置** | **openclaw-weixin: 配置** |

**章节来源**
- [apps/electron/openclaw.json:1-142](file://apps/electron/openclaw.json#L1-L142)

## 运行时依赖管理系统

**更新** 新增的自动化运行时依赖管理系统实现了从手动管理到智能配置的转变。

### 运行时依赖配置

packaged-runtime.json 定义了 Electron 应用的运行时依赖配置，现已包含 WeChat 扩展的支持：

```mermaid
graph TB
subgraph "运行时依赖配置"
A[packaged-runtime.json] --> B[neverBundleDependencies]
A --> C[coreRuntimeDependencies]
A --> D[runtimeDependencies]
A --> E[preinstalledExtensions]
end
subgraph "neverBundleDependencies"
B --> F[electron]
B --> G[sharp]
B --> H[playwright-core]
B --> I[sqlite-vec]
B --> J[opusscript]
B --> K[@lydell/node-pty]
B --> L[@napi-rs/canvas]
B --> M[node-llama-cpp]
B --> N[koffi]
B --> O[@matrix-org/matrix-sdk-crypto-nodejs]
B --> P[@whiskeysockets/baileys]
B --> Q[esbuild]
B --> R[jiti]
end
subgraph "coreRuntimeDependencies"
C --> S[@agentclientprotocol/sdk]
C --> T[@aws-sdk/client-bedrock]
C --> U[@buape/carbon]
C --> V[@clack/prompts]
C --> W[... 多个核心依赖]
C --> X[openclaw-weixin]
end
subgraph "runtimeDependencies"
D --> X[openclaw-weixin]
D --> Y[koffi]
D --> Z[@matrix-org/matrix-sdk-crypto-nodejs]
D --> AA[esbuild]
D --> AB[jiti]
end
subgraph "preinstalledExtensions"
E --> AC[memory-core]
E --> AD[device-pair]
E --> AE[qwen-portal-auth]
E --> AF[minimax-portal-auth]
E --> AG[google-gemini-cli-auth]
E --> AH[copilot-proxy]
E --> AI[telegram]
E --> AJ[discord]
E --> AK[slack]
E --> AL[signal]
E --> AM[whatsapp]
E --> AN[imessage]
E --> AO[matrix]
E --> AP[msteams]
E --> AQ[feishu]
E --> AR[googlechat]
E --> AS[irc]
E --> AT[line]
E --> AU[mattermost]
E --> AV[nextcloud-talk]
E --> AW[nostr]
E --> AX[synology-chat]
E --> AY[zalo]
E --> AZ[zalouser]
E --> BA[twitch]
E --> BB[bluebubbles]
E --> BC[openclaw-weixin]
end
```

**图表来源**
- [apps/electron/packaged-runtime.json:1-157](file://apps/electron/packaged-runtime.json#L1-L157)

### 运行时包生成器

**更新** generate-runtime-package.mjs 实现了运行时依赖的精确版本解析，现已支持 WeChat 扩展：

```mermaid
flowchart TD
A[运行时包生成器] --> B[读取配置文件]
B --> C[解析核心依赖]
C --> D[解析运行时依赖]
D --> E[合并依赖集合]
E --> F[解析版本信息]
F --> G{版本解析成功?}
G --> |是| H[生成 package.json]
G --> |否| I[从多个源解析版本]
I --> J[从 package.json 解析]
J --> K[从已安装模块解析]
K --> L[从 pnpm-lock.yaml 解析]
L --> M[生成最终依赖映射]
M --> N[写入 package.json]
H --> O[返回生成的依赖]
N --> O
```

**版本解析策略**：
1. **优先级1**：从 packaged-runtime.json 的直接依赖映射
2. **优先级2**：从根 package.json 的依赖声明
3. **优先级3**：从已安装的 node_modules 解析实际版本
4. **优先级4**：从 pnpm-lock.yaml 的锁定版本解析

**章节来源**
- [apps/electron/packaged-runtime.json:1-157](file://apps/electron/packaged-runtime.json#L1-L157)
- [apps/electron/scripts/generate-runtime-package.mjs:19-115](file://apps/electron/scripts/generate-runtime-package.mjs#L19-L115)

### Node.js 运行时管理

**更新** download-node.sh 提供了可移植的 Node.js 运行时，现已支持 WeChat 扩展的运行时需求：

```mermaid
flowchart TD
A[Node 运行时下载] --> B[设置架构参数]
B --> C[检查缓存文件]
C --> D{文件已存在?}
D --> |是| E[跳过下载]
D --> |否| F[构建下载URL]
F --> G[创建输出目录]
G --> H[下载并解压]
H --> I[设置执行权限]
I --> J[验证下载结果]
E --> K[返回成功]
J --> K
```

**支持的架构**：
- **arm64**：Apple Silicon Mac（darwin-arm64）
- **x64**：Intel Mac（darwin-x64）
- **Windows**：支持 win-x64 和 win-arm64 架构
- **版本**：Node.js 24.14.1（长期支持版本）

**章节来源**
- [apps/electron/scripts/download-node.sh:1-57](file://apps/electron/scripts/download-node.sh#L1-L57)

## 多部署模式支持

**更新** package-electron.sh 引入了灵活的多部署模式支持，现已包含 WeChat 扩展的处理。

### 部署模式配置

**更新** 支持的部署模式及其特点：

```mermaid
graph TB
subgraph "部署模式"
A[package-electron.sh] --> B[本地快速测试模式]
A --> C[生产发布模式]
D[package-electron-win.sh] --> E[Windows 打包模式]
D --> F[跨平台打包模式]
end
subgraph "本地快速测试模式"
B --> G[LOCAL_FAST=1]
B --> H[SKIP_BUILD=1]
B --> I[REUSE_RUNTIME_DEPS=1]
B --> J[禁用签名]
B --> K[禁用硬化运行时]
B --> L[快速构建流程]
end
subgraph "生产发布模式"
C --> M[默认配置]
C --> N[完整构建流程]
C --> O[启用签名]
C --> P[启用硬化运行时]
C --> Q[完整依赖安装]
end
subgraph "Windows 打包模式"
E --> R[ARCH=x64 固定]
E --> S[跨平台编译]
E --> T[Windows 资源处理]
end
subgraph "跨平台打包模式"
F --> U[支持多架构]
F --> V[统一打包流程]
F --> W[平台特定配置]
end
subgraph "构建流程"
X[构建 artifacts] --> Y[下载 Node 运行时]
Y --> Z[安装运行时依赖]
Z --> AA[裁剪原生模块]
AA --> BB[构建主进程]
BB --> CC[打包应用]
CC --> DD[清理临时文件]
DD --> EE[WeChat 扩展处理]
EE --> FF[二维码生成器集成]
FF --> GG[微信登录界面]
GG --> HH[消息处理系统]
HH --> II[完成打包]
end
```

**环境变量控制**：
- **LOCAL_FAST**：启用本地快速测试模式
- **SKIP_BUILD**：跳过构建步骤
- **REUSE_RUNTIME_DEPS**：复用已有的运行时依赖
- **ARCH**：目标架构（arm64/x64）

**章节来源**
- [apps/electron/scripts/package-electron.sh:15-23](file://apps/electron/scripts/package-electron.sh#L15-L23)
- [apps/electron/scripts/package-electron.sh:61-92](file://apps/electron/scripts/package-electron.sh#L61-L92)
- [apps/electron/scripts/package-electron-win.sh:13-16](file://apps/electron/scripts/package-electron-win.sh#L13-L16)

### 架构特定依赖裁剪

**更新** prune_runtime_dependencies 函数实现了架构特定的原生模块裁剪，现已包含 WeChat 扩展的处理：

```mermaid
flowchart TD
A[原生模块裁剪] --> B[确定目标架构]
B --> C{架构类型?}
C --> |arm64| D[设置 koffi 目标: darwin_arm64/win32_arm64]
C --> |x64| E[设置 koffi 目标: darwin_x64/win32_x64]
C --> |其他| F[跳过裁剪]
D --> G[查找 koffi 目录]
E --> G
F --> H[输出警告信息]
G --> I{找到目录?}
I --> |否| J[输出提示信息]
I --> |是| K[遍历平台目录]
K --> L[删除非目标平台目录]
L --> M[保留目标平台目录]
M --> N[输出裁剪结果]
J --> N
```

**裁剪范围**：
- **koffi**：裁剪到目标架构的原生二进制
- **其他原生模块**：根据架构需求进行相应的裁剪
- **目标架构**：支持 arm64（Apple Silicon）和 x64（Intel）
- **Windows 架构**：支持 win-arm64 和 win-x64

**章节来源**
- [apps/electron/scripts/package-electron.sh:94-139](file://apps/electron/scripts/package-electron.sh#L94-L139)
- [apps/electron/scripts/package-electron-win.sh:109-154](file://apps/electron/scripts/package-electron-win.sh#L109-L154)

## 跨平台打包增强

**更新** 新增的 Windows 打包支持和跨平台构建流程，现已包含 WeChat 扩展的处理。

### Windows 打包脚本

**更新** package-electron-win.sh 提供了完整的 Windows 打包解决方案，现已包含 WeChat 扩展：

```mermaid
flowchart TD
A[Windows 打包流程] --> B[设置环境变量]
B --> C[构建 CLI 产物]
C --> D[构建 UI 产物]
D --> E[下载 Node.js 运行时]
E --> F[生成运行时依赖]
F --> G[安装运行时依赖]
G --> H[裁剪原生模块]
H --> I[构建主进程]
I --> J[打包 Windows 应用]
J --> K[清理临时文件]
K --> L[WeChat 扩展处理]
L --> M[二维码生成器集成]
M --> N[微信登录界面]
N --> O[消息处理系统]
O --> P[输出产物]
```

**Windows 特定配置**：
- **固定架构**：目前只支持 x64 架构（可扩展为 arm64）
- **资源处理**：区分 Windows 的 node.exe 可执行文件
- **安装程序**：使用 NSIS 创建安装包
- **协议支持**：配置 openclaw URL Scheme

**章节来源**
- [apps/electron/scripts/package-electron-win.sh:1-198](file://apps/electron/scripts/package-electron-win.sh#L1-L198)

### 跨平台构建指南

**更新** BUILDING.md 提供了详细的构建和部署指导，现已包含 WeChat 扩展的说明：

```mermaid
graph TB
subgraph "构建命令"
A[make dev] --> B[开发模式]
C[make package-fast] --> D[本地打包测试]
E[make package] --> F[正式打包]
G[make package-win] --> H[Windows 打包]
I[make package-win-fast] --> J[Windows 快速打包]
end
subgraph "配置步骤"
K[make setup] --> L[初次设置]
M[生成 API Key] --> N[配置 .env]
O[确认证书] --> P[打包流程]
end
subgraph "验证步骤"
Q[make verify] --> R[验证签名]
S[检查公证状态] --> T[验证安装包]
end
subgraph "WeChat 扩展"
U[微信登录] --> V[二维码生成]
V --> W[消息收发]
W --> X[账户管理]
end
```

**构建命令说明**：
- **开发模式**：支持热重载和实时调试
- **本地打包**：无签名的快速验证
- **正式打包**：完整的签名和公证流程
- **Windows 打包**：跨平台支持 Windows 版本

**章节来源**
- [apps/electron/BUILDING.md:1-244](file://apps/electron/BUILDING.md#L1-L244)

### 多架构支持

**更新** 统一的多架构打包支持，现已包含 WeChat 扩展：

```mermaid
graph TB
subgraph "架构支持"
A[macOS] --> B[arm64 (Apple Silicon)]
A --> C[x64 (Intel)]
D[Windows] --> E[x64 (固定)]
F[Linux] --> G[多架构支持]
end
subgraph "资源处理"
B --> H[macOS 资源]
C --> I[macOS 资源]
E --> J[Windows 资源]
G --> K[Linux 资源]
end
subgraph "打包目标"
H --> L[dmg + zip]
I --> M[dmg + zip]
J --> N[nsis + zip]
K --> O[deb + rpm]
end
subgraph "WeChat 扩展资源"
P[二维码生成器] --> Q[macOS 资源]
R[微信登录界面] --> S[Windows 资源]
T[消息处理系统] --> U[Linux 资源]
end
```

**架构特定配置**：
- **macOS**：同时支持 arm64 和 x64 架构
- **Windows**：当前支持 x64 架构
- **资源差异**：区分平台特定的图标和配置文件
- **打包格式**：根据平台选择合适的安装包格式

**章节来源**
- [apps/electron/electron-builder.yml:286-315](file://apps/electron/electron-builder.yml#L286-L315)
- [apps/electron/scripts/package-electron-win.sh:13-25](file://apps/electron/scripts/package-electron-win.sh#L13-L25)

### Makefile 增强

**更新** Makefile 现已包含完整的 Windows 打包支持：

```mermaid
graph TB
subgraph "Makefile 目标"
A[package-win] --> B[打包 Windows x64]
C[package-win-fast] --> D[快速打包 Windows]
E[package] --> F[打包 macOS 当前架构]
G[package-fast] --> H[快速打包 macOS]
I[package-arm64] --> J[打包 macOS arm64]
K[package-x64] --> L[打包 macOS x64]
end
subgraph "Windows 目标配置"
B --> M[ARCH=x64]
B --> N[bash package-electron-win.sh]
D --> O[LOCAL_FAST=1]
D --> P[ARCH=x64]
end
subgraph "环境变量支持"
Q[ARCH] --> R[架构检测]
Q --> S[可覆盖: ARCH=x64 make package]
R --> T[默认: uname -m | sed 's/x86_64/x64/' ]
end
```

**Makefile 增强特性**：
- **Windows 目标**：新增 package-win 和 package-win-fast 目标
- **环境变量**：支持 ARCH 环境变量覆盖架构设置
- **统一命令**：使用相同的打包脚本实现跨平台支持
- **快速模式**：支持 Windows 的快速打包模式

**章节来源**
- [apps/electron/Makefile:83-91](file://apps/electron/Makefile#L83-L91)
- [apps/electron/Makefile:22-24](file://apps/electron/Makefile#L22-L24)

## 签名和公证自动化

**更新** 新增的 macOS 自动公证流程和签名配置，现已包含 WeChat 扩展的处理。

### 自动公证脚本

**更新** notarize.cjs 实现了完整的自动公证流程，现已支持 WeChat 扩展：

```mermaid
flowchart TD
A[公证流程] --> B[检查平台]
B --> C{是否 macOS?}
C --> |否| D[跳过公证]
C --> |是| E[检查签名配置]
E --> F{本地快速测试?}
F --> |是| G[跳过公证]
F --> |否| H[检查环境变量]
H --> I{环境变量完整?}
I --> |否| J[跳过公证并警告]
I --> |是| K[准备临时文件]
K --> L[调用 notarytool]
L --> M[等待公证完成]
M --> N[输出公证结果]
```

**公证配置要求**：
- **App Store Connect API**：需要完整的 API 密钥配置
- **证书验证**：确保签名证书有效且可访问
- **自动处理**：支持从文件路径或直接内容获取密钥
- **错误处理**：完善的错误检测和用户提示

**章节来源**
- [apps/electron/scripts/notarize.cjs:1-84](file://apps/electron/scripts/notarize.cjs#L1-L84)

### 传统公证脚本

**更新** scripts/notarize-mac-artifact.sh 提供了手动公证支持，现已包含 WeChat 扩展：

```mermaid
flowchart TD
A[手动公证] --> B[验证输入参数]
B --> C[检查 xcrun 工具]
C --> D[选择认证方式]
D --> E{Keychain 配置?}
E --> |是| F[使用存储凭证]
E --> |否| G{API Key 配置?}
G --> |是| H[使用 API Key]
G --> |否| I[报错并退出]
F --> J[提交公证请求]
H --> J
J --> K[等待公证完成]
K --> L{产物类型?}
L --> |DMG/PKG| M[执行贴标]
L --> |其他| N[跳过贴标]
M --> O[验证贴标结果]
N --> P[完成公证]
O --> P
```

**传统公证支持**：
- **多种认证方式**：支持 Keychain 凭证和 API Key
- **自动贴标**：自动为 DMG/PKG 文件执行贴标
- **验证机制**：公证完成后自动验证结果
- **灵活配置**：支持单独的公证和贴标操作

**章节来源**
- [scripts/notarize-mac-artifact.sh:1-66](file://scripts/notarize-mac-artifact.sh#L1-L66)

### 签名配置管理

**更新** electron-builder.yml 中的签名配置，现已包含 WeChat 扩展：

```mermaid
graph TB
subgraph "签名配置"
A[mac 配置] --> B[hardenedRuntime: true]
A --> C[entitlements: entitlements.mac.plist]
A --> D[identity: CBFA4655YD]
A --> E[category: public.app-category.productivity]
end
subgraph "公证配置"
F[afterSign: scripts/notarize.cjs] --> G[自动调用公证脚本]
end
subgraph "协议配置"
H[protocols] --> I[name: OpenClaw OAuth]
H --> J[schemes: openclaw]
end
subgraph "WeChat 扩展配置"
K[openclaw-weixin] --> L[二维码登录]
L --> M[消息收发]
M --> N[账户管理]
end
```

**签名配置要点**：
- **硬化运行时**：启用 macOS 硬化运行时保护
- **权限配置**：通过 entitlements 文件管理应用权限
- **证书标识**：使用固定的开发者证书标识
- **自动公证**：配置打包后的自动公证钩子

**章节来源**
- [apps/electron/electron-builder.yml:249-266](file://apps/electron/electron-builder.yml#L249-L266)
- [apps/electron/electron-builder.yml:258-261](file://apps/electron/electron-builder.yml#L258-L261)

## WeChat 扩展集成

**更新** 新增的 WeChat 扩展支持，为微信/WeChat 消息通道提供了完整的集成能力。

### WeChat 扩展配置

openclaw-weixin 扩展提供了完整的微信消息通道支持：

```mermaid
flowchart TD
A[WeChat 扩展] --> B[扩展注册]
B --> C[配置模式]
C --> D[Channel ID: openclaw-weixin]
D --> E[插件 ID: openclaw-weixin]
E --> F[标签: openclaw-weixin]
F --> G[文档路径: /channels/openclaw-weixin]
G --> H[安装配置]
H --> I[npmSpec: @tencent-weixin/openclaw-weixin]
I --> J[本地路径: extensions/openclaw-weixin]
J --> K[默认选择: npm]
K --> L[最小主机版本: >=2026.3.9]
end
```

**扩展特性**：
- **官方支持**：由 @tencent-weixin 组织提供
- **类型安全**：基于 Zod 的配置验证
- **二维码登录**：完整的微信登录流程
- **消息处理**：支持微信消息的接收和发送
- **账户管理**：支持多微信账户配置
- **兼容性**：与 OpenClaw 主机版本兼容

**章节来源**
- [extensions/openclaw-weixin/openclaw.plugin.json:1-11](file://extensions/openclaw-weixin/openclaw.plugin.json#L1-L11)
- [extensions/openclaw-weixin/package.json:1-61](file://extensions/openclaw-weixin/package.json#L1-L61)
- [extensions/openclaw-weixin/index.ts:1-34](file://extensions/openclaw-weixin/index.ts#L1-L34)

### WeChat 配置系统

**更新** 基于 Zod 的类型安全配置系统：

```mermaid
graph TB
subgraph "WeChat 配置系统"
A[WeixinConfigSchema] --> B[账户配置]
B --> C[name: string]
C --> D[enabled: boolean]
D --> E[baseUrl: string]
E --> F[cdnBaseUrl: string]
F --> G[routeTag: number]
end
subgraph "账户管理"
H[ResolvedWeixinAccount] --> I[accountId: string]
I --> J[baseUrl: string]
J --> K[cdnBaseUrl: string]
K --> L[token?: string]
L --> M[enabled: boolean]
M --> N[configured: boolean]
N --> O[name?: string]
end
subgraph "配置解析"
P[resolveWeixinAccount] --> Q[从配置文件解析]
Q --> R[从存储文件解析]
R --> S[合并配置]
S --> T[返回 ResolvedWeixinAccount]
end
```

**配置特性**：
- **类型安全**：完整的 TypeScript 类型定义
- **默认值**：合理的默认配置值
- **验证机制**：运行时配置验证
- **账户索引**：持久化的账户管理
- **路由标签**：支持 SKRouteTag 配置

**章节来源**
- [extensions/openclaw-weixin/src/config/config-schema.ts:1-20](file://extensions/openclaw-weixin/src/config/config-schema.ts#L1-L20)
- [extensions/openclaw-weixin/src/auth/accounts.ts:350-381](file://extensions/openclaw-weixin/src/auth/accounts.ts#L350-L381)

### WeChat 登录界面

**更新** React 组件支持微信登录和消息管理：

```mermaid
flowchart TD
A[WeixinLoginPanel] --> B[二维码生成]
B --> C[QRCanvas 组件]
C --> D[qrcode-terminal]
D --> E[二维码显示]
E --> F[登录状态]
F --> G[connected: boolean]
G --> H[busy: boolean]
H --> I[message: string]
I --> J[操作按钮]
J --> K[onStart: 开始登录]
K --> L[onWait: 等待扫描]
L --> M[onLogout: 注销]
M --> N[自动等待]
N --> O[扫描触发]
```

**UI 特性**：
- **二维码显示**：基于 qrcode-terminal 的二维码生成
- **状态指示**：连接状态和错误信息显示
- **自动流程**：二维码出现后自动触发等待扫描
- **用户友好**：清晰的操作按钮和状态反馈
- **错误处理**：二维码生成失败时的备用链接

**章节来源**
- [ui-react/src/components/channels/WeixinLoginPanel.tsx:1-79](file://ui-react/src/components/channels/WeixinLoginPanel.tsx#L1-L79)
- [ui-react/src/components/channels/ChannelDetail.tsx:106-134](file://ui-react/src/components/channels/ChannelDetail.tsx#L106-L134)

### WeChat 消息处理

**更新** 完整的消息处理和账户管理功能：

```mermaid
flowchart TD
A[WeChat 消息处理] --> B[账户解析]
B --> C[resolveWeixinAccount]
C --> D[loadWeixinAccount]
D --> E[loadWeixinAccountIndex]
E --> F[合并配置和凭据]
F --> G[ResolvedWeixinAccount]
G --> H[消息发送]
H --> I[sendMessage]
I --> J[消息接收]
J --> K[getUpdates]
K --> L[账户管理]
L --> M[clearStaleAccountsForUserId]
M --> N[unregisterWeixinAccountId]
N --> O[clearWeixinAccount]
```

**消息处理特性**：
- **账户解析**：从配置和存储文件解析账户信息
- **消息发送**：支持微信消息的发送
- **消息接收**：支持微信消息的长轮询接收
- **账户清理**：自动清理过期的微信账户
- **状态管理**：跟踪账户的配置状态和连接状态

**章节来源**
- [extensions/openclaw-weixin/src/auth/accounts.ts:90-107](file://extensions/openclaw-weixin/src/auth/accounts.ts#L90-L107)
- [extensions/openclaw-weixin/src/auth/accounts.ts:356-381](file://extensions/openclaw-weixin/src/auth/accounts.ts#L356-L381)

## 依赖关系分析

```mermaid
graph TB
subgraph "开发依赖"
A[electron@31.7.7]
B[electron-builder@26.8.1]
C[tsup@8.4.0]
D[typescript@5.8.3]
E[tsdown@0.21.0]
F[@electron/notarize@3.1.1]
end
subgraph "运行时依赖"
G[react@19.2.4]
H[react-dom@19.2.4]
I[zustand@5.0.11]
J[lucide-react@0.469.0]
K[electron-updater@6.8.3]
end
subgraph "构建工具"
L[concurrently@9.1.2]
M[tailwindcss@4.2.1]
N[@tailwindcss/vite@4.2.1]
O[make 命令]
P[Windows 支持]
end
subgraph "扩展系统"
Q[memory-core 插件]
R[device-pair 插件]
S[qwen-portal-auth 插件]
T[minimax-portal-auth 插件]
U[google-gemini-cli-auth 插件]
V[copilot-proxy 插件]
W[telegram 插件]
X[discord 插件]
Y[slack 插件]
Z[signal 插件]
AA[whatsapp 插件]
AB[imessage 插件]
AC[matrix 插件]
AD[msteams 插件]
AE[feishu 插件]
AF[googlechat 插件]
AG[irc 插件]
AH[line 插件]
AI[mattermost 插件]
AJ[nextcloud-talk 插件]
AK[nostr 插件]
AL[synology-chat 插件]
AM[zalo 插件]
AN[zalouser 插件]
AO[twitch 插件]
AP[bluebubbles 插件]
AQ[openclaw-weixin 插件]
AR[微信扩展依赖]
AS[Windows 打包依赖]
end
subgraph "微信扩展依赖"
AR --> AT[qrcode-terminal@0.12.0]
AR --> AU[zod@4.3.6]
AR --> AV[silk-wasm]
end
subgraph "Windows 打包依赖"
AS --> AW[NSIS 安装程序]
AS --> AX[Windows 资源处理]
AS --> AY[Node.exe 可执行文件]
end
subgraph "运行时管理系统"
AZ[packaged-runtime.json]
BA[generate-runtime-package.mjs]
BB[download-node.sh]
BC[package-electron.sh]
BD[package-electron-win.sh]
BE[notarize.cjs]
end
A --> O
B --> F
C --> L
E --> P
AZ --> BA
BA --> BB
BB --> BC
BC --> A
BD --> A
BE --> F
AQ --> AR
AS --> AW
```

**图表来源**
- [apps/electron/package.json:18-44](file://apps/electron/package.json#L18-L44)
- [apps/electron/packaged-runtime.json:1-157](file://apps/electron/packaged-runtime.json#L1-L157)
- [apps/electron/scripts/generate-runtime-package.mjs:19-115](file://apps/electron/scripts/generate-runtime-package.mjs#L19-L115)

**章节来源**
- [apps/electron/package.json:18-44](file://apps/electron/package.json#L18-L44)
- [apps/electron/packaged-runtime.json:1-157](file://apps/electron/packaged-runtime.json#L1-L157)

## 性能考虑

### 打包优化策略

**更新** 新增的运行时依赖管理系统和 WeChat 扩展带来了显著的性能提升：

1. **智能依赖排除**：通过 neverBundle 配置避免内联大型原生模块
2. **精确版本控制**：使用 pnpm 锁文件确保依赖版本的一致性
3. **架构特定裁剪**：减少不必要的原生模块体积
4. **可复用运行时**：支持运行时依赖的缓存和复用
5. **分阶段构建**：将构建过程分解为可独立优化的步骤
6. **跨平台优化**：针对不同平台优化资源和依赖
7. **WeChat 扩展优化**：二维码生成和消息处理的性能优化
8. **Windows 打包优化**：交叉编译和资源处理的性能优化

### 内存管理

- 预加载脚本限制渲染进程访问 Node.js API
- 主进程管理所有系统级操作
- 窗口生命周期管理，避免内存泄漏
- **扩展自动发现机制**：通过 `resolveBundledPluginsDir()` 函数智能定位扩展目录
- **运行时依赖缓存**：支持运行时依赖的复用，减少重复安装
- **跨平台资源优化**：根据不同平台裁剪不必要的资源
- **WeChat 扩展内存管理**：二维码生成和消息处理的内存优化
- **Windows 资源管理**：优化 Windows 平台的资源使用

### 运行时依赖优化

**更新** 运行时依赖管理系统的性能优势：
- **动态版本解析**：从多个源解析依赖版本，确保准确性
- **智能依赖排除**：自动排除不能内联的原生模块
- **架构感知裁剪**：根据目标架构优化原生模块
- **增量构建支持**：支持跳过已完成的构建步骤
- **缓存机制**：运行时依赖可被缓存和复用
- **跨平台资源管理**：优化不同平台的资源使用
- **WeChat 扩展优化**：二维码生成器的性能优化
- **Windows 打包优化**：交叉编译和资源处理的性能优化

**章节来源**
- [apps/electron/scripts/generate-runtime-package.mjs:33-89](file://apps/electron/scripts/generate-runtime-package.mjs#L33-L89)
- [apps/electron/scripts/package-electron.sh:81-84](file://apps/electron/scripts/package-electron.sh#L81-L84)
- [apps/electron/scripts/package-electron-win.sh:168-175](file://apps/electron/scripts/package-electron-win.sh#L168-L175)

## 故障排除指南

### 常见问题及解决方案

**更新** 新增的跨平台和签名相关问题，以及 WeChat 扩展特有的问题：

| 问题类型 | 症状 | 解决方案 |
|----------|------|----------|
| 打包失败 | electron-builder 报错 | 检查依赖版本兼容性 |
| 窗口无法显示 | 黑屏或空白页 | 检查静态服务器启动 |
| OAuth 重定向失败 | 回调 URL 无效 | 验证 URL Scheme 配置 |
| 权限问题 | 文件访问被拒绝 | 检查 entitlements 配置 |
| 网络连接失败 | Gateway 无法连接 | 验证防火墙设置 |
| **Windows 打包失败** | 交叉编译错误 | 检查目标架构配置 |
| **公证失败** | 公证超时或失败 | 验证 API Key 和网络连接 |
| **签名问题** | 证书无效 | 检查 Keychain 中的证书 |
| **跨平台资源缺失** | 平台特定文件丢失 | 验证资源路径配置 |
| **运行时依赖缺失** | 应用启动失败 | 检查 packaged-runtime.json 配置 |
| **版本解析失败** | 依赖安装错误 | 验证 pnpm-lock.yaml 和 package.json |
| **原生模块错误** | 崩溃或性能问题 | 检查架构裁剪配置 |
| **Node 运行时问题** | 无法启动可执行文件 | 验证 download-node.sh 执行权限 |
| **扩展未加载** | 多个核心扩展不可用 | 检查扩展捆绑配置 |
| **扩展路径错误** | 扩展路径解析失败 | 验证 bundled-dir.ts 配置 |
| **认证失败** | AI Provider 认证异常 | 检查认证扩展捆绑 |
| **通信失败** | Telegram/Discord/WeChat 连接问题 | 验证通信扩展配置 |
| **品牌标识问题** | 应用显示 OpenClaw | 检查 electron-builder.yml 配置 |
| **DMG 标题错误** | 安装包显示 OpenClaw | 验证 DMG 标题配置 |
| **WeChat 登录失败** | 二维码无法生成 | 检查 qrcode-terminal 依赖 |
| **WeChat 消息发送失败** | 微信消息无法发送 | 验证微信账户配置 |
| **WeChat 账户管理问题** | 账户切换异常 | 检查账户索引文件 |
| **WeChat 扩展加载失败** | openclaw-weixin 未加载 | 验证扩展捆绑配置 |
| **Windows 资源处理失败** | node.exe 文件缺失 | 检查 Windows 资源配置 |
| **NSIS 安装程序问题** | 安装包无法创建 | 验证 NSIS 配置和权限 |
| **Windows 架构不匹配** | 应用无法运行 | 检查 ARCH 环境变量设置 |

### 跨平台打包调试

**更新** 新增的跨平台打包调试方法，包含 WeChat 扩展的调试：

1. **日志查看**：检查 `~/.openclaw/electron-onboarding.log`
2. **开发者工具**：使用 `Ctrl+Shift+I` 打开开发者工具
3. **网络监控**：观察 WebSocket 连接状态
4. **文件权限**：验证资源文件可执行权限
5. **扩展调试**：检查 `patchConfigForElectron` 日志输出
6. **运行时依赖检查**：验证 `resources/prod-node_modules` 目录
7. **版本解析调试**：检查 `generate-runtime-package.mjs` 输出
8. **架构裁剪验证**：确认原生模块的架构匹配
9. **品牌配置验证**：检查 electron-builder.yml 中的品牌信息
10. **OAuth URL Scheme**：验证 'openclaw' URL Scheme 配置
11. **Windows 资源验证**：确认 Windows 特定资源正确打包
12. **公证配置检查**：验证 notarize.cjs 环境变量设置
13. **跨平台兼容性**：测试不同平台的安装和运行
14. **WeChat 扩展调试**：检查 openclaw-weixin 扩展加载
15. **二维码功能验证**：测试二维码生成和显示
16. **微信登录调试**：验证完整的微信登录流程
17. **消息处理调试**：验证微信消息的收发功能
18. **Windows 打包调试**：验证 package-electron-win.sh 的执行流程
19. **NSIS 安装程序调试**：检查安装包创建过程
20. **架构特定问题**：验证不同架构下的运行时依赖

**更新** 运行时相关调试：
- 查看 `[main] patchConfigForElectron: non-bundled plugin entries present (kept)` 日志
- 验证 `BUNDLED_PLUGIN_IDS` 集合包含所有核心扩展 ID
- 检查扩展捆绑路径是否正确
- 验证扩展清单文件格式是否正确
- **检查运行时依赖安装日志**：确认 `generate-runtime-package.mjs` 成功执行
- **验证 Node 运行时完整性**：确认 `download-node.sh` 成功下载可执行文件
- **调试多部署模式**：根据 `LOCAL_FAST` 环境变量调整构建行为
- **验证品牌配置**：确认应用ID、产品名称、版权信息已更新
- **Windows 打包调试**：验证 package-electron-win.sh 的执行流程
- **公证流程验证**：检查 notarize.cjs 的环境变量和证书配置
- **WeChat 扩展验证**：确认 openclaw-weixin 扩展正确打包
- **二维码功能验证**：测试二维码生成和显示
- **微信登录验证**：验证完整的微信登录流程
- **消息处理验证**：测试微信消息的收发功能
- **Makefile 目标验证**：确认 Windows 打包目标正确配置

**章节来源**
- [apps/electron/src/main/index.ts:77-85](file://apps/electron/src/main/index.ts#L77-L85)
- [apps/electron/src/main/window.ts:202-226](file://apps/electron/src/main/window.ts#L202-L226)
- [apps/electron/src/main/index.ts:254-265](file://apps/electron/src/main/index.ts#L254-L265)
- [apps/electron/scripts/generate-runtime-package.mjs:100-105](file://apps/electron/scripts/generate-runtime-package.mjs#L100-L105)
- [apps/electron/scripts/package-electron-win.sh:162-173](file://apps/electron/scripts/package-electron-win.sh#L162-L173)
- [apps/electron/scripts/notarize.cjs:34-40](file://apps/electron/scripts/notarize.cjs#L34-L40)
- [apps/electron/Makefile:83-91](file://apps/electron/Makefile#L83-L91)

## 结论

OpenClaw 的 Electron 打包配置经过重大增强，从单一平台支持发展为完整的跨平台打包解决方案。本次更新特别引入了 Windows 打包系统，通过新增的 package-electron-win.sh 脚本实现了在 macOS/Linux 上交叉编译 Windows 版本的能力。该扩展支持二维码登录、消息收发、账户管理等功能，进一步丰富了 OpenClaw 的消息通道生态系统。

**更新总结** 重大增强的核心改进：

### Windows 打包系统

1. **全新打包脚本**：新增 package-electron-win.sh，支持在 macOS/Linux 上交叉编译 Windows 版本
2. **Makefile 增强**：新增 Windows 打包目标和命令，统一构建流程
3. **平台特定配置**：electron-builder.yml 更新以支持 Windows 平台设置
4. **Node.js 运行时**：改进的跨平台 Node 二进制下载和管理
5. **资源处理优化**：区分 Windows 的 node.exe 可执行文件
6. **安装程序支持**：使用 NSIS 创建安装包和桌面快捷方式
7. **URL Scheme 配置**：支持 openclaw:// 协议回调

### WeChat 扩展集成

1. **官方扩展支持**：新增 openclaw-weixin 扩展，由 @tencent-weixin 组织提供
2. **二维码登录功能**：完整的微信登录流程，包括二维码生成和扫描
3. **消息处理能力**：支持微信消息的接收、发送和处理
4. **账户管理**：支持多微信账户的配置和管理
5. **UI 集成**：完整的 React 控制界面支持微信配置和登录
6. **配置管理**：基于 Zod 的类型安全配置系统
7. **腾讯技术支持**：官方支持和维护

### 跨平台打包统一

1. **统一脚本设计**：macOS 和 Windows 使用相似的打包逻辑
2. **环境变量驱动**：通过 ARCH 环境变量控制目标架构
3. **平台特定优化**：针对不同平台优化资源和依赖配置
4. **Makefile 支port**：完整的构建命令和目标配置
5. **快速模式支持**：支持跳过构建步骤的快速验证流程

### 自动化签名和公证

1. **自动公证流程**：通过 `notarize.cjs` 实现签名后的自动公证
2. **环境变量管理**：完善的 API Key 和证书配置支持
3. **错误处理机制**：全面的错误检测和用户提示
4. **传统公证支持**：保留手动公证选项和脚本

### 完整的构建指南

1. **详细文档**：`BUILDING.md` 提供完整的构建和部署指导
2. **命令行工具**：Makefile 命令简化常见操作
3. **环境配置**：清晰的环境变量和证书配置说明
4. **故障排除**：全面的问题诊断和解决指南

**核心改进亮点**：

1. **Windows 打包支持**：新增 package-electron-win.sh 脚本，支持在 macOS/Linux 上交叉编译 Windows 版本
2. **Makefile 增强**：新增 Windows 打包目标和命令，统一构建流程
3. **electron-builder 配置更新**：支持 Windows 平台特定配置和资源处理
4. **WeChat 扩展支持**：新增微信消息通道，支持二维码登录和消息收发
5. **跨平台兼容性**：从单一平台发展为完整的多平台支持
6. **自动化程度大幅提升**：从手动配置转向完全自动化的打包流程
7. **版本控制更加精确**：通过多种源解析确保依赖版本的一致性
8. **部署灵活性增强**：支持本地快速测试和生产发布的不同需求

**技术架构优势**：

**Windows 打包系统**：
- **交叉编译支持**：在 macOS/Linux 上构建 Windows 版本
- **统一配置**：通过 electron-builder.yml 管理平台差异
- **资源优化**：针对 Windows 平台裁剪不必要的资源
- **安装程序**：使用 NSIS 创建标准的 Windows 安装包

**WeChat 扩展系统**：
- **官方支持**：由腾讯官方 @tencent-weixin 组织提供
- **类型安全**：基于 Zod 的完整类型定义和验证
- **二维码生成**：基于 qrcode-terminal 的高效二维码生成
- **消息处理**：完整的微信消息收发和处理能力
- **账户管理**：支持多微信账户的配置和管理
- **UI 集成**：完整的 React 组件支持

**跨平台打包系统**：
- **统一脚本**：macOS 和 Windows 使用相似的打包逻辑
- **平台特定配置**：通过 electron-builder.yml 管理平台差异
- **资源优化**：针对不同平台裁剪不必要的资源
- **架构感知**：根据目标架构自动调整依赖和配置

**自动化签名系统**：
- **环境变量驱动**：通过环境变量配置 API Key 和证书
- **自动处理**：支持从文件路径或直接内容获取密钥
- **错误恢复**：完善的错误检测和用户友好的提示
- **传统支持**：保留手动公证选项作为后备方案

**构建指南系统**：
- **命令标准化**：通过 Makefile 统一构建命令
- **步骤清晰化**：从设置到验证的完整流程指导
- **问题预防**：提前识别和解决常见问题
- **最佳实践**：推荐的配置和部署方式

**品牌管理集成**：
- **配置集中化**：所有品牌相关信息集中在 electron-builder.yml 中
- **向后兼容性**：OAuth URL Scheme 保持 'openclaw' 以确保兼容性
- **一致性保证**：应用ID、产品名称、版权信息完全统一

该配置为桌面应用开发提供了完整的参考模板，涵盖了从打包配置到运行时管理的各个方面。通过持续的优化和维护，该系统能够为用户提供稳定可靠的桌面应用体验。

**新增功能的技术价值**：
- **Windows 打包**：支持在 macOS/Linux 上构建 Windows 版本，扩大部署范围
- **开发效率提升**：跨平台打包减少重复工作，统一构建流程
- **部署可靠性增强**：自动化的签名和公证流程，支持 Windows 平台
- **维护成本降低**：统一的构建和配置管理，支持多平台
- **用户体验改善**：更快的启动速度和更稳定的运行表现
- **跨平台兼容性**：支持 macOS、Windows、Linux 多个平台
- **品牌管理优化**：统一的品牌标识提升专业度
- **消息通道多样化**：支持超过 25 种不同的消息通道

这一改进体现了现代软件工程中"约定优于配置"的设计理念，通过智能化的默认行为减少了开发者的配置负担，同时保持了系统的灵活性和可扩展性。

**运行时依赖配置列表**：
- **不能内联的依赖**：electron、sharp、playwright-core、sqlite-vec、opusscript、@lydell/node-pty、@napi-rs/canvas、node-llama-cpp、koffi、@matrix-org/matrix-sdk-crypto-nodejs、@whiskeysockets/baileys、esbuild、jiti
- **核心运行时依赖**：包含 openclaw CLI 和 Gateway 所需的 70+ 个核心依赖
- **额外运行时依赖**：koffi、@matrix-org/matrix-sdk-crypto-nodejs、esbuild、jiti 等必须真实安装的依赖
- **预装扩展**：memory-core、device-pair、qwen-portal-auth、minimax-portal-auth、google-gemini-cli-auth、copilot-proxy、telegram、discord、slack、signal、whatsapp、imessage、matrix、msteams、feishu、googlechat、irc、line、mattermost、nextcloud-talk、nostr、synology-chat、twitch、zalo、zalouser、voice-call、talk-voice、phone-control、acpx、bluebubbles、openclaw-weixin
- **WeChat 扩展依赖**：qrcode-terminal、zod、silk-wasm 等微信扩展专用依赖
- **Windows 打包依赖**：NSIS 安装程序、Windows 资源处理、Node.exe 可执行文件

这些配置的自动化管理确保用户在安装时即可获得完整的 Bossim 功能体验，无需额外配置即可使用核心 AI 模型认证和多种消息通道，同时为开发者提供了灵活的部署和调试选项。Windows 打包系统的加入进一步增强了 OpenClaw 的跨平台支持和用户覆盖能力。