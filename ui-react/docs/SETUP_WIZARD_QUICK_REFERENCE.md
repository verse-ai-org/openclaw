# Setup Wizard 实施快速参考

## 🎯 实施完成

方案 B（统一使用 ui-react）已完全实施。

## 📋 已修改的文件

### 1. ui-react 项目

```
✅ ui-react/setup.html              (新增)
✅ ui-react/src/setup.tsx           (新增)
✅ ui-react/vite.config.ts          (已更新 - 多入口)
```

### 2. Electron 项目

```
✅ apps/electron/src/main/index.ts           (已更新 - 加载 setup)
✅ apps/electron/src/main/window.ts          (已更新 - 支持 ui-react)
✅ apps/electron/electron-builder.yml        (已更新 - 包含产物)
```

### 3. 文档

```
✅ SETUP_WIZARD_ARCHITECTURE.md      (架构分析)
✅ SETUP_WIZARD_INTEGRATION.md       (集成指南)
✅ SETUP_WIZARD_IMPLEMENTATION.md    (实施总结)
```

## 🚀 立即开始测试

### 终端 1：启动 ui-react dev server

```bash
cd ui-react
pnpm dev
```

### 终端 2：启动 Electron

```bash
cd apps/electron
VITE_UI_REACT_URL=http://localhost:5174 pnpm dev
```

## ✨ 关键变化

| 项目     | 之前                                     | 现在                                    |
| -------- | ---------------------------------------- | --------------------------------------- |
| Setup UI | Electron onboarding                      | ui-react Setup Wizard                   |
| 位置     | `apps/electron/renderer/src/onboarding/` | `ui-react/src/components/setup-wizard/` |
| 框架     | 原生 CSS-in-JS                           | React + shadcn/ui                       |
| 开发体验 | 基础                                     | 完整 HMR 支持                           |
| 代码复用 | 无                                       | 与 Control UI 共享                      |

## 📊 构建流程

```bash
# 1. 构建 ui-react（包括 setup 和 main）
pnpm ui:react:build

# 2. 构建 Electron
cd apps/electron && pnpm build

# 3. 打包应用
pnpm package:mac
```

## 🔍 验证清单

- [ ] 开发环境启动无错误
- [ ] Setup Wizard 页面加载正常
- [ ] 完成 Setup 流程
- [ ] 自动切换到 Control UI
- [ ] 配置文件保存正确
- [ ] 生产构建成功
- [ ] 打包应用可运行

## 📚 详细文档

- **架构分析**：`SETUP_WIZARD_ARCHITECTURE.md`
- **集成指南**：`SETUP_WIZARD_INTEGRATION.md`
- **实施总结**：`SETUP_WIZARD_IMPLEMENTATION.md`

## ⚠️ 重要提醒

1. **环境变量**：开发时必须设置 `VITE_UI_REACT_URL=http://localhost:5174`
2. **构建顺序**：ui-react 必须先构建，Electron 才能打包
3. **首次启动**：删除 `~/.openclaw/config.json` 可重新触发 Setup Wizard
4. **可选清理**：完全测试后可删除 `apps/electron/renderer/src/onboarding/`

## 🎉 完成！

所有实施步骤已完成。现在可以开始测试了。
