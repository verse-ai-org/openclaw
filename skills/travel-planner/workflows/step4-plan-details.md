# Step 4 - Plan Details（全面计划详情：交通/天气/每日细化 + Geo Map）

本文件覆盖主流程 Step 4（D-1 ~ D-5）。

**进入条件**：路线已确认，且已完成 Step 3 验证（交通/天气）并落盘。
**产出**：一份可执行的“全面计划详情”（不含酒店推荐与酒店查询），并在末尾让用户选择下一步分支。
**失败/降级**：地图/坐标查询失败→标注“未验证坐标/未能渲染地图”，仍可输出文字版计划。

## 目标

- 基于已确认路线 + Step 3 验证结果，输出一份“可执行”的全面计划详情：
  - 交通策略（进入段/转场/缓冲）
  - 天气风险与应对
  - 每日计划详情（按时段展开：上午/下午/晚间；主目标+备选；转场说明；体力负荷；风险点）
  - 建议与提醒（含行前清单/安全/节奏）
  - Geo Map（路线 stops 与每日段落的地图展示）
- **不做酒店查询/不输出酒店候选**；酒店推荐在 Step 4（Optional）执行。

## 进入条件

- `trip.stage === route_confirmed` 且 `chosen_route_id` 已设置
- `route-validation.json` 已落盘（交通/天气验证）

## D-1｜汇总 Step 3 验证结果（交通/天气）

- 交通：优先复用 Step 3 `transport_result`（含 `booking_links` 的 jumpUrl）
- 天气：复用 Step 3 `weather_result`，把风险（go/caution/block）与原因显式写入计划详情

## D-2｜生成逐日计划详情（不含酒店）

- 若此前用户选择了 `full_plan`，可直接在 `full_plan` 的 `itinerary` 基础上输出“逐日详情”
- 若此前只生成过逐日骨架（`itinerary_skeleton`），则在骨架上按以下规则细化（仍不做实时查询）：
  - 每天：上午/下午/晚间各一段（活动窗口 + 风险提醒 + 缓冲）
  - 长转场：明确“出发时间段建议 + 缓冲比例 + 备选方案”
  - 到达日/返程日：默认轻负荷（守卫：不塞硬约束项目）

## D-3｜生成 Geo Map（路线与每日段）

- 目标：用地图展示 `stops`（点）与相邻 stop 的段（线），并标注每天主要活动区域
- 坐标来源建议（按优先级）：
  1. POI cache（如已有）
  2. `@skills/amap-lbs-skill` 查询关键 stop 的坐标（失败则标注“未验证坐标”）
- 输出要求：
  - **必须同时输出文字版路线**作为降级兜底
  - 地图渲染能力不足时：输出 map 数据（points + legs）供前端渲染

## D-4｜建议与提醒（Checklist 风格）

- 从 `references/travel_guidelines.md` 选择与本次行程相关的条目（不贴全量）
- 把 Step 3 的风险裁决（caution/block）转成“必做提醒”

## D-5｜让用户选择下一步分支（option_list，一次确认）

Step 4 输出完成后，必须让用户二选一：

1. **直接进入 Step 6（行中支持）**
2. **进入 Step 4（Optional：酒店推荐）**：再进行酒店实时查询与候选推荐

推荐交互方式：`option_list`（payload 模板见 `examples/option-list.step4-next.json`）。

守卫：
- 调用 `option_list` 后必须 STOP，等待用户点选
- 选 Step 6 → 跳转 `workflows/step5-in-trip-support.md`
- 选 Hotels → 跳转 `workflows/step4-optional-hotels.md`
