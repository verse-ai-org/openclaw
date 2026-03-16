# Setup Wizard 集成指南

## 🚀 开发流程

### 方案 B 已实施完成

Setup Wizard 现已从 `ui-react` 统一管理，Electron 在首次启动时加载 ui-react 的 Setup Wizard。

### 开发时启动

#### 终端 1：启动 ui-react dev server

```bash
cd ui-react
pnpm dev
# 或使用根目录命令
pnpm ui:react:dev
```

输出示例：

```
  VITE v7.3.1  ready in 294 ms

  ➜  Local:   http://localhost:5174/
  ➜  Network: http://192.168.1.101:5174/
```

#### 终端 2：启动 Electron（开发模式）

```bash
cd apps/electron
VITE_DEV_SERVER_URL=http://localhost:5173 \
VITE_UI_REACT_URL=http://localhost:5174 \
pnpm dev
```

或使用根目录命令：

```bash
VITE_UI_REACT_URL=http://localhost:5174 pnpm electron:dev
```

### 工作流

1. **首次启动**：Electron 检测到未配置，加载 `http://localhost:5174/setup.html`
2. **Setup Wizard**：用户完成配置流程
3. **完成后**：自动切换到 Control UI（`http://127.0.0.1:18790`）

### 热更新

- 修改 `ui-react/src/components/setup-wizard/**` 中的代码
- 浏览器自动刷新（Vite HMR）
- 无需重启 Electron

## 📦 生产构建

### 构建流程

```bash
# 1. 构建 ui-react（包括 setup 入口）
pnpm ui:react:build

# 2. 构建 Electron
cd apps/electron
pnpm build

# 3. 打包 DMG（macOS）
pnpm package:mac
```

### 构建输出

- `dist/control-ui-react/setup.js` - Setup Wizard 入口
- `dist/control-ui-react/main.js` - Control UI 入口
- `dist/control-ui-react/chunks/` - 代码分割产物
- `release/OpenClaw-*.dmg` - 最终应用包

## 🔧 文件结构

### ui-react

```
ui-react/
├── index.html              # Control UI 入口
├── setup.html              # Setup Wizard 入口 ✨ 新增
├── src/
│   ├── main.tsx            # Control UI 入口脚本
│   ├── setup.tsx           # Setup Wizard 入口脚本 ✨ 新增
│   ├── components/
│   │   └── setup-wizard/   # Setup Wizard 组件
│   └── ...
└── vite.config.ts          # 多入口配置 ✨ 已更新
```

### Electron

```
apps/electron/
├── src/main/
│   ├── index.ts            # 加载 setup 页面 ✨ 已更新
│   ├── window.ts           # 支持 ui-react dev server ✨ 已更新
│   ├── onboarding.ts       # 首次启动检测（保留）
│   └── ipc-wizard.ts       # IPC 中转（保留）
├── renderer/
│   ├── src/onboarding/     # ⚠️ 可删除（已被 ui-react 替代）
│   └── ...
├── electron-builder.yml    # 包含 control-ui-react ✨ 已更新
└── ...
```

## ⚠️ 注意事项

### 环境变量

开发时需要设置两个 Vite dev server URL：

```bash
# Electron onboarding（如果还在使用）
VITE_DEV_SERVER_URL=http://localhost:5173

# ui-react Setup Wizard
VITE_UI_REACT_URL=http://localhost:5174
```

### 端口配置

- `5173` - Electron renderer dev server（如果使用）
- `5174` - ui-react dev server（Setup Wizard）
- `18790` - Electron Gateway 端口

### 首次启动检测

首次启动的判断逻辑在 `apps/electron/src/main/onboarding.ts` 中：

```typescript
export function isFirstLaunch(): boolean {
  // 检查 ~/.openclaw/config.json
  // 如果不存在或未配置，返回 true
}
```

## 🧪 测试

### 测试首次启动流程

1. 删除 `~/.openclaw/config.json`
2. 启动 Electron
3. 应该看到 Setup Wizard

### 测试完成后的切换

1. 完成 Setup Wizard
2. 应该自动切换到 Control UI
3. 检查 `~/.openclaw/config.json` 是否已保存配置

## 📝 迁移清单

- [x] 创建 `ui-react/setup.html`
- [x] 创建 `ui-react/src/setup.tsx`
- [x] 更新 `ui-react/vite.config.ts` 支持多入口
- [x] 更新 `apps/electron/src/main/index.ts` 加载 setup 页面
- [x] 更新 `apps/electron/src/main/window.ts` 支持 ui-react dev server
- [x] 更新 `apps/electron/electron-builder.yml` 包含 control-ui-react
- [ ] 删除 `apps/electron/renderer/src/onboarding/`（可选）
- [ ] 删除 `apps/electron/renderer/onboarding.html`（可选）
- [ ] 更新文档

## 🚀 下一步

1. **测试开发流程**：按照上述步骤启动开发环境
2. **测试生产构建**：构建并测试最终应用包
3. **清理代码**：删除不再使用的 Electron onboarding 代码
4. **更新 CI/CD**：确保构建流程包含 ui-react 构建步骤
