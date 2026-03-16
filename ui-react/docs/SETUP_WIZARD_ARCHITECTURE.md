# Setup Wizard 架构分析与建议

## 📋 当前状态

### 现有实现

1. **ui-react 中的 Setup Wizard**（React 组件）
   - 位置：`ui-react/src/components/setup-wizard/`
   - 特点：完整的 React 组件库，使用 shadcn/ui，支持深色/浅色主题
   - 状态：已完成 UI 设计和组件实现

2. **electron 中的 Onboarding**（原生 Electron 实现）
   - 位置：`apps/electron/renderer/src/onboarding/`
   - 特点：轻量级 CSS-in-JS，直接与 Gateway 通信
   - 状态：已完成基础功能

3. **Backend Wizard 逻辑**（src/wizard/）
   - 位置：`src/wizard/`
   - 特点：完整的 wizard session 管理、步骤定义、验证逻辑
   - 状态：已完成核心业务逻辑

## 🏗️ 架构对比分析

### 方案 A：保持现状（UI 分离）

**流程图：**

```
Electron Main
    ↓
首次启动检测 (isFirstLaunch)
    ├─ YES → 加载 Electron Onboarding
    │         ↓
    │         Gateway WebSocket RPC
    │         ↓
    │         Backend Wizard Logic
    │         ↓
    │         完成 → 切换到 Control UI
    │
    └─ NO → 直接加载 Control UI
```

**优点：**

- ✅ 职责清晰：Electron 负责窗口/IPC，React 负责 UI，Backend 负责逻辑
- ✅ 可复用性强：ui-react 可用于 Web、Tauri 等其他平台
- ✅ 开发效率高：React 开发体验好，支持热更新
- ✅ 测试友好：UI 和逻辑分离，易于单元测试

**缺点：**

- ❌ 维护两套 UI：Electron onboarding 和 ui-react setup-wizard
- ❌ 代码重复：步骤定义、验证逻辑可能重复
- ❌ 一致性风险：两套 UI 可能不同步
- ❌ 浪费工作：ui-react setup-wizard 未被使用

### 方案 B：统一使用 ui-react（推荐）

**流程图：**

```
Electron Main
    ↓
首次启动检测 (isFirstLaunch)
    ├─ YES → 加载 ui-react Setup Wizard
    │         ↓
    │         Gateway WebSocket RPC
    │         ↓
    │         Backend Wizard Logic
    │         ↓
    │         完成 → 切换到 Control UI
    │
    └─ NO → 直接加载 Control UI
```

**优点：**

- ✅ 单一真实来源：只维护一套 UI
- ✅ 一致性保证：所有平台使用相同 UI
- ✅ 代码复用：共享组件、样式、逻辑
- ✅ 易于维护：修改一处，所有平台受益
- ✅ 更好的 UX：使用完整的 shadcn/ui 设计系统
- ✅ 充分利用已有工作：ui-react setup-wizard 得到使用

**缺点：**

- ❌ Electron 需要加载 React（包体积增加 ~500KB）
- ❌ 开发时需要 Vite dev server

### 方案 C：混合方案（Electron 使用 ui-react，Web 使用 Gateway UI）

```
Electron:
  首次启动 → ui-react Setup Wizard → Control UI

Web:
  首次访问 → Gateway 内置 Setup Wizard → Dashboard
```

**优点：**

- ✅ Electron 获得完整的 UI 体验
- ✅ Web 保持轻量级

**缺点：**

- ❌ 需要维护两套 UI
- ❌ 一致性难以保证

## 🎯 推荐方案：方案 B（统一使用 ui-react）

### 核心理由

1. **用户体验一致**
   - Electron 和 Web 使用相同的 Setup Wizard
   - 品牌一致性强
   - 用户学习成本低

2. **开发效率高**
   - 只维护一套代码
   - React 开发体验优于原生 CSS
   - 支持热更新，开发速度快
   - 充分利用已有的 ui-react setup-wizard 工作

3. **长期成本低**
   - 减少维护负担
   - 降低 bug 风险
   - 易于扩展新功能
   - 避免代码重复

4. **技术债务少**
   - 避免维护两套 UI
   - 清晰的职责划分
   - 减少同步问题

### 成本分析

| 指标         | 方案 A | 方案 B | 方案 C |
| ------------ | ------ | ------ | ------ |
| 维护代码行数 | 高     | 低     | 中     |
| 包体积增加   | 0      | ~500KB | ~500KB |
| 一致性风险   | 高     | 低     | 高     |
| 开发效率     | 中     | 高     | 中     |
| 长期成本     | 高     | 低     | 中     |

## 🔧 实施步骤

### 第一步：配置 ui-react 多入口构建

编辑 `ui-react/vite.config.ts`：

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        setup: path.resolve(__dirname, "setup.html"), // 新增
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
  },
});
```

### 第二步：创建 setup.html 入口

创建 `ui-react/setup.html`：

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OpenClaw Setup</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/setup.tsx"></script>
  </body>
</html>
```

### 第三步：创建 setup.tsx 入口

创建 `ui-react/src/setup.tsx`：

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import { SetupWizard } from '@/components/setup-wizard'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SetupWizard />
  </React.StrictMode>,
)
```

### 第四步：更新 Electron 加载逻辑

编辑 `apps/electron/src/main/index.ts`：

```typescript
if (isFirstLaunch()) {
  // 改为加载 ui-react 的 setup 页面
  console.log("[main] 首次启动，加载 Setup Wizard");
  registerWizardIpc(GATEWAY_PORT, sessionToken);
  loadRendererPage(mainWindow, "setup"); // 改这里
} else {
  // 已配置：直接加载 Gateway Control UI
  loadGatewayUI(mainWindow, { port: GATEWAY_PORT, token: sessionToken });
}
```

### 第五步：更新 Electron 构建配置

编辑 `apps/electron/electron-builder.yml`：

```yaml
files:
  - from: ../ui-react/dist
    to: renderer
    filter:
      - "**/*"
  - from: src
    to: dist/main
  - from: preload
    to: dist/preload
```

### 第六步：删除 Electron 中的 onboarding（可选）

```bash
rm -rf apps/electron/renderer/src/onboarding
rm apps/electron/renderer/onboarding.html
```

## 📊 文件结构对比

### 当前结构

```
ui-react/
├── src/
│   ├── components/setup-wizard/    ← 新增，未使用
│   ├── pages/
│   └── App.tsx
├── index.html
└── vite.config.ts

apps/electron/
├── renderer/
│   ├── src/onboarding/             ← 现有，已使用
│   ├── onboarding.html
│   └── vite.config.ts
├── src/main/
│   ├── onboarding.ts
│   └── ipc-wizard.ts
└── electron-builder.yml
```

### 推荐结构

```
ui-react/
├── src/
│   ├── components/setup-wizard/    ← 使用
│   ├── pages/
│   ├── App.tsx
│   └── setup.tsx                   ← 新增
├── index.html
├── setup.html                      ← 新增
└── vite.config.ts                  ← 更新

apps/electron/
├── renderer/
│   ├── src/                        ← onboarding 删除
│   └── vite.config.ts
├── src/main/
│   ├── onboarding.ts               ← 保留（首次启动检测）
│   └── ipc-wizard.ts               ← 保留（IPC 中转）
└── electron-builder.yml            ← 更新
```

## 🔄 迁移路径

### 阶段 1：准备（当前）

- ✅ ui-react 中的 Setup Wizard 已完成
- ✅ Backend wizard 逻辑已完成
- ✅ Electron IPC 中转已完成

### 阶段 2：集成（下一步）

- [ ] 配置 ui-react 多入口构建
- [ ] 创建 setup.html 和 setup.tsx
- [ ] 更新 Electron 加载逻辑
- [ ] 测试 Electron 中的 Setup Wizard

### 阶段 3：清理（可选）

- [ ] 删除 Electron onboarding 代码
- [ ] 更新 Electron 构建配置
- [ ] 更新文档

## ⚠️ 注意事项

### 包体积

- ui-react 包含 React、shadcn/ui 等依赖
- 预计增加 ~500KB（gzip 后 ~150KB）
- 可接受的权衡，换取更好的 UX 和开发效率

### 开发体验

- 需要 Vite dev server 支持热更新
- 已在 `apps/electron/src/main/window.ts` 中配置 `VITE_DEV_SERVER_URL`
- 开发时运行 `pnpm ui:react:dev` 即可

### 性能

- Setup Wizard 只在首次启动时加载
- 不影响主应用性能
- 可考虑代码分割优化

## 🚀 下一步行动

1. **确认方案**：与团队确认采用方案 B
2. **实施集成**：按照"实施步骤"逐步集成
3. **测试验证**：在 Electron 中测试 Setup Wizard
4. **文档更新**：更新开发文档和构建指南
5. **清理代码**：删除冗余的 onboarding 代码

## 📚 相关文件

- Backend Wizard：`src/wizard/`
- Electron 主进程：`apps/electron/src/main/`
- ui-react Setup Wizard：`ui-react/src/components/setup-wizard/`
- Electron 窗口管理：`apps/electron/src/main/window.ts`
- Electron IPC：`apps/electron/src/main/ipc-wizard.ts`
- Electron Onboarding：`apps/electron/renderer/src/onboarding/`
