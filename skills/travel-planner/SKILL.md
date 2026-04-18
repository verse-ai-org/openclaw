---
name: travel-planner
description: "中文旅行规划技能。用于偏好记录、路线规划、目的地调研、每日行程、交通与住宿策略、预算与行前清单。用户提到行程规划、路线选择、出行预算、酒店交通组合、行中改线重排时触发。"
license: MIT
metadata:
  openclaw:
    emoji: "✈️"
    requires:
      bins:
        - node
---

# Travel Planner
中文旅行规划技能。用于偏好记录、路线规划、目的地调研、规划每日行程、交通酒店策略、预算打包、行前/在途调整。

## 适用范围

- 行程规划、路线规划、路线对比、制定每日计划、交通酒店组合策略
- 与真实行程绑定的预算、打包、礼仪、安全、行前清单
- 行中改线、错过交通后的重排与当天应急建议

## 不适用范围

- 仅单点天气/冷知识问答（无行程决策）
- 非旅行类技术任务
- 纯创作型内容（无出行决策/执行）

## 核心原则

- 路线正确性优先于景点堆叠。
- 先问最少但高影响的问题，不做超长问卷。
- 到达日与返程日默认轻负荷。
- 地点、天气、酒店、路程、交通要保证真实性。
- 每天最多“1 个主锚点 + 1 个附近备选”。
- 把体力、天气、换乘摩擦作为硬约束。
- 大区域目的地先“路线框定”，再展开每日计划。

## 工作流

### 第一步：读取偏好

#### 执行命令
```bash
node {baseDir}/scripts/preferences.mjs --cmd=is_initialized
```

- 若返回 `false`：进入轻量偏好采集。
- 若返回 `true`：读取已有偏好，仅补本次行程缺口。

#### 配置文件路径
- Preferences: `~/.openclaw/agents/travel-planner/preferences.json`、
- Trips: `~/.openclaw/agents/travel-planner/trips.json`

### 第二步：轻量偏好采集

**只问高影响项**。在 Control UI 会话中，**必须调用 `question_flow` 工具**（而非直接输出文字问答），让前端渲染交互式问卷卡片。

**必须遵守**：在同一轮助手输出中完成：先写一两句面向用户的说明，再调用`question_flow`。

#### 执行方式：调用 `question_flow` 工具

调用 `question_flow` 工具并返回以下 JSON 作为工具结果：

```json
{
  "id": "travel-preference-intake",
  "steps": [
    {
      "id": "departure_city",
      "title": "出发城市",
      "description": "你从哪里出发？",
      "options": [
        { "id": "beijing",   "label": "北京" },
        { "id": "shanghai",  "label": "上海" },
        { "id": "guangzhou", "label": "广州" },
        { "id": "shenzhen",  "label": "深圳" },
        { "id": "chengdu",   "label": "成都" },
        { "id": "other",     "label": "其他城市（请在下一条消息中说明）" }
      ],
      "selectionMode": "single"
    },
    {
      "id": "budget",
      "title": "预算档位",
      "options": [
        { "id": "economy",   "label": "经济型（¥150-250/天）" },
        { "id": "mid-range", "label": "中档（¥350-600/天）" },
        { "id": "high-end",  "label": "高端（¥800+/天）" }
      ],
      "selectionMode": "single"
    },
    {
      "id": "pace",
      "title": "出行节奏",
      "options": [
        { "id": "relaxed",   "label": "轻松（每天1-2个景点）" },
        { "id": "moderate",  "label": "适中（每天2-3个景点）" },
        { "id": "intensive", "label": "紧凑（多景点快节奏）" }
      ],
      "selectionMode": "single"
    },
    {
      "id": "companions",
      "title": "同行结构",
      "options": [
        { "id": "solo",   "label": "独行" },
        { "id": "couple", "label": "情侣/双人" },
        { "id": "family", "label": "家庭（含老人/小孩）" },
        { "id": "group",  "label": "多人朋友团" }
      ],
      "selectionMode": "single"
    },
    {
      "id": "interests",
      "title": "核心兴趣",
      "description": "可多选",
      "options": [
        { "id": "nature",      "label": "🏔️ 自然风光（草原、雪山、沙漠、湖泊）" },
        { "id": "culture",     "label": "🕌 人文历史（古城、丝绸之路遗迹）" },
        { "id": "food",        "label": "🍜 美食探索" },
        { "id": "photography", "label": "📸 摄影打卡" },
        { "id": "shopping",    "label": "🛒 集市购物" }
      ],
      "selectionMode": "multi"
    },
    {
      "id": "transport",
      "title": "交通偏好",
      "description": "可多选",
      "options": [
        { "id": "self_drive",    "label": "自驾" },
        { "id": "private_car",   "label": "包车/司机" },
        { "id": "public",        "label": "公共交通" },
        { "id": "short_flight",  "label": "短途国内航班可接受" }
      ],
      "selectionMode": "multi"
    }
  ]
}
```

#### 解析用户回答

用户完成问卷后，回答以纯文本形式到达，每步一行，格式为 `步骤标题：选中选项标签`。从中提取字段，忽略空行。

> 预算分配比例与节奏设计细则见 `references/travel_guidelines.md`。

保存时仅写入用户已明确提供的字段：

```bash
node {baseDir}/scripts/preferences.mjs --cmd=save_preferences --payload='{"departure_city":"上海","budget_level":"mid-range","pace_preference":"moderate","travel_companions":"couple","interests":["nature","food","photography"],"transport_preferences":["private driver","short flight okay"],"walking_tolerance":"moderate"}'
```

### 第三步：创建 trip 记录

**硬守卫（不可跳过）**：在执行 `add_trip` 之前，必须先查询是否有进行中的行程：

```bash
node {baseDir}/scripts/trips.mjs --cmd=get_active_trips
```

- 若返回 `active_trips` 为空数组：直接新建。
- 若返回有 1 条或多条：**必须询问用户**，示例措辞：

  > 我发现你有 [N] 个进行中的行程：
  > 1. [destination_text]，[duration_days] 天，当前阶段：[stage]
  > 2. ...
  >
  > 是继续规划其中某个，还是开始一个新的行程？

  - 用户选择**继续**：记录对应 `trip_id`，跳过 `add_trip`，直接进入下一步。
  - 用户选择**新建**：继续执行 `add_trip`。
  - **不得在用户明确回答前自行判断或跳过此问**。

尽快建档，允许字段不完整：

```bash
node {baseDir}/scripts/trips.mjs --cmd=add_trip --payload='{"destination_text":"新疆","destination":{"region":"Xinjiang","country":"China"},"duration_days":7,"budget":{"total":14000,"currency":"CNY"},"travelers":2,"activities":["nature","photography"],"constraints":["不自驾"],"transport_preferences":["private driver","short domestic flight okay"],"stage":"intake"}' --list=current
```

记录返回的 `trip_id`，后续都用 `--trip-id=<id>`。

### 第四步：路线规划

#### 目标

- 使用外部平台（小红书 / 搜索）为用户生成 2-3 条带 `route_id` 的候选路线，并要求用户确认选择。
- 路线框定以内容驱动为主，支持用户手动粘贴内容作为证据。
- 所有脚本参数中的大 JSON 必须通过 `@file` 方式传递，禁止直接内联超长 JSON。

> 完整字段说明与 JSON 示例见 `references/route-protocol.md`。

#### 执行主干（严格按序，不可跳步）

---

**A-1｜平台选择（等用户回答后才能继续）**

调用 `option_list` 工具，先写一两句面向用户的说明，再发出以下选择器：

```json
{
  "id": "route-platform-choice",
  "options": [
    { "id": "search", "label": "搜索（全网搜索，推荐）" },
    { "id": "xhs",    "label": "小红书（抄作业，有登录流程）" }
  ],
  "selectionMode": "single"
}
```

守卫：
- 必须等用户回答，不得自行跳过。例外：用户已在本轮明确说出"默认/按搜索/用小红书"等等效词。
- 未指定时默认 `search`（Brave）。
- 降级（`xhs -> search`）时必须显式提示"已从小红书降级到搜索"并说明原因。

---

**A-2｜拉取平台证据**

按所选平台执行，任一分支失败按 A-2-F 处理：

- **search**：使用搜索引擎检索路线证据，结果写入 `route_evidence.route_hints`（`key_destinations` 或 `popular_loops`）。
- **xhs**：调用 `@skills/xiaohongshu` 的 `search-feeds` + `get-feed-detail`：
  - 查询词：`J人<目的地><days>天行程安排`
  - 过滤：`--note-type 图文 --sort-by 最多点赞`，只保留前 2-3 条图文笔记。
  - 若 `get-feed-detail` 失败 / 超时 / 返回空，跳至 **A-2-F**。
- **用户手动粘贴**（xhs/search 均适用）：直接作为证据，标记 `verification_status=user_input_unverified`，`evidence_source=user_input_xhs|user_input_search`。

**A-2-F｜xhs 异常分流**（`get-feed-detail` 不可用时）

必须向用户发起二选一确认（不得静默继续）：
1. 用户手动提供小红书内容 -> 走"用户手动粘贴"分支，标记 `evidence_source=user_input_xhs`
2. 切换到搜索 -> 记录 `fallback_reason=xhs_detail_unavailable`，提示"已降级到搜索"，重新走 search 链路

用户未明确选择前，不得进入 A-3。

---

**A-3｜归一化并持久化证据**

- xhs：先通过 `xhs-evidence-builder.mjs` 规范化：

```bash
node {baseDir}/scripts/xhs-evidence-builder.mjs \
  --input=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/xhs-raw.json
```

- 所有平台统一持久化（`RouteEvidenceV1`），不得平台私有化绕过。`--payload` 指向 **当前 trip 目录下** 待提交的规范化 JSON（与最终落盘的 `evidence.<platform>.json` 不同：后者由 `save_route_evidence` 写入）。

```bash
node {baseDir}/scripts/trip-workflow.mjs --cmd=save_route_evidence \
  --trip-id=<trip_id> --platform=<xhs|search> \
  --payload=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/step3.route-evidence.json
```

守卫：`save_route_evidence` 返回 `ok=true` 才能继续，否则终止并报告失败原因。

- 后续步骤需要 evidence 路径时，调用 `get_route_evidence` 读取返回 JSON 中的 `meta.evidence_file`（或 `get_trip` 结果里的 `route_evidence_meta.evidence_file`），**不要**再落盘 `step4.evidence-meta.json`。

---

**A-3.5｜POI 预取（A-3 完成后立即执行，强制，不可跳过）**

> evidence 文件中的 `route_hints.key_destinations` 已是所有路线景点的去重合集（由 `popular_loops` flat 后去重生成），在路线生成前完成图片预取，保证 A-4 第一次调用就能输出带图的路线。

**目录约定**：
- POI 临时产物写入 `data/poi/` 子目录
- 路线中间产物直接写入 `data/trips/<trip_id>/`（如 `step4.plan-input.json`、`step4.plan-output.json`；`step4.stop-media.json` 仅调试时可选保留）
- trip 级长期数据统一写入 `data/trips/<trip_id>/`（含 `trip.json`、`evidence.<platform>.json`、`step*.json`）

**A-3.5-1** 读取 evidence 中的景点列表，批量查 POI 缓存（key 直接使用 evidence 地名作为主键）：

```bash
node {baseDir}/scripts/poi-cache.mjs --cmd=get --keys='["四姑娘山","新都桥","丹巴"]'
```

**A-3.5-2** 对缓存未命中（`misses`）的每个景点调用 `flyai search-poi`，选最匹配条目后，**一步写入缓存**：

```bash
flyai search-poi --city-name "<目的地城市>" --keyword "<景点名>"
```

```bash
node {baseDir}/scripts/poi-cache.mjs --cmd=save --ttl-hours=72 --payload='{"entries":{"四姑娘山":{"key":"四姑娘山","name":"四姑娘山","evidence_name":"四姑娘山","source_poi_name":"四姑娘山景区","image":"https://...","subtitle":"...","lat":31.08,"lng":102.84}}}'
```

- 图片提取优先级：`mainPic -> picUrl -> image -> imageUrl -> photo`
- flyai 无图时该景点只保存 `subtitle` + 坐标，`image` 留空（不得伪造 URL）
- 景点名应使用 `key_destinations` 中的规范短名（如"四姑娘山"），避免使用含描述的长名
- flyai 返回首条不一定名称最匹配（如搜"丹巴"可能首条是无关景点），需从 `itemList` 中选名称含景点关键字的条目
- 缓存写入时 `name/evidence_name` 使用 evidence 地名；flyai 命中名称写入 `source_poi_name` 仅用于来源追踪
- entries 过长（>5KB）时写入 `data/poi/cache-upserts.json`（临时）再用 `@file` 传入，A-8 后清理

**A-3.5-3** 所有景点写入缓存后，直接生成 `step4.plan-input.json`（内含 `stop_media` + `stop_points` 平铺映射）。默认不再强制落 `step4.stop-media.json`：

```bash
mkdir -p ~/.openclaw/agents/travel-planner/data/trips/<trip_id>
# 1) 先产出 stop-media JSON 到临时变量/临时文件（可管道）
node {baseDir}/scripts/poi-cache.mjs --cmd=build-stop-media --destination="川西" > /tmp/stop-media.json

# 2) 组装进 step4.plan-input.json（包含 route_evidence + stop_media + stop_points）
# route_evidence 必须读取 get_route_evidence 返回的 meta.evidence_file 文件内容
```

> 调试需要时，可额外保存一份 `data/trips/<trip_id>/step4.stop-media.json` 作为快照；不是主流程必需产物。

输出结构：

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

> `stop_media` key 直接是景点名；**不要按 route_id 分组**，否则 `route-plan` 用内部生成的 route_id 查会全部 miss。


**A-4｜调用 route-plan.mjs（一次调用生成带图路线）**

将 evidence + **A-3.5-3 生成的 `stop_media` / `stop_points`** 组装写入 `data/trips/<trip_id>/step4.plan-input.json`，输出到 `data/trips/<trip_id>/step4.plan-output.json`：

```bash
mkdir -p ~/.openclaw/agents/travel-planner/data/trips/<trip_id>
node {baseDir}/scripts/route-plan.mjs \
  --input=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/step4.plan-input.json \
  > ~/.openclaw/agents/travel-planner/data/trips/<trip_id>/step4.plan-output.json
```

`data/trips/<trip_id>/step4.plan-input.json` 格式（`route_evidence` 必须按 `get_route_evidence` 返回的 `meta.evidence_file` 读取文件内容后赋值，不得手动粘贴）：

```json
{
  "destination_text": "川西",
  "duration_days": 5,
  "route_evidence": { "<evidence 文件内容，完整读取 meta.evidence_file 对应文件后赋值>" },
  "stop_media": {
    "四姑娘山":   { "image": "https://...", "subtitle": "..." },
    "新都桥":     { "image": "https://...", "subtitle": "..." }
  },
  "stop_points": {
    "四姑娘山": { "lat": 31.08, "lng": 102.84, "label": "四姑娘山" }
  }
}
```

- **禁止内联 evidence 字符串**：必须读取 `get_route_evidence` 返回的 `meta.evidence_file` 对应文件内容后赋值，不得手动粘贴 evidence 内容
- **媒体字段必须用 `stop_media`（平铺结构）**，不得用 `route_stop_media`（按 route_id 分组），否则因 route_id 不匹配导致全部无图
- **不得手动传散列的 `popular_loops` / `key_destinations` 字段**，必须包在 `route_evidence` 对象内

读取 `data/trips/<trip_id>/step4.plan-output.json` 中的 `route_tool_ui_ready`：

- `true` -> 继续 **A-5**
- `false`，且 `route_tool_ui_missing_reason = no_stops` -> 检查 evidence 的 `popular_loops` 是否为空，修正后重新执行 A-4（最多重试一次）
- `false` 且 flyai 全无图 -> 以纯文本卡片降级，继续 **A-5**

---

**A-5｜渲染图文路线**

按 `route_tool_ui` 结构调用工具（每条 route 一组，顺序固定）：

1. `item_carousel`：展示路线点位图文卡片
2. 保留文字版路线摘要作为降级兜底

`option_list_allowed=false` 时禁止调用 `option_list`；严格按 `step4_tool_call_order` 执行工具顺序。

---

**A-6｜持久化路线规划**

守卫（必须同时满足，否则不得继续）：
- `save_route_evidence` 已返回 `ok=true`
- `route_options` 数量 `>= 2`

统一从 `data/trips/<trip_id>/step4.plan-output.json.route_options` 读取：
- `route_options[0]` 作为推荐路线（recommended）
- `route_options[1..]` 作为备选路线（alternatives）

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

> 存储约定：`route_plan` 内只保存 `recommended_route_id / alternative_ids / rejected_route_ids` 等轻量字段；**完整 Step4 结果（含 `route_options`、`route_tool_ui` 等）以 `step4.plan-output.json` 为准**，`trip.json` 使用 `step4_plan_output_ref` 指向该文件；**不再**单独生成 `step4.route-options.json`。

`save_route_plan` 返回失败时，只报告原因和下一步动作，不得伪造"已确认路线"。当 `xhs` 走"用户手动提供内容"分支时，`decision_summary` 和回复中必须标注 `evidence_source=user_input_xhs`、`verification_status=unverified_by_xhs_tool`。

---

**A-7｜让用户选择路线**

`item_carousel` 渲染完成后，调用 `option_list`（必须在图文展示之后，不得提前）：

```json
{
  "id": "route-choice",
  "options": [
    { "id": "route-a", "label": "route-a" },
    { "id": "route-b", "label": "route-b" },
    { "id": "route-c", "label": "route-c" }
  ],
  "selectionMode": "single"
}
```

- `options[].id` 和 `label` 必须使用真实的 `route_id`，不得另造映射 ID。
- 若用户已在本轮明确说出 `route_id`，可直接采用，无需重复发起 `option_list`。

---

**A-8｜持久化用户选择 + 清理临时文件**

守卫：用户已通过 `option_list` 明确选中 `route_id` 后才能执行。

```bash
node {baseDir}/scripts/trip-workflow.mjs --cmd=confirm_route_choice \
  --trip-id=<trip_id> --route-id=<route_id>
```

`confirm_route_choice` 返回 `ok=true` 后，**清理 POI 侧临时文件**（不删除 `step4.plan-input.json` / `step4.plan-output.json`）：

```bash
# 清理 POI 临时文件（保留 poi-cache.json 长期缓存）
rm -f ~/.openclaw/agents/travel-planner/data/poi/cache-upserts.json
```

清理后 `data/` 根目录只保留共享缓存与索引（如 `poi-cache.json`、`trips.json`、`preferences.json`）；trip 长期数据保留在 `data/trips/<trip_id>/`。

#### 降级链与平台守卫

| 场景 | 行为 |
|------|------|
| `route_source_preference=auto` | 先走搜索（Brave），仅用户明确指定时才走小红书优先 |
| 平台降级 `xhs->search` | 显式提示"已降级到搜索"，记录 `fallback_reason` |
| 两个平台均失败 | 不得给"最终路线"，只返回失败原因 + 用户可采取的动作 |
| 用户同意后的临时草案 | 必须标注"未验证" |
| 不允许并行混合多个平台结果 | — |

#### 回复格式核心要点

> 完整回复顺序规范、xhs 失败分流提示模板、小红书链接展示格式见 `references/reply-templates.md`。

- 先输出平台与降级信息：`used_platform`、`fallback_count`、`fallback_reason`
- 给出 2-3 条 `route_id` 路线选项，每条 1 行权衡（时间成本/换乘压力/景观收益）
- 候选路线选择阶段必须用 `option_list` 让用户点选具体 `route_id`
- 最后说明下一步将调研目的地的交通与天气情况

### 第五步：验证交通天气 + 确认计划骨架

#### 目标

- 调研出发交通与关键站点天气，输出 `verdict`（go / caution / block）。
- 调研完成后立即生成计划骨架并一次性输出，等待用户确认。

#### 进入条件

- `route_choice_confirmed=true` 且 `chosen_route_id` 已存在。

#### 执行主干（严格按序，不可跳步）

---

**B-1｜读取路线数据**

从 `step4.plan-output.json` 的 `route_options` 中取出 `chosen_route_id` 对应路线，读取 `stops` 列表。从 `trip.departure_city` 或 `preferences.departure_city` 确定出发城市。

---

**B-2｜调研进入段交通**（出发城市 ≠ `stops[0]` 时执行）

- 跨省或距离 > 500km：
  - 用 `flyai search-flight --origin <出发城市> --destination <stops[0]> --dep-date <departure_date>` 查询航班；
  - 用 `flyai search-train --origin <出发城市> --destination <stops[0]> --dep-date <departure_date>` 查询高铁；
  - 从各结果 `itemList` 中取前 2 条最优选项，提取 `jumpUrl`、航班号/车次、价格存入 `booking_links`。
- 同省或距离 ≤ 500km：
  - 使用 `@skills/amap-lbs-skill` 评估驾车/高铁可行性；
  - 高铁可行时仍用 `flyai search-train` 补充查询并提取 `jumpUrl`。

将查询结果写入 `transport_result`，记录字段：
- `status`：`ok` / `unavailable` / `not_required`
- `mode`：`flight` / `train` / `drive` / `mixed`
- `booking_links`：从 `itemList` 提取前 2 条最优结果，格式为 `[{ "label": "航班/车次描述", "url": "jumpUrl 原值", "price": "¥xxx" }]`
- `raw`：完整原始返回（供 plan-generator 读取）

---

**B-3｜调研游览段转场**（仅 `trip.constraints` 包含「自驾」时执行）

使用 `@skills/amap-lbs-skill` 查询 `stops` 中关键相邻站点的驾车时长。单日转场 > 4 小时须在骨架中标注提醒。不含「自驾」约束时跳过此步。

---

**B-4｜调研天气**（始终执行）

从 `stops` 中选 2-3 个代表性地点（首站、中间高海拔或偏远站、末站），使用 `@skills/weather` 查询各地点在 `trip.departure_date ~ trip.return_date` 内的天气预报。

写入 `weather_result.raw`，裁决 `status`：
- `go`：无明显风险
- `caution`：2 天以上连续强降雨/大雪/风力预警，或极端高温/低温影响户外活动
- `block`：核心路段（如折多山、高原公路）因天气存在通行安全风险

---

**B-5｜综合裁决并持久化**（必须在输出前完成）

综合 B-2/B-3/B-4 结果，写入 `verdict` 和 `verdict_reasons`，将完整结构写入临时文件后持久化：

```bash
node {baseDir}/scripts/trips.mjs --cmd=patch_trip \
  --trip-id=<trip_id> \
  --payload=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/step5.route-validation.json
```

`route_validation` 结构：

```json
{
  "stage": "validated",
  "transport_result": {
    "status": "ok",
    "mode": "flight",
    "booking_links": [
      { "label": "成都→稻城（CA4506）经济舱", "url": "https://...", "price": "¥680" },
      { "label": "成都→稻城（3U8876）经济舱", "url": "https://...", "price": "¥720" }
    ],
    "raw": {}
  },
  "weather_result": { "locations_checked": ["成都","四姑娘山","康定"], "status": "caution", "raw": {} },
  "verdict": "caution",
  "verdict_reasons": ["5月初四姑娘山有降雪风险"],
  "checked_at": ""
}
```

---

**B-6｜生成计划骨架**（B-5 持久化成功后立即执行）

```bash
node {baseDir}/scripts/plan-generator.mjs --cmd=plan_overview --trip-id=<trip_id>
```

> 强制落盘 `data/trips/<trip_id>/step6.plan-overview.json`，不可省略。

读取返回的 `step6_summary` 字段用于渲染：
- `step6_summary.route_overview_text`
- `step6_summary.daily_overview[]`
- `step6_summary.transport_snapshot`
- `step6_summary.weather_table_rows[]`

---

**B-7｜输出骨架卡片并等待用户确认**

回复必须严格按以下顺序输出，不得改名、不得省略：

1. `路线总览：<完整链路，用 → 连接>`
2. `交通情况：`
   - 按 `mode` 输出：`机票：...` / `高铁：...` / `自驾：...`
   - 每个已验证方案下方附预订跳转链接，取自 `transport_result.booking_links[]`，格式：`[点击预订]({url})`（每个选项单独一行）
   - 未验证项必须显式写"暂无已验证...信息"
3. `天气情况：`（主锚点天气表格，列：Day / 地点 / 日期 / 天气 / 温度 / 风险）
4. verdict 为 `block` 时：末尾显著标注安全风险，征询用户是否继续。

守卫：骨架展示后等待用户明确确认（如"确认/继续/按这个走"），未确认不得进入第六步。

#### 兜底处理

| 失败项 | 处理 |
|--------|------|
| `flyai` / `amap-lbs-skill` 失败 | 标注交通为"未验证"，`status=unavailable`，继续生成骨架 |
| `weather` 失败 | 标注天气为"未验证"，verdict 降级为 `caution`，继续生成骨架 |
| 两项均失败 | 骨架仍可生成，所有验证项标注"未验证"，在骨架末尾说明 |

> 完整对话示例见 `references/example_dialogue.md`；触发/不触发回归场景见 `references/trigger_regression.md`。

### 第六步：生成每日计划详情

#### 目标

- 基于已确认的路线和 Step 5 验证结论，按天生成可执行的计划骨架。
- 给出每天的去向、节奏、住宿区域，不含具体班次和预订信息。

#### 进入条件

- 用户已对 Step 5 骨架明确确认。

#### 执行主干（严格按序，不可跳步）

---

**C-1｜生成每日骨架**

```bash
node {baseDir}/scripts/plan-generator.mjs --trip-id=<trip_id> --cmd=itinerary_skeleton
```

---

**C-2｜输出每日计划**

按天输出，每天必含以下字段：

- 主目标（核心景区/区域）
- 次目标（可选备选点）
- 建议出发时段（上午/下午/全天）
- 关键转场说明（长途/短途，不给具体班次）
- 体力负荷（轻松/适中/紧凑）
- 天气风险提醒（来自 Step 5 验证结果）
- 住宿区域（不给具体酒店，详细推荐在 Step 7）

#### 禁止事项

- 不输出机票/高铁班次候选
- 不输出酒店名称或预订链接
- 不给"可直接下单"结论

完成本步后询问用户是否进入 Step 7（补齐交通酒店细节）。

> 回复格式细节见 `references/reply-templates.md` — 第六步。

### 第七步：制定每日计划详情

#### 目标

- 基于 Step 6 每日骨架，通过实时查询补齐每日的具体交通方案与住宿候选。
- 所有推荐必须来自实时查询，不得臆造价格、班次、库存、评分。

#### 进入条件

- 用户已确认进入 Step 7。
- Step 6 的每日计划骨架已存在。

#### 执行主干（严格按序，不可跳步）

---

**D-1｜实时查询交通与住宿**

按每日骨架的转场节点逐段查询：

- 进入段航班：复用 Step 5 `transport_result.booking_links` 中的结果（已含 `jumpUrl`）；若用户要求重新查询则调用 `flyai search-flight --origin <出发城市> --destination <stops[0]> --dep-date <departure_date>`
- 游览段驾车/接驳：`@skills/amap-lbs-skill`（含自驾约束时）
- **每日住宿**（核心，按天逐一查询）：

```bash
flyai search-hotel --dest-name <当晚住宿城市> \
  --check-in-date <YYYY-MM-DD> --check-out-date <次日YYYY-MM-DD> \
  --sort rate_desc
```

- 餐饮/POI：`flyai search-poi --city <城市> --keyword <关键词>`

查询结果按天组装写入 `step7.live-results.json`：

```json
{
  "hotels_by_day": [
    {
      "day": 1,
      "city": "成都",
      "date": "2026-05-01",
      "raw": { "<flyai search-hotel 原始返回>" }
    },
    {
      "day": 2,
      "city": "康定",
      "date": "2026-05-02",
      "raw": { "<flyai search-hotel 原始返回>" }
    }
  ],
  "flights": { "<B-2 transport_result 中 booking_links 原样复用>" },
  "pois": {},
  "dining": {}
}
```

守卫：任一类查询失败时，必须标注该类为"未实时验证"，不得用经验数据填充。

---

**D-2｜生成 booking-ready 包并持久化**

```bash
node {baseDir}/scripts/booking-ready.mjs \
  --trip=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/trip.json \
  --route=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/step4.plan-output.json \
  --validation=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/step5.route-validation.json \
  --results=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/step7.live-results.json

node {baseDir}/scripts/trip-workflow.mjs --cmd=save_live_results \
  --trip-id=<trip_id> \
  --payload=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/step7.live-results.json

node {baseDir}/scripts/trip-workflow.mjs --cmd=save_booking_ready \
  --trip-id=<trip_id> \
  --payload=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/step7.booking-ready.json
```

---

**D-3｜输出详细每日计划**

在 Step 6 骨架基础上补充，输出分为两层：

**层一：按天嵌入（每天末尾）**

每天输出完景点/活动内容后，紧接着输出住宿推荐区块：

```
🏨 今晚住宿推荐（{城市}）
  1. {酒店名}  {价格}/晚  ★{评分}  {区域说明}
     [点击查看]({detailUrl})
  2. {酒店名}  {价格}/晚  ★{评分}
     [点击查看]({detailUrl})
```

- 每天最多展示 2 个候选，取 `hotels_by_day[day].candidates`
- 无可用链接时标注：`暂无实时链接，建议搜索"{酒店名}"`
- 每日交通：若当天有转场，给出推荐班次/路线 + 1 个备选（来自实时查询）

**层二：末尾汇总表（所有天完成后输出一次）**

```markdown
## 住宿 & 交通汇总

| Day | 城市   | 日期  | 推荐住宿         | 参考价    | 链接              |
|-----|--------|-------|------------------|-----------|-------------------|
| D1  | 成都   | 05-01 | 锦里精品民宿     | ¥320/晚   | [预订](...)       |
| D2  | 康定   | 05-02 | 情歌主题酒店     | ¥380/晚   | [预订](...)       |

| 交通        | 班次/方式  | 出发时间 | 参考价 | 链接          |
|-------------|------------|----------|--------|---------------|
| 进入段（机票） | CA4506   | 08:00    | ¥680   | [预订](...)   |
```

数据来源：`booking-ready.mjs` 返回的 `accommodation_summary_table` 和 `transport_options`。

- 注明哪些项"未实时验证"

---

**D-4｜持久化用户确认的预订项**（用户选定后执行）

```bash
node {baseDir}/scripts/trip-workflow.mjs --cmd=confirm_booking \
  --trip-id=<trip_id> --category=hotel \
  --payload=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/step7.booking-confirmed.json
```

> 行前清单、打包建议、安全应急细则见 `references/travel_guidelines.md`。
> 礼仪与文化注意事项见 `references/cultural_etiquette.md`。
> 回复格式细节见 `references/reply-templates.md` — 第七步。

### 第八步：行中支持

#### 目标

- 在用户出行途中，响应突发情况，给出实时调整建议；并在用户确认后启动每日行程卡片推送。

#### 进入条件

- 用户已出发（或明确表示正在行程中）。

#### 执行主干

---

**E-1｜标记出发**

```bash
node {baseDir}/scripts/trip-workflow.mjs --cmd=start_trip --trip-id=<trip_id>
```

---

**E-2｜确认每日行程卡片推送**

进入行中支持后，**必须先向用户提问**：

> 要不要每天早上 8 点给你发一张当日行程卡片到微信？方便随时查看当天安排。

守卫：
- 必须等用户明确回答（“要”/“不用”）后才能继续，不得自行跳过或默认开启。
- 用户拒绝时跳过本节点，直接进入 E-3。

用户确认后，提取当前会话的微信用户 ID（`delivery.to`），然后执行：

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

> 注意：`--to` 必须使用当前对话中用户的微信 ID（`xxx@im.wechat` 格式）。若为多账号环境，需额外指定 `accountId`：
>
> ```bash
> openclaw cron edit <jobId> --set 'delivery.accountId=<AccountId>'
> ```

创建成功后，告知用户：

> ✅ 已设置每日推送！从明天起每天早上 8 点发送当日行程卡片。如需取消，发送“取消行程推送”即可。

用户要求取消时，执行：

```bash
openclaw cron list   # 找到任务 ID
openclaw cron delete <jobId>
```

---

**E-3｜按场景响应**

| 场景 | 处理方式 |
|------|----------|
| 天气突变/路段封闭 | 调用 `@skills/weather` 重新查询，给出改线建议（替换受影响的 stop） |
| 误车/误点 | 调用 `@skills/amap-lbs-skill` 或 `flyai search-flight` 查补救方案，重排当日计划 |
| 附近备选点位 | 调用 `flyai search-poi` 查当前位置附近景点/餐饮 |
| 当日简报 | 生成当日行程摘要与天气/路况提醒 |

---

**E-4｜生成简报**

```bash
# 出发前简报
node {baseDir}/scripts/briefing.mjs --mode=pre_trip \
  --trip=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/trip.json \
  --plan=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/step6.plan-overview.json

# 每日简报（与 cron 推送内容一致，可手动触发）
node {baseDir}/scripts/briefing.mjs --mode=daily \
  --trip=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/trip.json \
  --plan=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/step6.plan-overview.json \
  --day=<N>
```

### 第九步：行后沉淀

#### 目标

- 归档行程，更新用户偏好，为下次规划提供更准确的初始数据。

#### 执行主干

---

**F-1｜归档行程**

```bash
node {baseDir}/scripts/trips.mjs --cmd=move_to_past --trip-id=<trip_id>
```

---

**F-2｜更新已访问目的地**

```bash
node {baseDir}/scripts/preferences.mjs --cmd=add_previous_destination \
  --payload='{"destination": "<城市, 国家>"}'
```

---

**F-3｜更新复用偏好**

根据本次行程的真实反馈，更新以下字段后调用 `save_preferences` 写入：

- `pace_preference`：实际节奏是否与预设匹配
- `hotel_style`：住宿风格偏好（民宿/连锁/精品）
- `hotel_switch_tolerance`：是否厌恶频繁换酒店
- `interests`：兴趣权重变化（如实际对摄影兴趣更高）

```bash
node {baseDir}/scripts/preferences.mjs --cmd=save_preferences \
  --payload='{"pace_preference":"relaxed","hotel_switch_tolerance":"low"}'
```

## 示例与回归

- 完整中文示例：`references/example_dialogue.md`
- 描述与触发回归：`references/trigger_regression.md`

## 备注

- Preferences: `~/.openclaw/agents/travel-planner/preferences.json`、
- Trips: `~/.openclaw/agents/travel-planner/trips.json`
- CLI 统一入口：`node scripts/<script>.mjs --key=value`

## 资源索引

| Path | Role |
|------|------|
| `scripts/preferences.mjs` | 偏好域存储与读写（含 `is_initialized`/`save_preferences`/`get_preferences`） |
| `scripts/trips.mjs` | Trip 数据层：schema 标准化、CRUD、预算与行程项 |
| `scripts/trip-workflow.mjs` | Trip 流程层：阶段守卫、路线确认、evidence 持久化、预订与启程状态流转 |
| `scripts/db.mjs` | 兼容型 CLI 门面：统一命令分发到 preferences/trips/trip-workflow 与缓存模块 |
| `scripts/route-plan.mjs` | 路线候选结构化输出 |
| `scripts/route-validation.mjs` | Step 5 辅助：据 `route_validation`（+可选 `live_results`）推导 `go/caution/block` 建议，不替代 Agent 调研与 `patch_trip` |
| `scripts/route-ui-enrichment.mjs` | 将 flyai/amap POI 原始结果映射为 `route_stop_media/route_stop_points` 增强输入 |
| `scripts/plan-generator.mjs` | 读取已持久化的 trip，输出 Step 6/7 骨架与总结
| `scripts/xhs-evidence-builder.mjs` | 规范化小红书搜索结果，输出 `route_evidence` 对象（其中 `platform=xhs`，第四步 xhs 链路必走） |
| `scripts/booking-ready.mjs` | 合并实时结果生成 booking-ready 包 |
| `scripts/briefing.mjs` | 行前/每日简报 |
| `references/route-protocol.md` | RouteEvidenceV1 协议字段、JSON 示例、行程阶段值枚举 |
| `references/reply-templates.md` | 路线框定回复格式、xhs 失败分流模板、链接展示规范 |
| `references/travel_guidelines.md` | 研究、预算、节奏与安全清单 |
| `references/cultural_etiquette.md` | 礼仪与文化注意事项模板 |
| `references/example_dialogue.md` | 中文完整示例（先框线再细化） |
| `references/trigger_regression.md` | 触发/不触发回归检查 |
