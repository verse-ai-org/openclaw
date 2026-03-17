# Setup Wizard UI 设计文档

## 概述

这是一个为小白用户设计的 OpenClaw Setup Wizard UI，使用 React + TypeScript + shadcn/ui 实现。设计目标是在 3-5 分钟内完成配置，降低用户入门门槛。

## 设计原则

### 1. 简化 (Simplification)

- 一次只问一个问题
- 避免信息过载
- 清晰的视觉层级

### 2. 引导 (Guidance)

- 智能默认值
- 内联帮助文本
- 实时验证反馈

### 3. 可控 (Control)

- 随时返回修改
- 进度可视化
- 清晰的行动按钮

### 4. 包容 (Inclusive)

- 支持深色/浅色主题
- 键盘导航支持
- 屏幕阅读器友好

## 文件结构

```
src/components/setup-wizard/
├── index.tsx                          # 主入口
├── WizardContainer.tsx                # 容器组件
├── ProgressBar.tsx                    # 进度条
└── steps/
    ├── WelcomeStep.tsx               # 欢迎屏幕
    ├── SecurityStep.tsx              # 安全确认
    ├── ModelSelectionStep.tsx        # 模型选择
    ├── ApiKeyStep.tsx                # API 密钥输入
    ├── OptionalFeaturesStep.tsx      # 可选功能
    └── CompletionStep.tsx            # 完成屏幕

src/store/
└── setup-wizard.store.ts             # Zustand 状态管理
```

## 组件说明

### WizardContainer

主容器组件，管理步骤导航和状态。

**功能：**

- 步骤管理
- 进度跟踪
- 平滑过渡动画

### ProgressBar

显示当前进度的进度条。

**Props：**

- `current: number` - 当前步骤
- `total: number` - 总步骤数

### WelcomeStep

欢迎屏幕，展示产品特性和设置步骤。

**特点：**

- 清晰的价值主张
- 功能特性卡片
- 设置步骤列表

### SecurityStep

安全确认步骤，要求用户同意安全条款。

**特点：**

- 可展开的详细信息
- 安全检查清单
- 强制同意机制

### ModelSelectionStep

AI 模型选择步骤。

**特点：**

- 推荐项标记
- 功能标签
- 可展开的更多选项

### ApiKeyStep

API 密钥输入和验证步骤。

**特点：**

- 分步骤指导
- 一键打开官网
- 实时连接测试
- 密钥隐藏/显示切换

### OptionalFeaturesStep

可选功能配置步骤。

**特点：**

- 复选框选择
- 功能描述
- 隐私保护提示

### CompletionStep

完成屏幕，显示设置摘要和下一步操作。

**特点：**

- 成功反馈动画
- 设置摘要
- 多个行动选项
- 有用的提示

## 状态管理

使用 Zustand 管理 wizard 状态，支持本地存储持久化。

### WizardState 接口

```typescript
interface WizardState {
  selectedModel: string;
  apiKey: string;
  workspace: string;
  optionalFeatures: {
    messaging?: boolean;
    browser?: boolean;
    fileAccess?: boolean;
  };
  gatewayPort: number;
  gatewayBind: "loopback" | "lan" | "custom";
  gatewayAuth: "token" | "password";
  installDaemon: boolean;
  daemonRuntime: "node" | "bun";
  currentStep: number;
  isComplete: boolean;
}
```

### 使用示例

```typescript
import { useWizardStore } from '@/store/setup-wizard.store';

function MyComponent() {
  const { wizardState, updateWizardState } = useWizardStore();

  const handleUpdate = () => {
    updateWizardState({
      selectedModel: 'gpt4',
      apiKey: 'sk-...',
    });
  };

  return (
    <div>
      <p>当前模型: {wizardState.selectedModel}</p>
      <button onClick={handleUpdate}>更新</button>
    </div>
  );
}
```

## 样式指南

### 颜色系统

使用 Tailwind CSS 的 slate 和 blue 颜色系统：

- **主色**: `blue-600` (深蓝)
- **背景**: `slate-50` (浅色) / `slate-950` (深色)
- **边框**: `slate-200` (浅色) / `slate-800` (深色)
- **文本**: `slate-900` (浅色) / `white` (深色)
- **成功**: `green-600`
- **警告**: `amber-600`
- **错误**: `red-600`

### 间距

- 容器内边距: `px-6 py-12`
- 卡片内边距: `p-4` 或 `p-6`
- 元素间距: `gap-3` 或 `gap-4`
- 部分间距: `space-y-3` 或 `space-y-6`

### 圆角

- 按钮: `rounded-lg`
- 卡片: `rounded-lg`
- 输入框: `rounded-md`
- 进度条: `rounded-full`

### 字体

- 标题: `font-bold` + `text-2xl` 或 `text-3xl`
- 副标题: `font-semibold` + `text-lg`
- 正文: `text-sm` 或 `text-base`
- 辅助文本: `text-xs` + `text-slate-500`

### 动画

- 页面过渡: `animate-in fade-in duration-300`
- 进度条: `transition-all duration-500 ease-out`
- 按钮悬停: `hover:bg-blue-700 transition-colors`
- 成功动画: `animate-bounce`

## 使用方法

### 1. 导入组件

```typescript
import { SetupWizard } from "@/components/setup-wizard";
```

### 2. 在路由中使用

```typescript
// 在你的路由配置中
import SetupWizard from '@/components/setup-wizard';

const routes = [
  {
    path: '/setup',
    element: <SetupWizard />,
  },
];
```

### 3. 集成到应用

```typescript
function App() {
  const [setupComplete, setSetupComplete] = useState(false);

  if (!setupComplete) {
    return <SetupWizard />;
  }

  return <MainApp />;
}
```

## 响应式设计

所有组件都支持响应式设计：

- **移动设备** (< 640px): 单列布局，全宽按钮
- **平板** (640px - 1024px): 两列网格
- **桌面** (> 1024px): 三列网格，最大宽度 2xl

## 可访问性

### 键盘导航

- Tab 键在按钮和输入框之间导航
- Enter 键激活按钮
- Space 键切换复选框

### 屏幕阅读器

- 所有按钮都有清晰的标签
- 表单字段有关联的 label
- 使用语义化 HTML

### 颜色对比

- 所有文本都满足 WCAG AA 标准
- 不仅依赖颜色传达信息

## 深色模式

所有组件都支持深色模式，使用 `dark:` 前缀：

```typescript
<div className="bg-white dark:bg-slate-900">
  <p className="text-slate-900 dark:text-white">文本</p>
</div>
```

## 性能优化

- 使用 React.memo 避免不必要的重新渲染
- 状态存储在 Zustand 中，避免 prop drilling
- 使用 CSS 动画而不是 JavaScript 动画
- 图片使用 WebP 格式

## 浏览器兼容性

- Chrome/Edge: 最新版本
- Firefox: 最新版本
- Safari: 最新版本
- 移动浏览器: iOS Safari 12+, Chrome Android 最新版本

## 测试

### 单元测试

```typescript
import { render, screen } from '@testing-library/react';
import { WelcomeStep } from './steps/WelcomeStep';

describe('WelcomeStep', () => {
  it('renders welcome message', () => {
    render(<WelcomeStep onNext={() => {}} />);
    expect(screen.getByText('欢迎使用 OpenClaw')).toBeInTheDocument();
  });
});
```

### E2E 测试

```typescript
describe("Setup Wizard Flow", () => {
  it("completes full setup flow", () => {
    cy.visit("/setup");
    cy.contains("开始设置").click();
    cy.contains("我已阅读").click();
    cy.contains("继续").click();
    // ... 继续测试其他步骤
  });
});
```

## 常见问题

### Q: 如何自定义颜色？

A: 编辑 `tailwind.config.ts` 中的颜色配置，或在组件中使用 `className` 覆盖。

### Q: 如何添加新的步骤？

A: 在 `steps/` 目录中创建新组件，然后在 `WizardContainer.tsx` 中添加路由。

### Q: 如何修改进度条样式？

A: 编辑 `ProgressBar.tsx` 中的 className。

### Q: 如何支持多语言？

A: 使用 i18n 库（如 react-i18next），将所有文本提取到翻译文件中。

## 未来改进

- [ ] 多语言支持
- [ ] 离线模式
- [ ] 高级配置选项
- [ ] 设置导入/导出
- [ ] 实时预览
- [ ] 更多模型选项
- [ ] 集成测试

## 许可证

MIT
