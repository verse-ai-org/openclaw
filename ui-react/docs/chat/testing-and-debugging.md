# 测试与调试

## 单元测试

conversation reducer 是纯函数，推荐用“事件流 → state”黄金测试：

- `ui-react/src/components/chat/conversation/reducer.test.ts`

RunEvent/adapter 测试：

- `ui-react/src/components/chat/gateway/gateway-run-adapter.test.ts`
- `ui-react/src/components/chat/adapters/*`（gateway normalize / assistant-ui adapter / outbound parser）

运行：

```bash
pnpm -C ui-react test
```

## 调试开关（DEV）

日志工具：

- `ui-react/src/components/chat/utils/chat-debug.ts`

在浏览器控制台里设置：

- `localStorage.setItem("openclaw.chatBridge.debug", "1")`
- （可选）`localStorage.setItem("openclaw.chatBridge.group", "1")`

然后刷新页面，即可看到 bridge / projection 等日志。

## 常见排查路径

- **UI 没出现 running 行**：检查 `chat.store.sending` 是否在 send 后被置 true；检查 reducer 是否创建了 assistant message（仅收到 liveText 时）。
- **tool/update 找不到对应 tool**：检查 toolCallId 是否稳定；检查 reducer 的 `toolPartIndex` 是否被 truncate 清理过。
- **切 session 后串线**：检查 sessionKey 解析与 `conversationStore.byThread` key；检查 bridge 是否用 payload 的 sessionKey 路由。

