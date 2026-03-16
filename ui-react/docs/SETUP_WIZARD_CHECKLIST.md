# Setup Wizard 实施检查清单

## ✅ 代码修改完成

### ui-react 项目

- [x] 创建 `setup.html` 入口文件
- [x] 创建 `src/setup.tsx` 入口脚本
- [x] 更新 `vite.config.ts` 支持多入口构建
  - [x] 添加 `rollupOptions.input` 配置
  - [x] 配置输出文件名规则

### Electron 项目

- [x] 更新 `src/main/index.ts` 加载 setup 页面
- [x] 更新 `src/main/window.ts` 支持 ui-react dev server
  - [x] 添加 `VITE_UI_REACT_URL` 环境变量支持
  - [x] 特殊处理 setup 页面加载
  - [x] 更新 CSP 策略
- [x] 更新 `electron-builder.yml` 包含 control-ui-react 产物

## 📚 文档完成

- [x] `SETUP_WIZARD_ARCHITECTURE.md` - 架构分析与对比
- [x] `SETUP_WIZARD_INTEGRATION.md` - 开发和构建指南
- [x] `SETUP_WIZARD_IMPLEMENTATION.md` - 实施完成总结
- [x] `SETUP_WIZARD_QUICK_REFERENCE.md` - 快速参考卡片

## 🚀 开发环境测试

### 准备工作

- [ ] 确保 Node.js 22+ 已安装
- [ ] 确保 pnpm 已安装
- [ ] 确保依赖已安装 (`pnpm install`)

### 启动开发环境

- [ ] 终端 1：启动 ui-react dev server

  ```bash
  cd ui-react
  pnpm dev
  ```

  预期输出：`http://localhost:5174/`

- [ ] 终端 2：启动 Electron
  ```bash
  cd apps/electron
  VITE_UI_REACT_URL=http://localhost:5174 pnpm dev
  ```

### 功能测试

- [ ] Electron 窗口正常打开
- [ ] 检测到首次启动（删除 `~/.openclaw/config.json` 如需重新触发）
- [ ] Setup Wizard 页面加载正常
- [ ] 所有步骤可以正常交互
- [ ] 完成 Setup Wizard 后自动切换到 Control UI
- [ ] 配置文件正确保存到 `~/.openclaw/config.json`
- [ ] 修改代码后 Vite HMR 自动刷新

## 📦 生产构建测试

### 构建步骤

- [ ] 构建 ui-react

  ```bash
  pnpm ui:react:build
  ```

  验证：`dist/control-ui-react/` 包含 `main.js` 和 `setup.js`

- [ ] 构建 Electron

  ```bash
  cd apps/electron
  pnpm build
  ```

- [ ] 打包应用
  ```bash
  pnpm package:mac
  ```
  验证：`release/` 目录包含 `.dmg` 文件

### 打包应用测试

- [ ] 打包成功完成
- [ ] 应用可以正常启动
- [ ] 首次启动显示 Setup Wizard
- [ ] 完成 Setup Wizard 后进入 Control UI
- [ ] 再次启动直接进入 Control UI（不显示 Setup Wizard）

## 🔍 代码质量检查

- [ ] 没有 TypeScript 错误

  ```bash
  pnpm tsgo
  ```

- [ ] 没有 Lint 错误

  ```bash
  pnpm check
  ```

- [ ] 构建没有警告
  ```bash
  pnpm build
  ```

## 📝 文档验证

- [ ] 所有文档都能正确打开
- [ ] 文档中的命令都能正确执行
- [ ] 文档中的路径都是正确的
- [ ] 没有过时的信息

## 🧹 可选清理

完全测试后可执行以下清理（可选）：

- [ ] 删除 `apps/electron/renderer/src/onboarding/` 目录
- [ ] 删除 `apps/electron/renderer/onboarding.html` 文件
- [ ] 更新 `apps/electron/renderer/vite.config.ts`（如果有）
- [ ] 更新 `apps/electron/renderer/package.json`（如果有）

## 📋 最终验证

### 开发环境

- [ ] 开发环境启动无错误
- [ ] Setup Wizard 功能完整
- [ ] HMR 热更新正常工作
- [ ] 没有控制台错误

### 生产环境

- [ ] 生产构建成功
- [ ] 打包应用可运行
- [ ] 首次启动流程正常
- [ ] 配置保存正确
- [ ] 再次启动跳过 Setup Wizard

### 代码质量

- [ ] 没有 TypeScript 错误
- [ ] 没有 Lint 错误
- [ ] 没有构建警告
- [ ] 代码风格一致

## 🎯 完成标准

所有以下条件都满足时，实施完成：

1. ✅ 所有代码修改已完成
2. ✅ 所有文档已创建
3. ✅ 开发环境测试通过
4. ✅ 生产构建测试通过
5. ✅ 代码质量检查通过
6. ✅ 文档验证通过

## 📞 问题排查

### 问题：Setup Wizard 页面加载失败

**可能原因：**

- ui-react dev server 未启动
- `VITE_UI_REACT_URL` 环境变量未设置
- CSP 策略阻止加载

**解决方案：**

1. 确保 ui-react dev server 正在运行
2. 检查 `VITE_UI_REACT_URL` 是否正确设置
3. 检查浏览器控制台是否有 CSP 错误

### 问题：完成 Setup Wizard 后没有切换到 Control UI

**可能原因：**

- IPC 通信失败
- Gateway 未正确启动
- 配置文件保存失败

**解决方案：**

1. 检查 Electron 主进程日志
2. 检查 Gateway 是否正常运行
3. 检查 `~/.openclaw/config.json` 是否已创建

### 问题：生产构建失败

**可能原因：**

- ui-react 未构建
- 构建产物路径不正确
- 依赖版本不匹配

**解决方案：**

1. 确保先运行 `pnpm ui:react:build`
2. 检查 `dist/control-ui-react/` 是否存在
3. 运行 `pnpm install` 更新依赖

## 📚 参考文档

- **快速参考**：`SETUP_WIZARD_QUICK_REFERENCE.md`
- **架构分析**：`SETUP_WIZARD_ARCHITECTURE.md`
- **集成指南**：`SETUP_WIZARD_INTEGRATION.md`
- **实施总结**：`SETUP_WIZARD_IMPLEMENTATION.md`

## ✨ 完成后的下一步

1. **提交代码**

   ```bash
   git add .
   git commit -m "feat: integrate ui-react Setup Wizard into Electron"
   git push
   ```

2. **更新项目文档**
   - 更新 README.md
   - 更新开发指南
   - 更新贡献指南

3. **通知团队**
   - 分享实施完成报告
   - 演示新的 Setup Wizard
   - 收集反馈

4. **监控生产**
   - 监控首次启动流程
   - 收集用户反馈
   - 修复发现的问题

---

**状态**：🚀 准备就绪

所有实施步骤已完成。现在可以开始测试了！
