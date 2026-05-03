# 路线协议参考

本文件供路线规划与后续验证/预订步骤按需查阅（与 `workflows/step2-route-planning.md`、`workflows/step3-validate-transport-weather.md`、`workflows/step4-plan-details.md` 对齐）。包含：证据协议字段规范、JSON 示例、行程阶段值枚举。

---

## 统一证据协议：RouteEvidence（v2）

所有平台（`xhs/search/...`）统一走 `save_route_evidence`，不得平台私有化绕过。

### 字段说明（最小强约束）

| 字段 | 类型 | 说明 |
|------|------|------|
| `platform` | string | `xhs \| search \| ...` |
| `evidence_version` | string | 固定 `v2` |
| `destination` | string | 目的地文本（如“川西”） |
| `duration_days` | number | 行程天数（正整数） |
| `verification_status` | string | `verified_by_platform_tool \| user_input_unverified` |
| `generated_at` | string | ISO 时间 |
| `sources[]` | array | `id / title / url / type / metrics / raw` |
| `routes[]` | array | 候选路线数组（必须 2-3 条） |
| `merged_points[]` | array | 可选。去重后的点名列表：`string[]`（用于 POI 去重查询） |

> 新平台接入只需做“平台结果 -> RouteEvidence(v2)”映射，不改持久化主流程。
>
> `routes[]` 结构要求：
> - 每条路线必须包含：`route_id`、`title`、`summary`、`stops[]`
> - `stops[]` 每个点必须包含：`name`、`day`
> - 约束：`day` 必须为正整数且 `<= duration_days`

---

### JSON 示例（`search` 平台，v2）

```json
{
  "platform": "search",
  "evidence_version": "v2",
  "destination": "川西",
  "duration_days": 5,
  "summary": "基于公开网页结果的路线参考",
  "verification_status": "verified_by_platform_tool",
  "generated_at": "2026-04-09T10:05:00.000Z",
  "sources": [
    {
      "id": "search_result_1",
      "title": "川西 5 天游玩路线攻略",
      "url": "https://example.com/chuanxi-5d",
      "type": "search_result",
      "raw": { "engine": "brave" }
    }
  ],
  "routes": [
    {
      "route_id": "r1",
      "title": "川西经典风景环线",
      "summary": "成都→四姑娘山→新都桥→冷嘎措→成都，景观密度高，节奏均衡，适合首次到访",
      "stops": [
        { "name": "成都", "day": 1 },
        { "name": "四姑娘山", "day": 2 },
        { "name": "新都桥", "day": 3 },
        { "name": "冷嘎措", "day": 4 },
        { "name": "成都", "day": 5 }
      ]
    },
    {
      "route_id": "r2",
      "title": "川西轻体力慢游线",
      "summary": "成都→康定→新都桥→墨石公园→成都，降低高强度移动，保留核心景点",
      "stops": [
        { "name": "成都", "day": 1 },
        { "name": "康定", "day": 2 },
        { "name": "新都桥", "day": 3 },
        { "name": "墨石公园", "day": 4 },
        { "name": "成都", "day": 5 }
      ]
    }
  ]
}
```

### JSON 示例（`xhs` 平台，用户手动提供内容分支）

```json
{
  "platform": "xhs",
  "evidence_version": "v2",
  "destination": "云南",
  "duration_days": 7,
  "summary": "用户手动提供小红书笔记内容",
  "evidence_quality": "medium",
  "verification_status": "user_input_unverified",
  "generated_at": "2026-04-09T10:10:00.000Z",
  "sources": [
    {
      "id": "user_input_1",
      "title": "用户粘贴帖子标题",
      "url": "https://www.xiaohongshu.com/...",
      "type": "user_input",
      "metrics": { "likes": 1280, "collects": 940 },
      "raw": {}
    }
  ],
  "routes": [
    {
      "route_id": "r1",
      "title": "滇西北经典线",
      "summary": "昆明→丽江→香格里拉→大理→昆明，昆明进出，丽江-香格里拉-大理闭环",
      "stops": [
        { "name": "昆明", "day": 1 },
        { "name": "丽江", "day": 2 },
        { "name": "香格里拉", "day": 4 },
        { "name": "大理", "day": 6 },
        { "name": "昆明", "day": 7 }
      ]
    },
    {
      "route_id": "r2",
      "title": "滇南休闲线",
      "summary": "昆明-建水-元阳，主打人文与梯田",
      "stops": [
        { "name": "昆明", "day": 1 },
        { "name": "建水", "day": 2 },
        { "name": "元阳", "day": 4 },
        { "name": "昆明", "day": 7 }
      ]
    }
  ]
}
```

---

## 行程状态字段约定

### trip.stage（生命周期阶段）

统一使用以下枚举值（与 `scripts/lib/contracts.mjs` 对齐）：

| 值 | 含义 |
|----|------|
| `intake` | 初始采集阶段，刚建档或信息仍在补充 |
| `route_planned` | 已保存候选路线（`route-plan.json`），但用户尚未最终确认 |
| `route_confirmed` | 用户已确认 `chosen_route_id`（通过 `confirm_route_choice`） |
| `validated` | 已保存交通/天气验证（`route-validation.json`） |
| `plan_ready` | 已保存全面计划详情（`plan-details.json`） |
| `in_trip` | 行程进行中（用户已出发） |
| `completed` | 行程已完成 |
| `cancelled` | 行程已取消 |

### 路线选择相关字段

| 字段 | 含义 | 约定 |
|------|------|------|
| `chosen_route_id` | 当前选中的路线 ID | **单一真实来源（single source of truth）**；写入 `trip.json` |
| `route_choice_confirmed`（文档用语） | 用户已明确选定路线 | **实现上**以 `trip.stage === route_confirmed` + 非空 `chosen_route_id` 为准；`scripts/workflow.mjs` 的 `confirm_route_choice` **不**写入同名布尔字段，仅追加事件 `route_choice_confirmed` |
| `route_options` | 完整候选路线对象数组 | 存于落盘文件 **`route-plan.json`**（artifact 名 `route-plan`），用于展示与按 `chosen_route_id` 解析当前路线 |
| `route_plan`（历史/摘要语义） | 非 artifact 的轻量摘要对象 | 若文档单独提到「route_plan」摘要，勿与磁盘上的 **`route-plan.json`（含 `route_options`/`stop_points`）** 混淆；Step 2 权威结构以本文 JSON 示例为准 |

### JSON 示例（`route-plan.json`）

```json
{
  "route_options": [
    {
      "route_id": "r1",
      "title": "川西经典风景环线",
      "summary": "成都→四姑娘山→新都桥→冷嘎措→成都",
      "stop_points": [
        { 
          "name": "成都",
          "poi_id": "B00140U6V9",
          "lat": 30.5728,
          "lng": 104.0668,
          "image": "https://img.example.com/chengdu.jpg",
          "detail_url": "https://example.com/poi/chengdu"
        },
        {
          "name": "四姑娘山",
          "poi_id": "B0FFGIRH8N",
          "lat": 31.0436,
          "lng": 102.9237,
          "image": "https://img.example.com/siguniangshan.jpg",
          "detail_url": "https://example.com/poi/siguniangshan"
        },
        {
          "name": "新都桥",
          "poi_id": "B0FFKVQTL4",
          "lat": 30.0475,
          "lng": 101.5087,
          "image": "https://img.example.com/xinduqiao.jpg",
          "detail_url": "https://example.com/poi/xinduqiao"
        },
        { "name": "冷嘎措", "poi_id": "B0FFIY2S2Q", "lat": 29.6898, "lng": 101.9884 },
        { "name": "成都", "poi_id": "B00140U6V9", "lat": 30.5728, "lng": 104.0668 }
      ]
    },
    {
      "route_id": "r2",
      "title": "川西轻体力慢游线",
      "summary": "成都→康定→新都桥→墨石公园→成都",
      "stop_points": [
        { "name": "成都", "poi_id": "B00140U6V9", "lat": 30.5728, "lng": 104.0668 },
        { "name": "康定", "poi_id": "B001D0B8J5", "lat": 30.0507, "lng": 101.9638 },
        { "name": "新都桥", "poi_id": "B0FFKVQTL4", "lat": 30.0475, "lng": 101.5087 },
        { "name": "墨石公园景区", "poi_id": "B0FFHS11CT", "lat": 30.1934, "lng": 101.7686 },
        { "name": "成都", "poi_id": "B00140U6V9", "lat": 30.5728, "lng": 104.0668 }
      ]
    }
  ],
  "route_tool_ui_ready": true
}
```

### 渲染约定（`route-plan.json` -> `item_carousel`）

- 渲染单位：`route_options[]`（一条路线一个 carousel）
- item 来源：对应路线下的 `stop_points[]`（一站一个 item）
- 不允许把整个路线对象当作单个 carousel item
- 每个 stop 必须包含 `poi_id`，用于与 `poi-cache` 做稳定关联（`name` 仅用于展示）
- 若 `stop_points[].detail_url` 存在，前端可提供“查看详情”跳转
- 路线元信息（`route_id/title/summary`）应作为 carousel 外层标题/说明保留，用于对比与选择

### 验证与预订相关字段

| 字段 | 含义 |
|------|------|
| `route_validation` | 验证阶段持久化摘要（交通 / 天气 / verdict；workflow Step 3） |
| `booking_ready` | 实时检索后生成的 booking-ready 包（落盘为 `booking-ready.json`） |
| `bookings_confirmed` | 是否已经确认关键预订项（如航班 / 酒店） |
| `confirmed_bookings` | 各预订类别的已确认结果 |
| `live_results` | 实时查询得到的原始结果集合（落盘为 `live-results.json`） |

### JSON 示例（`route-validation.json`）

```json
{
  "verdict": "go",
  "summary": "整体可行，第三天午后山区有阵雨风险，建议准备防雨与机动时段。",
  "transport": {
    "status": "ok",
    "highlights": ["成都-康定高速通行正常", "返程高峰建议提前 1 小时出发"]
  },
  "weather": {
    "status": "caution",
    "highlights": ["新都桥第 3 天午后有降雨概率", "冷嘎措早晚温差较大"]
  }
}
```

---

## POI 协议：poi-cache（权威来源必须是 amap-lbs-skill）

用于为路线候选（`route-plan.json`）提供可审计的坐标/图片数据，并作为 `save_route_plan` 的硬 gate。

### 文件

- `data/trips/<trip_id>/poi-cache.json`

### 结构约定（强制）

- 顶层：
  - `source`: 必须为 `"amap-lbs-skill"`
  - `entries`: 必须为数组：`[{ ... }]`
- 每个 entry 必须包含：
  - `poi_id`, `name`, `lat`, `lng`, `resolved_at`
  - `query_name` 可选（用户查询词，用于追溯）
  - `image/detail_url/subtitle` 可选（不可伪造）
- `raw` 可选：直接存放 amap-lbs-skill 返回中的必要原始字段（用于追溯）

### JSON 示例（`poi-cache.json`）

```json
{
  "source": "amap-lbs-skill",
  "entries": [
    {
      "poi_id": "B0FFGIRH8N",
      "name": "四姑娘山",
      "query_name": "四姑娘山景区",
      "lat": 31.0436,
      "lng": 102.9237,
      "image": "https://img.example.com/siguniangshan.jpg",
      "detail_url": "https://example.com/poi/siguniangshan",
      "subtitle": "阿坝州小金县",
      "resolved_at": "2026-04-29T10:20:00.000Z"
    },
    {
      "poi_id": "B0FFKVQTL4",
      "name": "新都桥",
      "lat": 30.0475,
      "lng": 101.5087,
      "detail_url": "https://example.com/poi/xinduqiao",
      "resolved_at": "2026-04-29T10:20:02.000Z"
    }
  ]
}
```

模板文件：`examples/poi-cache.template.json`

### 字段映射（`amap-lbs-skill` -> `poi-cache.entries`）

| amap-lbs-skill 字段 | 目标字段 | 说明 |
|---|---|---|
| `poi.id` | `entry.poi_id` | POI 唯一主键（route-plan 强制按该字段关联） |
| `poi.name` | `entry.name` | POI 标准名称（展示字段） |
| 查询词（agent 输入） | `entry.query_name` | 用户查询词（可选，仅追溯） |
| `poi.location` | `entry.lng`, `entry.lat` | `location` 为 `lng,lat` 字符串，需拆分并转 number |
| `poi.photos[0].url` | `entry.image` | Step 2 的 `poi-cache` schema 要求非空；取首图即可 |
| `poi.type/typecode/address/tel` | `entry.raw.*` | 可选，按需保留 |
| 当前时间 | `entry.resolved_at` | ISO 时间戳 |
| 可验证详情页链接 | `entry.detail_url` | 仅可稳定生成时写入，否则留空 |

### 关系约束（gate）

当 `route-plan.json` 声明任何 stop（`route_options[].stop_points[]`）时：
- stop 必须包含 `poi_id`，且必须能在 `poi-cache.json.entries[].poi_id` 中找到对应项
- `route_options[].stop_points[].lat/lng` 必须与 `poi-cache` 中同 `poi_id` 项一致
- `route_options[].stop_points[].image` 若存在，必须与 `poi-cache` 中同 `poi_id` 项一致
- `route_options[].stop_points[].detail_url` 若存在，必须与 `poi-cache` 中同 `poi_id` 项一致
- 若 `poi-cache` 中该 `poi_id` 的 `image` 为空，不允许在 route-plan 中为该 stop 填写 image
- 若 `poi-cache` 中该 `poi_id` 的 `detail_url` 为空，不允许在 route-plan 中为该 stop 填写 detail_url
- 若 route-plan 未填写 `image` 且 `poi-cache` 中存在图片，保存时会自动回填
- 若 route-plan 未填写 `detail_url` 且 `poi-cache` 中存在链接，保存时会自动回填
- 不满足时 `scripts/workflow.mjs --cmd=save_route_plan` 会拒绝落盘

### stage guard（状态守卫）

| 动作 | 前置条件 |
|------|----------|
| `save_route_plan` | 已有足够 `route_evidence`，且候选路线数 `>= 2` |
| `confirm_route_choice` | `route_options >= 2` 且用户明确选中了 `route_id` |
| `save_booking_ready` | `trip.stage >= route_confirmed` 且 `chosen_route_id` 已设置，且 `route_validation` 已持久化 |
| `confirm_booking` | 已完成验证（`stage >= validated`），用于持久化用户已确认的预订项 |
| `start_trip` | 已完成验证（`stage >= validated`），且 `bookings_confirmed = true` |
