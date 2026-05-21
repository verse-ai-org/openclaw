# 定时任务模块改进方案

## 背景

用户核心场景：创建定时任务 → 执行 → 查看结果 → 通知到微信/飞书。
当前存在三个阻塞问题。

---

## 问题 1：非 main-agent 无法发送到微信/飞书

### 根因

`resolveAutoRecipient` 只扫描**当前 agent 自己的 session store**。
非 main agent 从未通过微信/飞书收到 inbound 消息，session store 中没有 `identityHints`。

### 修复：跨 agent session store 扫描

改造 `src/infra/outbound/recipient-resolver.ts` 的 `resolveFromSessionHints`：

当前 agent store 没找到时，遍历所有已知 agent 的 session store 继续查找。

```
resolveAutoRecipient
  → resolveFromIdentityLinks (global config, 不变)
  → resolveFromSessionHints (当前 agent)
  → NEW: resolveFromAllAgentSessionHints (扫描所有 agent store)
```

需要的信息：
- `collectReferencedAgentIds(cfg)` 已存在于 `src/config/agent-dirs.ts`，可获取所有 agent id
- `resolveStorePath(cfg.session?.store, { agentId })` + `loadSessionStore()` 可加载任意 agent 的 store

---

## 问题 2：定时任务多次执行后 Chat 中看不到历史结果

### 根因

- 每次 isolated cron run 生成独立 `sessionKey`: `agent:<id>:cron:<jobId>:run:<uuid>`
- "View in chat" 设置 sessionKey 后跳转到 `/chat`
- ChatSidebar 通过 `sessions.list` 加载 session 列表
- cron run session 可能已被 reaper 清理（24h），或不在当前 agent sessions 视图中

### 修复

#### 2a. UI: View in chat 直接加载 chat history

当前 `handleViewInChat` 设置 sessionKey + navigate。但如果 session 不在 sidebar 列表中，
用户看不到内容。

改进：跳转时附带 sessionKey 作为 URL hash/param，chat 页面直接通过 `chat.history` 加载，
不依赖 sessions.list 中包含该 session。

#### 2b. UI: Run History 表格增加 summary 列

在 `RunHistoryTable` 中显示 cron run 的 summary 摘要（来自 run-log 的 `summary` 字段）。
减少用户跳转到 chat 查看结果的需求。

需要扩展 `cron.runs` 返回的数据，UI 侧 `CronRunRecord` 增加 `summary` 字段。

#### 2c. Chat sidebar: cron sessions 分组展示

在 agent 的 sessions 列表中，cron run sessions 按 job 分组显示，
label 格式如 `Cron: Morning Digest`，每个 run 作为子项。

---

## 问题 3：Chat 创建任务时无法自动获取 Recipient ID

### 根因

Web Chat session 没有渠道 inbound 上下文，`currentDeliveryContext` 为空。
`cron` tool 创建 job 时无法填充 `delivery.to`。

### 修复

#### 3a. 新增 Gateway RPC: `channels.recipients`

返回系统中已知的所有 channel recipients（从所有 agent session store 中聚合 identityHints）。

```ts
// Request
{ channel?: string }  // optional filter by channel id

// Response
{
  recipients: Array<{
    channel: string;      // e.g. "feishu", "openclaw-weixin"
    target: string;       // e.g. "user:ou_xxx", "wxid_xxx@im.wechat"
    agentId: string;      // 来源 agent
    sessionKey?: string;  // 来源 session
  }>;
}
```

#### 3b. UI: TaskFormModal Recipient 自动补全

- 选择 announce + channel 后，从 `channels.recipients` 拉取已知 recipients
- Recipient ID 从纯手动输入改为：下拉选择已知 recipients + 手动输入兜底
- 如果仅有一个已知 recipient，自动填充

#### 3c. cron tool delivery 增强

在 `cron` tool 的 `add` action 中，当 `delivery.to` 缺失时，
调用 `resolveAutoRecipient`（含跨 agent 扫描）尝试自动补全。

---

## 实施顺序

1. **recipient-resolver 跨 agent 扫描** — 解决问题 1 + 3 的核心
2. **channels.recipients RPC** — 为 UI 提供数据源
3. **TaskFormModal recipient 自动补全** — 优化创建体验
4. **View in chat 修复** — 解决问题 2
5. **Run History summary 展示** — 增强结果可见性

---

## 改动文件清单

| 文件 | 改动 |
|------|------|
| `src/infra/outbound/recipient-resolver.ts` | 新增跨 agent 扫描逻辑 |
| `src/infra/outbound/recipient-resolver.test.ts` | 补充跨 agent 测试 |
| `src/gateway/server-methods/channels.ts` | 新增 `channels.recipients` handler |
| `src/gateway/protocol/schema/channels.ts` | 新增 schema validation |
| `ui-react/src/store/agents.store.ts` | 新增 `loadChannelRecipients` action |
| `ui-react/src/types/agents.ts` | 新增 `ChannelRecipient` 类型 |
| `ui-react/src/components/scheduled-tasks/TaskFormModal.tsx` | recipient 自动补全 UI |
| `ui-react/src/pages/ScheduledTasksPage.tsx` | 传递 recipients 数据 |
| `ui-react/src/components/scheduled-tasks/RunHistoryTable.tsx` | 增加 summary 列 |
| `ui-react/src/components/chat/ChatSidebar.tsx` | cron session 可见性 |
