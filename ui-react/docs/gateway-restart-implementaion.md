# Gateway 重启状态提示功能实施总结

## 概述
已完成 Electron 应用在 Gateway 重启时的用户交互优化。当 Gateway 崩溃或重启时，用户现在会看到清晰的进度提示，而不是连接错误。

## 实施的改动

### 1. 主进程改动 (Electron Main)

#### `apps/electron/src/main/gateway.ts`
- **新增回调注册函数**：`onGatewayRestartProgress()`
  - 用于注册重启进度通知回调
  - 分别处理"正在重启"和"重启完成"事件

- **新增自动重启处理**：`handleGatewayCrashWithAutoRestart()`
  - 检测到 Gateway 崩溃时自动触发
  - 最多尝试 3 次重启（可配置）
  - 每次重启间隔 2 秒（给系统清理资源）
  - 通过回调通知 UI 重启进度

- **修改 exit 事件处理**
  - 使用新的自动重启处理函数替代直接调用 `_onGatewayCrash`

- **新增状态变量**
  - `_autoRestartAttempts`: 追踪重启尝试次数
  - `MAX_AUTO_RESTART_ATTEMPTS`: 最大重启次数（3）
  - `AUTO_RESTART_DELAY_MS`: 重启延迟（2000ms）

#### `apps/electron/src/main/index.ts`
- **导入新函数**：`onGatewayRestartProgress`

- **新增 IPC 处理器**：`gateway:manual-restart`
  - 允许渲染进程手动触发 Gateway 重启
  - 返回 `{ ok: boolean, error?: string }`

- **注册重启回调**
  - 在 `startGateway()` 后注册进度回调
  - 通过 `webContents.send()` 发送 IPC 事件到渲染进程
  - 事件类型：
    - `gateway:restarting` - 重启中（包含 attempt 和 maxAttempts）
    - `gateway:restarted` - 重启完成（包含 success 和 error）
    - `gateway:crashed` - 崩溃通知（包含 code 和 signal）

### 2. Preload 脚本改动

#### `apps/electron/src/preload/index.ts`
- **新增 IPC 调用**：`manualGatewayRestart()`
  - 手动触发 Gateway 重启

- **新增事件监听器**：
  - `onGatewayRestarting()` - 监听重启进度
  - `onGatewayRestarted()` - 监听重启完成
  - `onGatewayCrashed()` - 监听崩溃事件
  - 每个监听器返回取消订阅函数

### 3. 渲染进程改动 (React UI)

#### `ui-react/src/context/GatewayStatusContext.tsx` (新文件)
- **状态定义**：
  - `idle` - 正常连接
  - `connecting` - 首次连接中
  - `restarting` - Gateway 正在重启
  - `reconnecting` - 尝试重新连接
  - `error` - 连接错误
  - `offline` - 离线

- **Context 提供者**：`GatewayStatusProvider`
  - 监听所有 IPC 事件
  - 管理状态转换
  - 提供倒计时逻辑（15 秒）
  - 提供手动重试函数

- **Hook**：`useGatewayStatus()`
  - 用于在组件中访问 Gateway 状态

#### `ui-react/src/components/GatewayStatusOverlay.tsx` (新文件)
- **UI 组件**：显示 Gateway 状态覆盖层
  - 使用 Lucide 图标
  - 响应式设计
  - 平滑动画过渡
  - 不同状态的不同 UI：
    - `restarting`: 进度条 + 倒计时 + 重试次数
    - `reconnecting`: 加载动画 + 文本
    - `error`: 错误图标 + 错误信息 + 重试按钮
    - `offline`: 离线图标 + 离线提示 + 手动重试按钮

#### `ui-react/src/main.tsx`
- 包装 `App` 组件在 `GatewayStatusProvider` 中

#### `ui-react/src/App.tsx`
- 在路由器前添加 `GatewayStatusOverlay` 组件

## 状态流转图

```
idle (正常)
  ↓
  ├─→ Gateway 崩溃 → restarting (显示进度) → connecting → idle
  │                                    ↓
  │                              max attempts exceeded → error
  │
  └─→ 用户手动重启 → reconnecting → idle
```

## 用户体验改进

✅ **主动通知** - 用户知道 Gateway 正在重启，而不是看到错误
✅ **进度反馈** - 显示重试次数和倒计时
✅ **自动恢复** - 自动重启和重连，无需用户干预
✅ **手动控制** - 用户可以手动重试
✅ **清晰状态** - 不同的视觉反馈对应不同的状态
✅ **优雅降级** - 失败时提供明确的错误信息和操作选项

## 配置参数

可在 `gateway.ts` 中调整：
- `MAX_AUTO_RESTART_ATTEMPTS = 3` - 最大重启次数
- `AUTO_RESTART_DELAY_MS = 2000` - 重启延迟（毫秒）
- `GATEWAY_READY_TIMEOUT_MS = 15_000` - Gateway 就绪超时

可在 `GatewayStatusContext.tsx` 中调整：
- `setCountdown(15)` - 倒计时秒数

## 测试建议

1. **正常启动**：验证 `idle` 状态不显示覆盖层
2. **模拟崩溃**：
   - 手动杀死 Gateway 进程
   - 观察自动重启流程
   - 验证进度条和倒计时
3. **手动重试**：
   - 在错误状态点击"重试连接"
   - 验证重连逻辑
4. **多次失败**：
   - 模拟多次重启失败
   - 验证最大尝试次数限制
   - 验证错误状态显示

## 文件清单

### 修改的文件
- `apps/electron/src/main/gateway.ts` - 添加自动重启逻辑
- `apps/electron/src/main/index.ts` - 添加 IPC 处理和回调注册
- `apps/electron/src/preload/index.ts` - 暴露新的 IPC 接口
- `ui-react/src/main.tsx` - 集成 Provider
- `ui-react/src/App.tsx` - 集成 Overlay 组件

### 新增的文件
- `ui-react/src/context/GatewayStatusContext.tsx` - Gateway 状态上下文
- `ui-react/src/components/GatewayStatusOverlay.tsx` - Gateway 状态覆盖层 UI

## 后续优化建议

1. **指数退避重试**
   ```typescript
   const getRetryDelay = (attempt: number) => {
     return Math.min(1000 * Math.pow(2, attempt - 1), 10000);
   };
   ```

2. **健康检查**
   - 定期检查 Gateway 健康状态
   - 主动检测问题

3. **系统通知**
   - 在 macOS 上显示系统通知
   - 在 Windows 上显示任务栏提示

4. **日志记录**
   - 记录所有状态变化
   - 便于调试和分析

5. **性能优化**
   - 缓存 IPC 调用结果
   - 优化重新渲染
