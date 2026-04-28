# Step 2 - Route Planning（证据→候选路线→用户选择→持久化）

本文件覆盖主流程 Step 2（A-1 ~ A-8）。

**进入条件**：已存在 `trip_id`，并需要“框定路线/对比路线/基于证据生成路线”。
**产出**：`step4.plan-output.json` + `chosen_route_id`（确认后）+ 对应持久化状态（evidence/plan/choice）。
**失败/降级**：平台/工具失败必须透明降级（见 `references/capability-matrix.md`）；两平台都失败→不得给最终路线。

## 目标

- 基于外部平台证据（搜索 / 小红书 / 用户粘贴）生成 2-3 条候选路线（带 `route_id`），并让用户确认选择
- 内容驱动优先；支持用户手动粘贴作为证据
- 大 JSON 必须通过 `@file` 方式传递，禁止在命令行内联超长 JSON

字段说明与 JSON 示例参见 `references/route-protocol.md`。

## A-1｜平台选择（必须让用户选择确认）

调用 `option_list` 工具让用户二选一（payload 见 `examples/option-list.route-platform-choice.json`）。

守卫：
- 必须等用户回答，不得自行跳过（例外：用户已明确说“按搜索/用小红书/默认”）
- 未指定时默认 `search`（Brave）
- 降级（`xhs -> search`）时必须显式提示，并说明原因

## A-2｜拉取平台证据

按所选平台执行：

- **search**：使用搜索引擎检索路线证据，结果写入 `route_evidence.route_hints`（`key_destinations` 或 `popular_loops`）
- **xhs**：调用 `@skills/xiaohongshu` 的 `search-feeds` + `get-feed-detail`
  - 查询词：`J人<目的地><days>天行程安排`
  - 过滤：`--note-type 图文 --sort-by 最多点赞`，只保留前 2-3 条图文笔记
  - 若 detail 失败/超时/空：进入 A-2-F
- **用户手动粘贴**：直接作为证据，标记
  - `verification_status=user_input_unverified`
  - `evidence_source=user_input_xhs|user_input_search`

### A-2-F｜xhs 异常分流（必须二选一确认）

必须向用户发起二选一确认（不得静默继续）：
1. 用户手动提供小红书内容 -> 走“用户手动粘贴”，标记 `evidence_source=user_input_xhs`
2. 切换到搜索 -> 记录 `fallback_reason=xhs_detail_unavailable`，提示“已降级到搜索”，重新走 search 链路

用户未明确选择前，不得进入 A-3。

## A-3｜归一化并持久化证据

- xhs：先通过 `xhs-evidence-builder.mjs` 规范化：

```bash
node {baseDir}/scripts/xhs-evidence-builder.mjs \
  --input=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/xhs-raw.json
```

- 所有平台统一持久化（`RouteEvidence`）：

```bash
node {baseDir}/scripts/trip-workflow.mjs --cmd=save_route_evidence \
  --trip-id=<trip_id> --platform=<xhs|search> \
  --payload=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/step3.route-evidence.json
```

守卫：`save_route_evidence` 返回 `ok=true` 才能继续，否则终止并报告失败原因。

后续需要 evidence 路径时：
- 调用 `get_route_evidence` 读取返回 JSON 中的 `meta.evidence_file`（或 `get_trip` 的 `route_evidence_meta.evidence_file`）
- 不要再落盘 `step4.evidence-meta.json`

## A-3.5｜POI 预取（强制，不可跳过）

目的：在路线生成前完成图片/坐标预取，保证第一次输出可带图。

目录约定：
- POI 临时产物：`data/poi/`
- 路线中间产物：`data/trips/<trip_id>/`（如 `step4.plan-input.json`、`step4.plan-output.json`）
- trip 长期数据：`data/trips/<trip_id>/`

### A-3.5-1 批量查 POI 缓存

```bash
node {baseDir}/scripts/poi-cache.mjs --cmd=get --keys='["四姑娘山","新都桥","丹巴"]'
```

### A-3.5-2 misses 走 flyai search-poi，并写回缓存

```bash
flyai search-poi --city-name "<目的地城市>" --keyword "<景点名>"
```

```bash
node {baseDir}/scripts/poi-cache.mjs --cmd=save --ttl-hours=72 --payload='{"entries":{"四姑娘山":{"key":"四姑娘山","name":"四姑娘山","evidence_name":"四姑娘山","source_poi_name":"四姑娘山景区","image":"https://...","subtitle":"...","lat":31.08,"lng":102.84}}}'
```

要点：
- 图片提取优先级：`mainPic -> picUrl -> image -> imageUrl -> photo`
- flyai 无图：只存 `subtitle`+坐标，`image` 留空（不得伪造 URL）
- 从 `itemList` 中选名称最匹配条目（首条不一定匹配）
- payload 过长（>5KB）时写入 `data/poi/cache-upserts.json` 再用 `@file` 传入；A-8 后清理

### A-3.5-3 生成 `step4.plan-input.json`

要求：
- **优先**用 `stop_media/stop_points`（平铺，key=景点名），保证首次生成路线 UI 就能命中图片/坐标
- 如需对某条路线做更精确的图文/坐标覆盖，可额外提供 `route_stop_media/route_stop_points`（按 `route_id` 分组）；其优先级高于平铺字段

结构示意：

```json
{
  "stop_media": {
    "四姑娘山": { "image": "https://...", "subtitle": "四川省..." }
  },
  "stop_points": {
    "四姑娘山": { "lat": 31.08, "lng": 102.84, "label": "四姑娘山" }
  },
  "count": 9
}
```

## A-4｜调用 `route-plan.mjs`

组装写入 `data/trips/<trip_id>/step4.plan-input.json`，输出到 `step4.plan-output.json`：

```bash
mkdir -p ~/.openclaw/agents/travel-planner/data/trips/<trip_id>
node {baseDir}/scripts/route-plan.mjs \
  --input=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/step4.plan-input.json \
  > ~/.openclaw/agents/travel-planner/data/trips/<trip_id>/step4.plan-output.json
```

强制约束：
- 禁止内联 evidence 字符串：必须读取 `get_route_evidence` 返回的 `meta.evidence_file` 对应文件内容后赋值
- 推荐媒体/坐标字段同时支持两种形态：
  - 平铺：`stop_media/stop_points`
  - route scoped 覆盖：`route_stop_media/route_stop_points`
- `popular_loops/key_destinations` 必须包在 `route_evidence` 对象内

输出检查：
- `route_tool_ui_ready=true` -> 进入 A-5
- `false + no_stops` -> 修正 evidence 后重试（最多一次）
- flyai 全无图 -> 允许纯文本降级，仍可进入 A-5

## A-5｜渲染图文路线

按 `route_tool_ui`：
1. `item_carousel` 展示图文卡片
2. 保留文字版路线摘要作为降级兜底

若 `option_list_allowed=false`：禁止发起 `option_list`；严格按 `step4_tool_call_order`。

## A-6｜持久化路线规划（save_route_plan）

守卫（必须同时满足）：
- `save_route_evidence` 已 `ok=true`
- `route_options.length >= 2`

```bash
node {baseDir}/scripts/trip-workflow.mjs --cmd=save_route_plan \
  --trip-id=<trip_id> \
  --plan-output=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/step4.plan-output.json \
  --rejected-routes='[]' \
  --decision-summary='{"used_platform":"search","fallback_count":0}' \
  --route-source-used=<xhs|search> \
  --route-source-preference=<xhs|search> \
  --route-source-fallbacks='[]'
```

失败时：只报告原因与下一步动作，不得伪造“已确认路线”。

## A-7｜让用户选择路线

图文渲染后再发起 `option_list`（payload 见 `examples/option-list.route-choice.json`）。

约束：
- `options[].id` 与 `label` 必须使用真实 `route_id`（不得造映射 ID）
- 若用户已在本轮明确说出 `route_id`，可直接采用

## A-8｜持久化用户选择 + 清理临时文件

守卫：用户已明确选中 `route_id` 后才能执行。

```bash
node {baseDir}/scripts/trip-workflow.mjs --cmd=confirm_route_choice \
  --trip-id=<trip_id> --route-id=<route_id>
```

`ok=true` 后清理 POI 临时文件（不删除 step4 input/output）：

```bash
rm -f ~/.openclaw/agents/travel-planner/data/poi/cache-upserts.json
```
