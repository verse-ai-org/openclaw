# Step 5 (Optional) - Hotel Recommendations（可选：酒店实时查询）

## 目标
在**全面计划详情已落盘**（`plan-details.json`，`trip.stage === plan_ready`）的前提下，按需做酒店实时查询与候选推荐；可选落盘 `live-results.json` / `booking-ready.json`。

## 守卫
**进入条件**：用户在 Step 5（Plan Details）末尾的 `option_list` 中选择酒店可选分支。  
**脚本守卫**：`booking.mjs` 的 `save_live_results` / `save_booking_ready` / `confirm_booking` 要求 **`trip.stage >= plan_ready`**。
**失败/降级**：实时查询失败 → 标注「未实时验证」，不得用经验补全价格/库存/链接。

## 确定住宿城市/区域
- 以逐日计划中的「住宿区域/落脚点」为默认
- 用户要求少换酒店时，按 1–2 个基地城市查询

## 实时查询酒店（按天或按基地）
```bash
flyai search-hotel --dest-name <当晚住宿城市> \
  --check-in-date <YYYY-MM-DD> --check-out-date <次日YYYY-MM-DD> \
  --sort rate_desc
```
- 每晚最多 2 个候选
- 保留 `detailUrl`/`jumpUrl`；无链接则注明「暂无实时链接」

## 持久化 live-results 与 booking-ready
```bash
node {baseDir}/scripts/booking.mjs --cmd=save_live_results \
  --trip-id=<trip_id> \
  --payload=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/live-results.json
```

由 agent/tool 生成 `booking-ready.json`（聚合 route-plan + route-validation + live-results）后：
```bash
node {baseDir}/scripts/booking.mjs --cmd=save_booking_ready \
  --trip-id=<trip_id> \
  --payload=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/booking-ready.json
```

## 用户确认酒店（可选）
```bash
node {baseDir}/scripts/booking.mjs --cmd=confirm_booking \
  --trip-id=<trip_id> --category=hotel \
  --payload=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/confirmed.hotel.json
```
