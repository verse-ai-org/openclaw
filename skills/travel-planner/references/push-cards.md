# Push Cards（行中每日行程卡片推送）

本文件承载“可选推送”特性细节，避免主流程文档过长。

## 守卫（必须）

- 必须先问用户是否开启，不得默认开启
- 必须等待用户明确回答（“要/不用”）后再创建/跳过

## 创建定时任务（示例）

提取当前会话的投递目标（例如微信用户 ID：`xxx@im.wechat`）后执行：

```bash
openclaw cron add \
  --name "每日行程卡片 <trip_id>" \
  --cron "0 8 * * *" \
  --tz "Asia/Shanghai" \
  --session isolated \
  --message "你好！请为行程 <trip_id> 生成今日行程卡片，包含：今日主题、时间轴、住宿、天气提示。请调用 briefing.mjs --mode=daily 生成并整理为 Markdown 卡片回复用户。" \
  --announce \
  --channel openclaw-weixin \
  --to "<当前用户的微信ID@im.wechat>" \
  --agent travel-planner
```

### 多账号环境（可选）

若需要指定 `accountId`：

```bash
openclaw cron edit <jobId> --set 'delivery.accountId=<AccountId>'
```

## 取消推送

```bash
openclaw cron list
openclaw cron delete <jobId>
```

