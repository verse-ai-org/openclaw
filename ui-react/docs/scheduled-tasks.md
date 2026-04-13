# Scheduled Tasks 模块技术文档

## 1. 模块概述

Scheduled Tasks（定时任务）模块允许用户创建、管理和监控定时执行的 AI agent 任务。任务通过 Gateway 的 Cron 系统调度，支持循环执行（每日/每周/每月/自定义间隔）和一次性执行。

### 功能边界

- 创建 / 编辑 / 删除定时任务
- 启用 / 禁用任务（开关）
- 立即执行任务（Run now）
- 查看运行历史（Run History）并按状态和时间过滤
- 通过 View in chat 跳转到任务产生的对话

---

## 2. 文件结构

```
ui-react/src/
├── pages/
│   └── ScheduledTasksPage.tsx        # 页面入口，Tab 切换 + 客户端过滤逻辑
├── components/scheduled-tasks/
│   ├── TaskCard.tsx                   # 任务卡片（开关 / Run now / Delete / 点击编辑）
│   ├── TaskFormModal.tsx              # 新建 / 编辑任务弹框
│   ├── RunHistoryTable.tsx            # 运行历史表格（含过滤 UI）
│   └── NewTaskCard.tsx                # "Create New Task" 占位卡片
├── store/
│   └── agents.store.ts               # Zustand store，Cron slice（loadCronStatus / createCronJob …）
├── types/
│   └── agents.ts                     # CronJob / ScheduledTaskFormData / CronRunRecord 等类型
└── lib/
    └── cron-format.ts                 # CronSchedule → 人类可读标签转换
```

---

## 3. 核心数据类型

### 3.1 CronJob（来自 Gateway）

```ts
type CronJob = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  deleteAfterRun?: boolean;
  schedule: CronSchedule;           // at / every / cron
  sessionTarget: "main" | "isolated";
  wakeMode: "next-heartbeat" | "now";
  payload: CronPayload;             // agentTurn | systemEvent
  delivery?: CronDelivery;          // none | announce | webhook
  state?: CronJobState;             // nextRunAtMs / lastRunAtMs / lastStatus …
};
```

### 3.2 CronSchedule

```ts
type CronSchedule =
  | { kind: "at"; at: string }                           // 一次性，ISO 8601 字符串
  | { kind: "every"; everyMs: number }                   // 固定间隔（ms）
  | { kind: "cron"; expr: string; tz?: string };         // 标准 5 字段 cron 表达式
```

### 3.3 ScheduledTaskFormData（UI 表单）

```ts
type ScheduledTaskFormData = {
  name: string;
  scheduleKind: "daily" | "weekly" | "monthly" | "every" | "one-time";
  preferredTime: string;       // "HH:mm"，用于 daily/weekly/monthly
  everyAmount: string;         // 数字字符串，用于 every 模式
  everyUnit: "minutes" | "hours" | "days";
  scheduleAt: string;          // datetime-local 值，用于 one-time
  deliveryMode: "none" | "announce";
  agentPrompt: string;
};
```

### 3.4 CronRunRecord（UI 运行历史记录）

```ts
type CronRunRecord = {
  id: string;
  jobId: string;
  jobName: string;
  status: "running" | "success" | "failed";
  executionTime: number;    // Unix ms
  durationMs?: number;
  error?: string;
  sessionId?: string;
  sessionKey?: string;      // 用于跳转到对应 Chat 会话
};
```

---

## 4. Gateway RPC 方法

所有调用通过 WebSocket 客户端 `client.request(method, params)` 发送。

| 方法 | 用途 | 关键参数 |
|------|------|----------|
| `cron.status` | 获取 Cron 整体状态（enabled / jobs count / nextWakeAtMs） | — |
| `cron.list` | 获取任务列表 | `includeDisabled: true`（必须，否则只返回启用任务） |
| `cron.add` | 创建任务 | 见下文 |
| `cron.update` | 更新任务（含启用/禁用） | `id`, `patch` |
| `cron.remove` | 删除任务 | `id` |
| `cron.run` | 立即执行任务 | `id` |
| `cron.runs` | 获取运行历史 | `scope: "all"`, `limit`, `offset`, `sortDir` |

> **注意**：方法名以 `cron.*` 为准，不是 `cron.jobs.*`。

### 4.1 cron.add 参数结构

```ts
{
  name: string,
  description: string,           // agentPrompt 前 120 字符
  enabled: true,
  deleteAfterRun: false,         // 必须显式设为 false！Gateway 对 kind="at" 默认 true
  schedule: CronSchedule,
  payload: { kind: "agentTurn", message: string },
  delivery: { mode: "none" | "announce" },
  sessionTarget: "isolated",     // 必须是 "isolated"（配合 kind="agentTurn"）
  wakeMode: "next-heartbeat",
}
```

### 4.2 cron.runs 返回结构

```ts
{
  entries: Array<{
    ts: number;          // 执行时间戳（ms）
    jobId: string;
    jobName?: string;    // 任务已删除时可能为空
    status?: "ok" | "error" | "skipped";
    durationMs?: number;
    error?: string;
    sessionId?: string;
    sessionKey?: string;
  }>;
  total: number;
}
```

---

## 5. 重要约束与陷阱

### 5.1 sessionTarget 与 payload.kind 强制配对

| sessionTarget | payload.kind |
|---------------|--------------|
| `"isolated"`  | `"agentTurn"` ✅ |
| `"main"`      | `"systemEvent"` ✅ |
| `"main"`      | `"agentTurn"` ❌ Gateway 报错 |

UI 一律使用 `sessionTarget: "isolated"` + `payload.kind: "agentTurn"`。

### 5.2 deleteAfterRun 默认值陷阱

Gateway 对 `schedule.kind === "at"` 的任务会默认设置 `deleteAfterRun: true`，导致执行完成后任务从列表中消失。

**修复**：创建任务时始终显式传 `deleteAfterRun: false`。

### 5.3 datetime-local 时区处理

`<input type="datetime-local">` 返回的值（如 `"2026-04-12T21:12"`）**不含时区信息**，直接传给 `new Date()` 后调用 `.toISOString()` 会转成 UTC，导致时间偏差。

**正确做法**：手动拼接本地时区偏移：

```ts
const d = new Date(form.scheduleAt);
const offsetMin = -d.getTimezoneOffset();       // 东八区 = +480
const sign = offsetMin >= 0 ? "+" : "-";
const oh = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, "0");
const om = String(Math.abs(offsetMin) % 60).padStart(2, "0");
const at = `${form.scheduleAt}:00${sign}${oh}:${om}`;
// e.g. "2026-04-12T21:12:00+08:00"
```

### 5.4 cron.runs 不支持服务端 timeRange 过滤

Gateway 的 `run-log.ts` 不接受 `since` 参数。时间范围过滤必须在**客户端**实现：

```ts
const filteredRunHistory = cronRunHistory.filter((r) => {
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000; // week
  return r.executionTime >= since;
});
```

### 5.5 Gateway status 值映射

Gateway 返回的 `status` 为 `"ok" | "error" | "skipped"`，UI 层显示为 `"success" | "failed"`：

```ts
status: e.status === "ok" ? "success" : "failed"
// "skipped" 和 undefined 均映射为 "failed"
```

### 5.6 Delivery mode

- `"none"`：任务静默执行，不发送到任何 channel（无 channel 配置时应使用此选项）
- `"announce"`：将执行结果推送到已配置的 channel（channel 未配置时报错）

---

## 6. 调度类型与转换

`formDataToCronSchedule(form)` 将 UI 表单数据转换为 `CronSchedule`：

| scheduleKind | 转换结果 |
|--------------|---------|
| `"daily"` | `{ kind: "cron", expr: "MM HH * * *" }` |
| `"weekly"` | `{ kind: "cron", expr: "MM HH * * 1" }` （每周一） |
| `"monthly"` | `{ kind: "cron", expr: "MM HH 1 * *" }` （每月1日） |
| `"every"` | `{ kind: "every", everyMs: amount * unit_ms }` |
| `"one-time"` | `{ kind: "at", at: "2026-04-12T21:12:00+08:00" }` |

---

## 7. 状态管理（Zustand）

### Store slice 字段

```ts
// agents.store.ts — Cron 相关状态
cronStatus: CronStatus | null;
cronJobs: CronJob[];
cronLoading: boolean;
cronError: string | null;
cronRunHistory: CronRunRecord[];
cronRunHistoryLoading: boolean;
cronRunHistoryError: string | null;
cronJobSaving: boolean;
cronJobSaveError: string | null;
```

### Actions

| Action | 说明 |
|--------|------|
| `loadCronStatus()` | 拉取 cron.status + cron.list（含 disabled） |
| `loadCronJobs()` | 仅拉取 cron.list |
| `loadCronRunHistory(params?)` | 拉取运行历史（全量，客户端过滤） |
| `createCronJob(form)` | 创建任务，成功后刷新列表 |
| `updateCronJob(id, form)` | 更新任务，成功后刷新列表 |
| `deleteCronJob(id)` | 删除任务，成功后刷新列表 |
| `toggleCronJobEnabled(id, enabled)` | 乐观更新 UI，调用 cron.update |
| `rerunCronJob(id)` | 调用 cron.run 立即触发 |

---

## 8. 组件交互流程

### 8.1 任务卡片（TaskCard）

- **点击卡片**任意位置 → 打开 Edit 弹框
- **右上角开关**：调用 `onToggleEnabled`，显示 toast（"Task enabled" / "Task disabled"）；开关始终可操作
- **三点菜单** → "Run now"：调用 `onRunNow` → `rerunCronJob`
- **三点菜单** → "Delete"：调用 `onDelete` → `deleteCronJob`
- 卡片 `opacity-60` 当 `!isEnabled`

> 开关区域和三点菜单区域使用 `e.stopPropagation()` 阻止触发卡片点击编辑。

### 8.2 任务弹框（TaskFormModal）

- 支持新建和编辑两种模式
- 调度类型切换时显示对应控件：
  - `daily/weekly/monthly` → 时间选择器（HH:mm）
  - `every` → 数量 + 单位下拉
  - `one-time` → `datetime-local` 日期时间选择器
- Delivery Mode：`none`（默认）/ `announce`

### 8.3 运行历史（RunHistoryTable）

- 过滤 UI 维护在 `RunHistoryTable` 内部（`timeFilter` / `statusFilter` state）
- 过滤变化时调用 `onFilterChange(params)` 回调
- **实际过滤在 `ScheduledTasksPage` 客户端侧完成**，`RunHistoryTable` 只接收已过滤的 `records`

```
RunHistoryTable (UI state: timeFilter, statusFilter)
    ↓ onFilterChange({ timeFilter, statusFilter })
ScheduledTasksPage (更新 historyStatusFilter / historyTimeFilter)
    ↓ 计算 filteredRunHistory
RunHistoryTable (渲染 filteredRunHistory)
```

### 8.4 View in chat 跳转

```ts
// 利用 sessionKey 精准定位到任务产生的对话
import("@/store/chat.store").then(({ useChatStore }) => {
  useChatStore.getState().setSessionKey(record.sessionKey!);
  void navigate("/chat");
});
```

---

## 9. 调度标签格式化（cron-format.ts）

| CronSchedule | 显示标签示例 |
|--------------|------------|
| `{ kind: "cron", expr: "0 8 * * *" }` | `DAILY, 8:00 AM` |
| `{ kind: "cron", expr: "0 9 * * 1" }` | `EVERY MON, 9:00 AM` |
| `{ kind: "cron", expr: "0 2 1 * *" }` | `1ST OF MONTH, 2:00 AM` |
| `{ kind: "every", everyMs: 3600000 }` | `EVERY HOUR` |
| `{ kind: "every", everyMs: 7200000 }` | `EVERY 2 HOURS` |
| `{ kind: "at", at: "2026-04-12T12:21:00.000Z" }` | `ONE-TIME, 2026-04-12 20:21`（本地时间） |

> `at` 类型使用 `new Date(at)` 转换为本地时间显示，保证与用户选择一致。

---

## 10. 数据流总览

```
用户操作
  │
  ▼
ScheduledTasksPage
  ├── My Scheduled Task Tab
  │     └── TaskCard × N  ──→ handleEdit / handleDelete / toggleCronJobEnabled / handleRerun
  │
  └── Run History Tab
        └── RunHistoryTable
              ├── onFilterChange → 更新 historyStatusFilter / historyTimeFilter（本地 state）
              ├── filteredRunHistory = cronRunHistory.filter(...)  ← 客户端过滤
              ├── onRerun → rerunCronJob → cron.run
              └── onViewInChat → setSessionKey + navigate("/chat")

agents.store（Zustand）
  ├── loadCronStatus → cron.status + cron.list(includeDisabled:true)
  ├── loadCronRunHistory → cron.runs(scope:"all", limit:200)
  ├── createCronJob → cron.add → loadCronJobs
  ├── updateCronJob → cron.update → loadCronJobs
  ├── deleteCronJob → cron.remove → loadCronJobs
  ├── toggleCronJobEnabled → 乐观更新 → cron.update
  └── rerunCronJob → cron.run

Gateway（WebSocket RPC）
  └── 持久化到 ~/.openclaw/jobs.json + runs/*.jsonl
```
