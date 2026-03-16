# Setup Wizard - 快速开始指南

## 🚀 快速开始

### 1. 安装依赖

```bash
cd ui-react
pnpm install
```

### 2. 启动开发服务器

```bash
pnpm dev
```

### 3. 访问 Setup Wizard

打开浏览器访问：`http://localhost:5173/setup`

## 📦 已创建的文件

```
ui-react/src/
├── components/setup-wizard/
│   ├── index.tsx                      ✅ 主入口
│   ├── WizardContainer.tsx            ✅ 容器组件
│   ├── ProgressBar.tsx                ✅ 进度条
│   ├── steps/
│   │   ├── WelcomeStep.tsx           ✅ 欢迎屏幕
│   │   ├── SecurityStep.tsx          ✅ 安全确认
│   │   ├── ModelSelectionStep.tsx    ✅ 模型选择
│   │   ├── ApiKeyStep.tsx            ✅ API 密钥
│   │   ├── OptionalFeaturesStep.tsx  ✅ 可选功能
│   │   └── CompletionStep.tsx        ✅ 完成屏幕
│   ├── DESIGN.md                      ✅ 设计文档
│   └── INTEGRATION.tsx                ✅ 集成示例
└── store/
    └── setup-wizard.store.ts          ✅ 状态管理
```

## 🎨 设计特点

### 1. 简洁高级的视觉风格

- 使用 shadcn/ui 组件库
- 渐变背景 (slate-50 → slate-100)
- 卡片式布局
- 平滑过渡动画

### 2. 用户友好的交互

- 一次一个问题
- 智能默认值
- 实时验证
- 清晰的进度指示

### 3. 完整的功能

- 深色/浅色主题
- 响应式设计
- 键盘导航
- 状态持久化

## 🔧 下一步工作

### 必需的依赖

确保 `package.json` 中包含以下依赖：

```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "zustand": "^4.5.0",
    "lucide-react": "^0.400.0"
  }
}
```

### shadcn/ui 组件

需要安装以下 shadcn/ui 组件：

```bash
npx shadcn@latest add button
npx shadcn@latest add input
npx shadcn@latest add checkbox
```

### 路由配置

在你的路由文件中添加：

```typescript
import SetupWizard from '@/components/setup-wizard';

const routes = [
  {
    path: '/setup',
    element: <SetupWizard />,
  },
];
```

## 📝 使用示例

### 基础使用

```typescript
import { SetupWizard } from '@/components/setup-wizard';

function App() {
  return <SetupWizard />;
}
```

### 带完成回调

```typescript
import { SetupWizard } from '@/components/setup-wizard';
import { useWizardStore } from '@/store/setup-wizard.store';

function App() {
  const { wizardState } = useWizardStore();

  const handleSetupComplete = () => {
    console.log('Setup completed with:', wizardState);
    // 保存配置到后端
    // 跳转到主应用
  };

  return <SetupWizard onComplete={handleSetupComplete} />;
}
```

### 检查设置状态

```typescript
import { useWizardStore } from '@/store/setup-wizard.store';

function App() {
  const { wizardState } = useWizardStore();

  if (!wizardState.isComplete) {
    return <SetupWizard />;
  }

  return <MainApp />;
}
```

## 🎯 核心功能

### 1. 进度跟踪

- 6 个步骤的可视化进度条
- 当前步骤高亮显示
- 百分比进度

### 2. 状态管理

- Zustand 全局状态
- localStorage 持久化
- 支持返回修改

### 3. 表单验证

- 实时 API 密钥验证
- 必填字段检查
- 友好的错误提示

### 4. 响应式布局

- 移动端优化
- 平板适配
- 桌面大屏支持

## 🔗 相关链接

- [shadcn/ui 文档](https://ui.shadcn.com)
- [Zustand 文档](https://zustand-demo.pmnd.rs)
- [Tailwind CSS 文档](https://tailwindcss.com)
- [OpenClaw 文档](https://docs.openclaw.ai)

## 💡 设计理念

这个 Setup Wizard 的设计遵循以下原则：

1. **渐进式披露** - 不要一次展示所有选项
2. **智能默认** - 为小白用户提供推荐选项
3. **即时反馈** - 实时验证和错误提示
4. **可逆操作** - 随时返回修改
5. **清晰导航** - 明确的进度和下一步

## 🎨 视觉设计

### 颜色方案

- **主色**: Blue 600 (#2563eb)
- **成功**: Green 600 (#16a34a)
- **警告**: Amber 600 (#d97706)
- **错误**: Red 600 (#dc2626)

### 字体

- **标题**: Inter Bold, 24-32px
- **正文**: Inter Regular, 14-16px
- **辅助**: Inter Regular, 12px

### 间距

- **容器**: 48px 垂直，24px 水平
- **卡片**: 24px 内边距
- **元素**: 12-16px 间距

## 🐛 调试

### 查看当前状态

```typescript
import { useWizardStore } from '@/store/setup-wizard.store';

function DebugPanel() {
  const { wizardState } = useWizardStore();

  return (
    <pre>{JSON.stringify(wizardState, null, 2)}</pre>
  );
}
```

### 重置状态

```typescript
import { useWizardStore } from '@/store/setup-wizard.store';

function ResetButton() {
  const { resetWizardState } = useWizardStore();

  return (
    <button onClick={resetWizardState}>
      重置 Wizard
    </button>
  );
}
```

## 📱 移动端优化

所有组件都针对移动端进行了优化：

- 触摸友好的按钮大小 (最小 44x44px)
- 响应式网格布局
- 移动端隐藏不必要的元素
- 优化的滚动体验

## ♿ 可访问性

- ARIA 标签完整
- 键盘导航支持
- 高对比度模式
- 屏幕阅读器友好

## 🚢 部署

### 构建生产版本

```bash
pnpm build
```

### 环境变量

```env
VITE_API_BASE_URL=http://localhost:18789
VITE_DOCS_URL=https://docs.openclaw.ai
```

## 📊 性能指标

- **首次加载**: < 2s
- **步骤切换**: < 100ms
- **API 验证**: < 2s
- **包大小**: < 500KB (gzipped)

---

**需要帮助？** 查看 [DESIGN.md](./DESIGN.md) 了解详细设计文档。
