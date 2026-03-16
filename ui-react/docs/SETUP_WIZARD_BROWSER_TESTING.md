# Setup Wizard 浏览器测试指南

## 🌐 浏览器测试 vs Electron 测试

### 浏览器测试（推荐先做）

- ✅ 快速迭代，支持 HMR 热更新
- ✅ 无需启动 Electron
- ✅ 调试工具完整（DevTools）
- ✅ 可以快速验证 UI 和交互
- ❌ 无法测试 IPC 通信
- ❌ 无法测试 Electron 特定功能

### Electron 测试（最后验证）

- ✅ 完整的端到端测试
- ✅ 验证 IPC 通信
- ✅ 验证首次启动检测
- ✅ 验证配置文件保存
- ❌ 开发迭代较慢
- ❌ 调试相对复杂

## 🚀 浏览器测试方案

### 方案 1：直接访问 setup.html（推荐）

#### 步骤 1：启动 ui-react dev server

```bash
cd ui-react
pnpm dev
```

输出：

```
  VITE v7.3.1  ready in 294 ms

  ➜  Local:   http://localhost:5174/
  ➜  Network: http://192.168.1.101:5174/
```

#### 步骤 2：在浏览器中打开 Setup Wizard

```
http://localhost:5174/setup.html
```

#### 步骤 3：测试 Setup Wizard 流程

现在你可以在浏览器中看到 Setup Wizard，但会遇到一个问题：

**问题**：Setup Wizard 需要通过 IPC 与 Electron 通信，但在浏览器中没有 IPC。

**解决方案**：创建一个 Mock IPC 层，模拟 Electron 的行为。

### 方案 2：创建 Mock IPC 层（完整测试）

#### 步骤 1：创建 Mock 文件

创建 `ui-react/src/setup-mock.tsx`：

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { SetupWizard } from '@/components/setup-wizard';
import '@/index.css';

// Mock Electron Bridge for browser testing
const mockElectronBridge = {
  wizardRequest: async (method: string, params: unknown) => {
    console.log(`[Mock IPC] ${method}`, params);

    // Simulate wizard.start
    if (method === 'wizard.start') {
      return {
        sessionId: 'mock-session-123',
        done: false,
        step: {
          id: 'welcome',
          title: 'Welcome to OpenClaw',
          subtitle: 'Let\'s set up your AI assistant',
          type: 'text',
          options: [],
        },
        status: 'running',
      };
    }

    // Simulate wizard.next
    if (method === 'wizard.next') {
      const answer = (params as any)?.answer;
      console.log('[Mock IPC] User answered:', answer);

      // Simulate step progression
      const steps = [
        {
          id: 'welcome',
          title: 'Welcome to OpenClaw',
          subtitle: 'Let\'s set up your AI assistant',
          type: 'text',
        },
        {
          id: 'security',
          title: 'Security Confirmation',
          subtitle: 'Confirm you understand the security implications',
          type: 'checkbox',
          options: [
            { id: 'understand', label: 'I understand the security implications' },
          ],
        },
        {
          id: 'model',
          title: 'Select AI Model',
          subtitle: 'Choose your preferred AI model',
          type: 'select',
          options: [
            { id: 'gpt4', label: 'GPT-4' },
            { id: 'claude', label: 'Claude' },
            { id: 'local', label: 'Local Model' },
          ],
        },
        {
          id: 'api-key',
          title: 'API Key',
          subtitle: 'Enter your API key',
          type: 'password',
        },
        {
          id: 'features',
          title: 'Optional Features',
          subtitle: 'Enable additional features',
          type: 'multiselect',
          options: [
            { id: 'voice', label: 'Voice Input' },
            { id: 'vision', label: 'Vision' },
            { id: 'web', label: 'Web Search' },
          ],
        },
        {
          id: 'completion',
          title: 'Setup Complete',
          subtitle: 'Your OpenClaw is ready to use',
          type: 'text',
        },
      ];

      // Find current step index
      const currentStepId = answer?.stepId;
      const currentIndex = steps.findIndex(s => s.id === currentStepId);
      const nextIndex = currentIndex + 1;

      // Simulate delay (like real API call)
      await new Promise(resolve => setTimeout(resolve, 500));

      if (nextIndex >= steps.length) {
        // Wizard complete
        return {
          sessionId: 'mock-session-123',
          done: true,
          status: 'completed',
        };
      }

      return {
        sessionId: 'mock-session-123',
        done: false,
        step: {
          ...steps[nextIndex],
          options: steps[nextIndex].options || [],
        },
        status: 'running',
      };
    }

    // Simulate wizard.cancel
    if (method === 'wizard.cancel') {
      return { ok: true };
    }

    // Simulate gateway:restart
    if (method === 'gateway:restart') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return { ok: true };
    }

    // Simulate onboarding:complete
    if (method === 'onboarding:complete') {
      console.log('[Mock IPC] Onboarding complete, would switch to Control UI');
      return { ok: true };
    }

    return { error: 'Unknown method' };
  },

  notifyOnboardingComplete: async () => {
    console.log('[Mock IPC] notifyOnboardingComplete called');
    alert('Setup complete! In real app, would switch to Control UI.');
  },

  restartGateway: async () => {
    console.log('[Mock IPC] restartGateway called');
  },
};

// Inject mock bridge into window
(window as any).electronBridge = mockElectronBridge;

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element #root not found');
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <SetupWizard />
  </React.StrictMode>,
);
```

#### 步骤 2：创建 setup-mock.html

创建 `ui-react/setup-mock.html`：

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OpenClaw Setup (Mock)</title>
    <meta name="color-scheme" content="dark light" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
  </head>

  <body>
    <div id="root"></div>
    <script type="module" src="/src/setup-mock.tsx"></script>
  </body>
</html>
```

#### 步骤 3：在浏览器中打开 Mock 版本

```
http://localhost:5174/setup-mock.html
```

现在你可以完整地测试 Setup Wizard 流程，包括：

- ✅ 所有步骤的 UI 和交互
- ✅ 表单验证
- ✅ 进度条
- ✅ 完成流程
- ✅ 错误处理

## 📋 浏览器测试清单

### UI 测试

- [ ] Welcome 步骤显示正确
- [ ] Security 步骤的复选框可以交互
- [ ] Model Selection 步骤的下拉菜单可以选择
- [ ] API Key 步骤的密码输入正常
- [ ] Optional Features 步骤的多选框可以交互
- [ ] Completion 步骤显示完成信息

### 交互测试

- [ ] 点击 "Next" 按钮进入下一步
- [ ] 点击 "Skip Setup" 按钮取消向导
- [ ] 进度条正确显示进度
- [ ] 表单验证正常工作
- [ ] 错误消息正确显示

### 样式测试

- [ ] 深色/浅色主题切换正常
- [ ] 响应式设计在不同屏幕尺寸下正常
- [ ] 动画和过渡流畅
- [ ] 字体和颜色正确

### 性能测试

- [ ] 页面加载速度快
- [ ] 交互响应迅速
- [ ] 没有内存泄漏
- [ ] 没有控制台错误

## 🔍 调试技巧

### 查看 Mock IPC 调用

打开浏览器 DevTools（F12），在 Console 中查看：

```
[Mock IPC] wizard.start { mode: 'local' }
[Mock IPC] wizard.next { sessionId: 'mock-session-123', answer: { stepId: 'welcome', value: undefined } }
```

### 修改 Mock 数据

在 `setup-mock.tsx` 中修改 `steps` 数组来测试不同的步骤配置。

### 测试错误场景

在 `mockElectronBridge.wizardRequest` 中添加错误处理：

```typescript
if (method === "wizard.next" && Math.random() > 0.8) {
  throw new Error("Simulated API error");
}
```

## 🚀 完整的浏览器测试流程

### 1. 启动开发服务器

```bash
cd ui-react
pnpm dev
```

### 2. 打开浏览器

```
http://localhost:5174/setup-mock.html
```

### 3. 测试完整流程

- 点击 "Next" 逐步完成所有步骤
- 验证每个步骤的 UI 和交互
- 检查浏览器 DevTools 中的日志

### 4. 修改代码并验证

- 修改 Setup Wizard 组件
- 浏览器自动刷新（HMR）
- 验证修改效果

### 5. 完成后切换到 Electron 测试

- 按照 `SETUP_WIZARD_INTEGRATION.md` 启动 Electron
- 验证完整的端到端流程

## 📊 测试覆盖范围

| 测试类型     | 浏览器  | Electron |
| ------------ | ------- | -------- |
| UI 渲染      | ✅      | ✅       |
| 用户交互     | ✅      | ✅       |
| 表单验证     | ✅      | ✅       |
| 样式和主题   | ✅      | ✅       |
| IPC 通信     | ⚠️ Mock | ✅ 真实  |
| 首次启动检测 | ❌      | ✅       |
| 配置文件保存 | ❌      | ✅       |
| Gateway 通信 | ❌      | ✅       |

## ⚠️ 注意事项

### 浏览器测试的局限性

- 无法测试真实的 IPC 通信
- 无法测试首次启动检测
- 无法测试配置文件保存
- 无法测试 Gateway 通信

### 必须在 Electron 中测试的功能

- 完整的端到端流程
- IPC 通信
- 首次启动检测
- 配置文件保存
- Gateway 连接

## 🎯 推荐的测试顺序

1. **浏览器测试**（快速迭代）
   - 验证 UI 和交互
   - 修复样式问题
   - 测试表单验证

2. **Electron 测试**（完整验证）
   - 验证 IPC 通信
   - 验证首次启动流程
   - 验证配置保存
   - 验证 Gateway 连接

3. **生产构建测试**（最终验证）
   - 构建应用
   - 打包应用
   - 测试打包后的应用

## 📚 相关文件

- `ui-react/src/setup-mock.tsx` - Mock IPC 实现
- `ui-react/setup-mock.html` - Mock 入口 HTML
- `ui-react/src/components/setup-wizard/` - Setup Wizard 组件
- `SETUP_WIZARD_INTEGRATION.md` - Electron 测试指南
