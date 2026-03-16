# Setup Wizard 快速开始指南

## 🎯 三种测试方式

### 1️⃣ 浏览器测试（最快 - 推荐先做）

**优点：** 快速迭代，支持 HMR，完整的 DevTools

**步骤：**

```bash
# 终端 1：启动 dev server
cd ui-react
pnpm dev

# 浏览器打开
http://localhost:5174/setup-mock.html
```

**测试内容：**

- ✅ UI 渲染和样式
- ✅ 用户交互
- ✅ 表单验证
- ✅ 进度条和动画
- ⚠️ Mock IPC 通信（模拟）

**预期结果：**

- 看到 Welcome 步骤
- 点击 "Next" 进入下一步
- 完成所有步骤后显示完成信息
- 浏览器 Console 显示 Mock IPC 日志

---

### 2️⃣ Electron 测试（完整 - 最后做）

**优点：** 完整的端到端测试，真实的 IPC 通信

**步骤：**

```bash
# 终端 1：启动 ui-react dev server
cd ui-react
pnpm dev

# 终端 2：启动 Electron
cd apps/electron
VITE_UI_REACT_URL=http://localhost:5174 pnpm dev
```

**测试内容：**

- ✅ 所有浏览器测试内容
- ✅ 真实的 IPC 通信
- ✅ 首次启动检测
- ✅ 配置文件保存
- ✅ Gateway 连接

**预期结果：**

- Electron 窗口打开
- 显示 Setup Wizard
- 完成后自动切换到 Control UI
- 配置文件保存到 `~/.openclaw/config.json`

---

### 3️⃣ 生产构建测试（最终 - 发布前做）

**优点：** 验证最终打包的应用

**步骤：**

```bash
# 1. 构建 ui-react
pnpm ui:react:build

# 2. 构建 Electron
cd apps/electron
pnpm build

# 3. 打包应用
pnpm package:mac

# 4. 打开应用
open release/OpenClaw-*.dmg
```

**测试内容：**

- ✅ 所有 Electron 测试内容
- ✅ 打包后的应用可运行
- ✅ 首次启动流程正常
- ✅ 再次启动跳过 Setup Wizard

---

## 📋 浏览器测试详细步骤

### 第 1 步：启动开发服务器

```bash
cd ui-react
pnpm dev
```

等待输出：

```
  VITE v7.3.1  ready in 294 ms

  ➜  Local:   http://localhost:5174/
  ➜  Network: http://192.168.1.101:5174/
```

### 第 2 步：打开浏览器

在浏览器中打开：

```
http://localhost:5174/setup-mock.html
```

### 第 3 步：测试 Setup Wizard 流程

**Welcome 步骤：**

- [ ] 看到欢迎信息
- [ ] 看到 "Next" 和 "Skip Setup" 按钮
- [ ] 进度条显示 1/6

**Security 步骤：**

- [ ] 看到安全确认复选框
- [ ] 可以勾选/取消复选框
- [ ] 进度条显示 2/6

**Model Selection 步骤：**

- [ ] 看到模型选择下拉菜单
- [ ] 可以选择不同的模型
- [ ] 进度条显示 3/6

**API Key 步骤：**

- [ ] 看到密码输入框
- [ ] 可以输入 API Key
- [ ] 进度条显示 4/6

**Optional Features 步骤：**

- [ ] 看到多个功能复选框
- [ ] 可以勾选/取消复选框
- [ ] 进度条显示 5/6

**Completion 步骤：**

- [ ] 看到完成信息
- [ ] 看到成功图标
- [ ] 进度条显示 6/6
- [ ] 浏览器弹出 alert 提示

### 第 4 步：查看 Mock IPC 日志

打开浏览器 DevTools（F12），在 Console 中查看：

```
[Mock IPC] wizard.start { mode: 'local' }
[Mock IPC] User answered: { stepId: 'welcome', value: undefined }
[Mock IPC] User answered: { stepId: 'security', value: true }
[Mock IPC] User answered: { stepId: 'model', value: 'gpt4' }
...
[Mock IPC] onboarding:complete called
```

### 第 5 步：测试 Skip Setup

刷新页面，点击 "Skip Setup" 按钮：

- [ ] 向导立即关闭
- [ ] 浏览器弹出 alert 提示
- [ ] Console 显示 `wizard.cancel` 日志

---

## 🔍 常见问题

### Q1：页面加载失败

**症状：** 打开 `http://localhost:5174/setup-mock.html` 显示 404

**解决方案：**

1. 确保 dev server 正在运行
2. 检查 URL 是否正确
3. 检查 `setup-mock.html` 文件是否存在

### Q2：Setup Wizard 不显示

**症状：** 页面打开但看不到 Setup Wizard

**解决方案：**

1. 打开浏览器 DevTools（F12）
2. 查看 Console 中是否有错误
3. 检查 `#root` 元素是否存在
4. 检查 CSS 是否加载正确

### Q3：点击 Next 没有反应

**症状：** 点击 "Next" 按钮但没有进入下一步

**解决方案：**

1. 打开浏览器 DevTools
2. 查看 Console 中的 Mock IPC 日志
3. 检查是否有 JavaScript 错误
4. 尝试刷新页面

### Q4：样式看起来不对

**症状：** Setup Wizard 显示但样式不正确

**解决方案：**

1. 检查 CSS 是否加载
2. 尝试清除浏览器缓存（Ctrl+Shift+Delete）
3. 尝试在隐私模式下打开
4. 检查浏览器控制台是否有 CSS 错误

---

## 💡 调试技巧

### 查看 Mock IPC 调用

在浏览器 Console 中输入：

```javascript
// 查看所有 Mock IPC 调用
console.log(window.electronBridge);
```

### 修改 Mock 数据

编辑 `ui-react/src/setup-mock.tsx` 中的 `steps` 数组来测试不同的步骤配置。

### 测试错误场景

在 `setup-mock.tsx` 中添加错误处理：

```typescript
if (method === "wizard.next" && Math.random() > 0.8) {
  throw new Error("Simulated API error");
}
```

### 查看网络请求

在浏览器 DevTools 的 Network 标签中查看所有请求。

---

## 🚀 推荐的测试顺序

### 第一天：浏览器测试

1. ✅ 启动 dev server
2. ✅ 打开 setup-mock.html
3. ✅ 完整测试所有步骤
4. ✅ 修复发现的问题
5. ✅ 验证样式和交互

### 第二天：Electron 测试

1. ✅ 启动 ui-react dev server
2. ✅ 启动 Electron
3. ✅ 测试首次启动流程
4. ✅ 验证 IPC 通信
5. ✅ 验证配置文件保存

### 第三天：生产构建测试

1. ✅ 构建 ui-react
2. ✅ 构建 Electron
3. ✅ 打包应用
4. ✅ 测试打包后的应用
5. ✅ 验证完整流程

---

## 📊 测试覆盖范围

| 功能         | 浏览器 | Electron | 生产 |
| ------------ | ------ | -------- | ---- |
| UI 渲染      | ✅     | ✅       | ✅   |
| 用户交互     | ✅     | ✅       | ✅   |
| 表单验证     | ✅     | ✅       | ✅   |
| 样式和主题   | ✅     | ✅       | ✅   |
| Mock IPC     | ✅     | ⚠️       | ⚠️   |
| 真实 IPC     | ❌     | ✅       | ✅   |
| 首次启动检测 | ❌     | ✅       | ✅   |
| 配置文件保存 | ❌     | ✅       | ✅   |
| Gateway 通信 | ❌     | ✅       | ✅   |

---

## 📚 相关文档

- **浏览器测试详细指南**：`SETUP_WIZARD_BROWSER_TESTING.md`
- **Electron 测试指南**：`SETUP_WIZARD_INTEGRATION.md`
- **快速参考**：`SETUP_WIZARD_QUICK_REFERENCE.md`
- **完整架构**：`SETUP_WIZARD_ARCHITECTURE.md`

---

## ✨ 现在就开始吧！

```bash
# 1. 启动 dev server
cd ui-react
pnpm dev

# 2. 打开浏览器
# http://localhost:5174/setup-mock.html

# 3. 开始测试！
```

祝你测试愉快！🎉
