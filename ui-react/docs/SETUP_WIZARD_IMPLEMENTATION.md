# Setup Wizard 集成实施完成总结

## ✅ 已完成的实施步骤

### 1. 创建 ui-react Setup 入口文件

**文件：`ui-react/setup.html`**

- 新增 HTML 入口页面
- 加载 `/src/setup.tsx` 脚本
- 与 `index.html` 结构一致

**文件：`ui-react/src/setup.tsx`**

- 新增 TypeScript 入口脚本
- 导入 `SetupWizard` 组件
- 挂载到 `#root` DOM 元素

### 2. 配置 ui-react 多入口构建

**文件：`ui-react/vite.config.ts`**

- 添加 `rollupOptions.input` 配置
  - `main`: `index.html` (Control UI)
  - `setup`: `setup.html` (Setup Wizard)
- 配置输出文件名规则
  - `entryFileNames`: `[name].js`
  - `chunkFileNames`: `chunks/[name].js`
  - `assetFileNames`: `assets/[name].[ext]`

### 3. 更新 Electron 主进程加载逻辑

**文件：`apps/electron/src/main/index.ts`**

- 改变首次启动时的加载页面
- 从 `loadRendererPage(mainWindow, "onboarding")`
- 改为 `loadRendererPage(mainWindow, "setup")`
- 保留 `registerWizardIpc()` 调用

### 4. 增强 Electron 窗口管理

**文件：`apps/electron/src/main/window.ts`**

**新增环境变量支持：**

- `VITE_UI_REACT_URL`: ui-react dev server URL（默认 `http://localhost:5174`）

**更新 `resolveRendererUrl()` 函数：**

- 特殊处理 `setup` 页面
- 开发时：从 `VITE_UI_REACT_URL` 加载
- 生产时：从 `Resources/control-ui-react/setup.html` 加载
- 其他页面：保持原有逻辑

**更新 `configureSession()` 函数：**

- 支持两个 Vite dev server origins
- 允许 `localhost:5173` (Electron renderer)
- 允许 `localhost:5174` (ui-react)
- 更新 CSP 策略以支持两个源

### 5. 更新 Electron 构建配置

**文件：`apps/electron/electron-builder.yml`**

- 新增 `extraResources` 条目
- 从 `../../dist/control-ui-react` 复制到 `control-ui-react`
- 包含 Setup Wizard 的所有构建产物

### 6. 创建集成指南文档

**文件：`SETUP_WIZARD_INTEGRATION.md`**

- 开发流程说明
- 生产构建步骤
- 文件结构说明
- 测试指南
- 迁移清单

## 📊 架构变化

### 之前（方案 A）

```
Electron Main
    ↓
isFirstLaunch()
    ├─ YES → apps/electron/renderer/src/onboarding/
    │         (轻量级 CSS-in-JS)
    │
    └─ NO → Gateway Control UI
```

### 现在（方案 B）

```
Electron Main
    ↓
isFirstLaunch()
    ├─ YES → ui-react/src/setup.tsx
    │         (完整 React + shadcn/ui)
    │
    └─ NO → Gateway Control UI
```

## 🔧 关键配置变更

### 环境变量

**开发时需要设置：**

```bash
VITE_DEV_SERVER_URL=http://localhost:5173      # Electron renderer (可选)
VITE_UI_REACT_URL=http://localhost:5174        # ui-react Setup Wizard
```

**Electron 启动命令：**

```bash
VITE_UI_REACT_URL=http://localhost:5174 pnpm electron:dev
```

### 构建产物

**ui-react 构建输出：**

```
dist/control-ui-react/
├── main.js              # Control UI 入口
├── setup.js             # Setup Wizard 入口 ✨
├── chunks/
│   ├── setup-wizard.*.js
│   └── ...
└── assets/
    └── ...
```

**Electron 打包资源：**

```
Resources/
├── control-ui/          # 原有 Control UI
├── control-ui-react/    # ✨ 新增 ui-react 产物
└── renderer/            # Electron 专属页面
```

## 🚀 开发工作流

### 启动开发环境

**终端 1：启动 ui-react dev server**

```bash
cd ui-react
pnpm dev
# 输出：http://localhost:5174/
```

**终端 2：启动 Electron**

```bash
cd apps/electron
VITE_UI_REACT_URL=http://localhost:5174 pnpm dev
```

### 工作流程

1. Electron 启动 → 检测首次启动
2. 加载 `http://localhost:5174/setup.html`
3. 用户完成 Setup Wizard
4. 自动切换到 Control UI
5. 修改代码 → Vite HMR 自动刷新

## 📦 生产构建

### 构建步骤

```bash
# 1. 构建 ui-react（包括 setup 和 main 入口）
pnpm ui:react:build

# 2. 构建 Electron
cd apps/electron
pnpm build

# 3. 打包应用
pnpm package:mac
```

### 验证构建产物

```bash
# 检查 ui-react 构建输出
ls -la dist/control-ui-react/
# 应该包含：main.js, setup.js, chunks/, assets/

# 检查 Electron 打包资源
ls -la apps/electron/release/
# 应该包含 OpenClaw-*.dmg
```

## ⚠️ 重要注意事项

### 1. 依赖关系

- ui-react 必须先构建
- Electron 构建时会复制 ui-react 产物
- 生产环境中 setup.js 和 main.js 都会被打包

### 2. 首次启动检测

首次启动的判断逻辑保持不变：

- 检查 `~/.openclaw/config.json` 是否存在
- 检查是否已配置 gateway 信息
- 详见 `apps/electron/src/main/onboarding.ts`

### 3. IPC 通信

- Setup Wizard 通过 IPC 与 Electron 主进程通信
- 主进程通过 WebSocket 与 Gateway 通信
- 详见 `apps/electron/src/main/ipc-wizard.ts`

### 4. 可选清理

以下文件可以删除（已被 ui-react 替代）：

```bash
rm -rf apps/electron/renderer/src/onboarding/
rm apps/electron/renderer/onboarding.html
```

但建议先完全测试后再删除。

## 🧪 测试清单

- [ ] 开发环境启动成功
- [ ] Setup Wizard 页面加载正常
- [ ] 完成 Setup Wizard 流程
- [ ] 自动切换到 Control UI
- [ ] 配置文件正确保存
- [ ] 生产构建成功
- [ ] 打包的应用可以正常运行
- [ ] 首次启动显示 Setup Wizard
- [ ] 再次启动直接进入 Control UI

## 📝 后续任务

### 立即可做

1. 测试开发环境
2. 测试生产构建
3. 验证首次启动流程

### 可选优化

1. 删除 Electron onboarding 代码
2. 优化代码分割
3. 减少包体积
4. 更新 CI/CD 流程

### 文档更新

1. 更新开发指南
2. 更新构建指南
3. 更新贡献指南

## 📚 相关文件清单

### 已修改

- ✅ `ui-react/vite.config.ts`
- ✅ `ui-react/setup.html` (新增)
- ✅ `ui-react/src/setup.tsx` (新增)
- ✅ `apps/electron/src/main/index.ts`
- ✅ `apps/electron/src/main/window.ts`
- ✅ `apps/electron/electron-builder.yml`

### 已创建

- ✅ `SETUP_WIZARD_ARCHITECTURE.md` (架构分析)
- ✅ `SETUP_WIZARD_INTEGRATION.md` (集成指南)
- ✅ `SETUP_WIZARD_IMPLEMENTATION.md` (本文件)

### 保持不变

- `apps/electron/src/main/onboarding.ts` (首次启动检测)
- `apps/electron/src/main/ipc-wizard.ts` (IPC 中转)
- `src/wizard/` (Backend 逻辑)
- `ui-react/src/components/setup-wizard/` (Setup Wizard 组件)

## 🎯 实施完成度

| 任务                   | 状态 | 备注                     |
| ---------------------- | ---- | ------------------------ |
| 创建 setup.html        | ✅   | 完成                     |
| 创建 setup.tsx         | ✅   | 完成                     |
| 更新 vite.config.ts    | ✅   | 支持多入口               |
| 更新 Electron 加载逻辑 | ✅   | 加载 setup 页面          |
| 增强窗口管理           | ✅   | 支持 ui-react dev server |
| 更新构建配置           | ✅   | 包含 control-ui-react    |
| 创建文档               | ✅   | 架构 + 集成 + 实施       |
| 测试开发环境           | ⏳   | 待执行                   |
| 测试生产构建           | ⏳   | 待执行                   |
| 清理代码               | ⏳   | 可选                     |

## 🚀 下一步

1. **立即测试**：按照 `SETUP_WIZARD_INTEGRATION.md` 启动开发环境
2. **验证流程**：完整测试首次启动到完成的全流程
3. **生产验证**：构建并测试最终应用包
4. **代码清理**：删除不再使用的 Electron onboarding 代码（可选）
5. **文档更新**：更新项目文档和贡献指南
