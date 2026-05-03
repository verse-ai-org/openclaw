# Step 6 - In-trip Support（行中支持：应急改线、简报、可选推送）

本文件覆盖主流程 Step 6（E-1 ~ E-4）。

**进入条件**：
- 用户已在行程中（或明确表示“正在路上/今天在XX/刚到XX”）
- 或用户在 Step 5（Plan details）末尾选择“直接进入 Step 6（行中支持）”
**产出**：应急改线建议/当日简报；可选创建推送任务（需用户确认）。
**失败/降级**：实时工具失败→标注“未验证”并提供替代动作；推送细节见 `references/push-cards.md`。

## 目标

- 用户出行途中响应突发情况，给出实时调整建议
- 用户确认后，可启动每日行程卡片推送（例如微信）

## 进入条件

- 用户已出发（或明确表示正在行程中）

## 标记出发

说明：
- `start_trip` 会推进 trip 状态到 `in_trip`，当前脚本守卫要求 **`trip.bookings_confirmed === true`**（通常来自 `booking.mjs --cmd=confirm_booking`）。若用户跳过可选酒店、也未做其他预订确认，调用会失败——此时仍可在对话中提供行中支持/简报，**不要强行调用** `start_trip`，除非用户已完成你认为必要的确认并已落盘 `confirm_booking`。

```bash
node {baseDir}/scripts/workflow.mjs --cmd=start_trip --trip-id=<trip_id>
```

## 确认每日行程卡片推送（必须先问）

必须先问用户是否开启，不得默认开启。

用户确认后，需要提取当前会话的投递目标（例如微信用户 ID），再执行 `openclaw cron add` 创建定时任务。

> 详细命令模板、accountId 多账号处理、取消流程请见 `references/push-cards.md`（避免在主流程文档内联超长命令）。

## 按场景响应

- 天气突变/路段封闭：`@skills/weather` 重新查询，给出改线建议（替换受影响 stop）
- 误车/误点：`@skills/amap-lbs-skill` 或 `flyai search-flight` 查补救方案，重排当日计划
- 附近备选点位：`flyai search-poi` 查当前位置附近景点/餐饮
- 当日简报：生成当日行程摘要与天气/路况提醒

## 生成简报

```bash
# 出发前简报
node {baseDir}/scripts/briefing.mjs --cmd=pre_trip \
  --trip-id=<trip_id>

# 每日简报（与 cron 推送内容一致，可手动触发）
node {baseDir}/scripts/briefing.mjs --cmd=daily \
  --trip-id=<trip_id> --day=<N>
```
