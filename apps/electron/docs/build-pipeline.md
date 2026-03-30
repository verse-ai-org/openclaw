# Electron 打包流程详解

本文档描述从源码到最终安装包的完整构建流水线，包括每个阶段的职责、产物和关键细节。

---

## 整体流程图

```
源码
  │
  ├─ [1] pnpm build            → dist/  (openclaw CLI + gateway)
  ├─ [2] ui:build              → src/infra/control-ui/build/
  ├─ [2b] ui-react build       → apps/electron/resources/ui-react/
  │
  ├─ [3] download-node.sh      → resources/node-<arch>/node
  ├─ [3b] generate-runtime-package.mjs
  │        + pnpm install      → resources/prod-node_modules/node_modules/
  ├─ [3c] prune koffi          → 仅保留目标架构的原生二进制
  │
  ├─ [4] tsdown (Electron)     → dist/main/index.cjs  (Electron 主进程)
  │
  └─ [5] electron-builder      → release/mac-<arch>/Bossim.app
                                   release/Bossim-<ver>.dmg
```

---

## 各阶段详解

### 阶段 1：构建 openclaw CLI（`pnpm build`）

**脚本**：`tsdown.config.ts`（仓库根目录）

**产物**：`dist/`

- `dist/index.js` — CLI 主入口（固定文件名，未哈希）
- `dist/entry.js` — gateway 入口（固定文件名）
- `dist/plugin-sdk/<name>-<hash>.js` — 各插件 SDK 入口（**带内容哈希**）
- `dist/plugin-sdk/root-alias.cjs` — jiti 别名解析器（固定文件名）

> **哈希命名规则**：`tsdown.config.ts` 的 `entryFileNames` 规则规定，除 `index`、`entry`、`warning-filter` 外，所有产物均使用 `[name]-[hash].js` 格式，因此 `device-pair.ts` 会编译为 `device-pair-DZdPL6gL.js`。

### 阶段 2 & 2b：构建 UI

**脚本**：`scripts/ui.js build` + `pnpm --filter openclaw-control-ui-react build`

- Control UI（传统）：内嵌 HTML/CSS/JS，供 Electron webview 加载
- React Control UI：Vite 构建，输出到 `apps/electron/resources/` 下，electron-builder 打包时一并内嵌

### 阶段 3：下载 Node 二进制（`download-node.sh`）

**脚本**：`apps/electron/scripts/download-node.sh <arch>`

- 从 nodejs.org 下载 Node 24 官方预编译二进制（`node-v24.x.x-darwin-<arch>.tar.gz`）
- 仅提取 `bin/node`，保存到 `resources/node-<arch>/node`
- **已存在则跳过**，避免重复下载
- gateway 在 Electron 包内运行时，Electron 主进程用这个 Node 二进制 `spawn` gateway 子进程

### 阶段 3b：生成运行时 `package.json` + 安装依赖

**脚本**：`apps/electron/scripts/generate-runtime-package.mjs`

**为什么不直接用 `pnpm deploy`？**

`pnpm deploy` 会把整个 workspace 的依赖（包括 `extensions/tlon` 等带 git URL 的包）全部打入，体积大且不可控。改用 `packaged-runtime.json` 显式声明两类依赖：

| 字段 | 含义 |
|------|------|
| `coreRuntimeDependencies` | openclaw CLI/gateway 必须的最小核心依赖 |
| `runtimeDependencies` | 额外需要真实安装（不能只靠 bundle）的依赖，如原生模块 |

`generate-runtime-package.mjs` 从根 `package.json` + 已安装的 `node_modules` + `pnpm-lock.yaml` 三处解析版本号，生成 `resources/prod-node_modules/package.json`，再 `pnpm install --prod` 安装到 `resources/prod-node_modules/node_modules/`。

### 阶段 3c：裁剪 koffi 多平台二进制

koffi（FFI 库）在安装后会包含所有平台的预编译 `.node`，打包前只保留目标架构（`darwin_arm64` 或 `darwin_x64`），减小安装包体积。

### 阶段 4：构建 Electron 主进程

**配置**：`apps/electron/tsdown.config.electron.ts`

**产物**：`apps/electron/dist/main/index.cjs`

Electron 主进程是 CommonJS 模块（`"type": "commonjs"`），负责：
- 创建 BrowserWindow（加载 Control UI）
- spawn/管理 gateway 子进程（使用 `resources/node-<arch>/node`）
- IPC 通信（wizard、OAuth、onboarding 等）

### 阶段 5：electron-builder 打包

**配置**：`apps/electron/electron-builder.yml`

electron-builder 将以下内容打入 `.app` 包：

```
Bossim.app/
  Contents/
    MacOS/Bossim              ← Electron 可执行文件
    Resources/
      app/                    ← Electron 主进程 (dist/main/index.cjs)
      openclaw/               ← openclaw 核心 (dist/ + plugin-sdk/)
      node-<arch>/node        ← 内嵌 Node 24 二进制
      prod-node_modules/      ← 运行时 node_modules
      ui-react/               ← React Control UI 静态资源
```

**签名与公证**（正式打包）：
- `codesign --deep` 对 `.app` 进行开发者签名
- `@electron/notarize` 提交到 Apple 公证服务，等待 staple
- 需要 `.env` 中配置 `APP_STORE_CONNECT_*` 变量

**快速打包**（`LOCAL_FAST=1`）：
- 跳过构建（`SKIP_BUILD=1`）和依赖安装（`REUSE_RUNTIME_DEPS=1`）
- `--config.mac.identity=null --config.mac.hardenedRuntime=false` 跳过签名
- 生成可安装的 `.dmg`，macOS 会弹"无法验证开发者"，右键打开可绕过

---

## 命令速查

| 命令 | 场景 |
|------|------|
| `make dev` | 本地开发，热重载 |
| `make build` | 仅构建所有产物（不打包） |
| `make package-fast` | 本地验证安装流程，无需证书 |
| `make package` | 正式签名 + 公证打包（当前架构） |
| `make package-arm64` | 强制 Apple Silicon |
| `make package-x64` | 强制 Intel |
| `make package-win` | Windows 交叉编译 |
| `make clean-all` | 清理产物 + 下载的 Node 二进制 |
| `make verify` | 验证签名和公证状态 |

---

## 关键文件索引

| 文件 | 作用 |
|------|------|
| `apps/electron/scripts/package-electron.sh` | macOS 打包主脚本，串联所有阶段 |
| `apps/electron/scripts/download-node.sh` | 下载 Node 24 二进制 |
| `apps/electron/scripts/generate-runtime-package.mjs` | 生成运行时 package.json |
| `apps/electron/scripts/notarize.cjs` | electron-builder 公证钩子 |
| `apps/electron/packaged-runtime.json` | 声明打包内嵌的运行时依赖白名单 |
| `apps/electron/electron-builder.yml` | electron-builder 完整配置 |
| `apps/electron/tsdown.config.electron.ts` | Electron 主进程构建配置 |
| `tsdown.config.ts`（根目录）| openclaw CLI / plugin-sdk 构建配置 |
