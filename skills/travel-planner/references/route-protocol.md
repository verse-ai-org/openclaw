# 路线协议参考

本文件供路线规划与后续验证/预订步骤按需查阅（与 `workflows/step2-evidence-and-route-choice.md`、`workflows/step3-route-poi-and-plan.md`、`workflows/step4-validate-transport-weather.md`、`workflows/step5-plan-details.md` 对齐）。包含：证据协议字段规范、JSON 示例、行程阶段值枚举。

---

## 统一证据协议：RouteEvidence

所有平台（`xhs/search/...`）统一走 `save_route_evidence`，不得平台私有化绕过。

### 字段说明（最小强约束）

| 字段 | 类型 | 说明 |
|------|------|------|
| `platform` | string | `xhs \| search \| ...` |
| `destination` | string | 目的地文本（如“川西”） |
| `duration_days` | number | 行程天数（正整数） |
| `verification_status` | string | `verified_by_platform_tool \| user_input_unverified` |
| `generated_at` | string | ISO 时间 |
| `sources[]` | array | `id / title / url / type / metrics / raw` |
| `routes[]` | array | 候选路线数组（必须 2-3 条） |

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
| `route_selected` | Step 2 结束：已执行 `save_route_choice`，`chosen_route_id` 已写入；权威 `route-plan` / `poi-cache` 尚未完成（见 Step 3） |
| `route_planned` | 已保存 `route-plan.json`（`save_route_plan` 成功）；**恰好 1 条** `route_option`，尚未 `route_confirmed` |
| `route_confirmed` | 用户已执行 `confirm_route_choice`（通常在 Step 3 末尾） |
| `validated` | 已保存交通/天气验证（`route-validation.json`）；`plan_depth_choice` 会被清空，须在 Step 4 用户重选「先预览 / 跳过预览」后重新 `set_plan_depth_choice` |
| `plan_ready` | 已在 **Step 5 末尾**执行 **`plan.mjs save_details`**（唯一一次定稿 `plan-details.json`；Step 4 的 `full_plan` 路径不在此之前落盘详单） |
| `in_trip` | 行程进行中（用户已出发） |
| `completed` | 行程已完成 |
| `cancelled` | 行程已取消 |

### 路线选择相关字段

| 字段 | 含义 | 约定 |
|------|------|------|
| `chosen_route_id` | 当前选中的路线 ID | **单一真实来源（single source of truth）**；写入 `trip.json` |
| `route_choice_confirmed`（文档用语） | 用户已明确选定路线 | **实现上**以 `trip.stage === route_confirmed` + 非空 `chosen_route_id` 为准；`scripts/workflow.mjs` 的 `confirm_route_choice` **不**写入同名布尔字段，仅追加事件 `route_choice_confirmed` |
| `route_options` | 路线对象数组 | 存于 **`route-plan.json`**；**必须恰好 1 条**（Step 3，`validateRoutePlan` 强制） |
| `route_plan`（历史/摘要语义） | 非 artifact 的轻量摘要对象 | 若文档单独提到「route_plan」摘要，勿与磁盘上的 **`route-plan.json`（含 `route_options`/`stop_points`）** 混淆；权威 `route-plan` 在 **Step 3** 落盘 |

### JSON 示例（`route-plan.json`）

`route_options` **仅允许 1 条**（与 `trip.chosen_route_id` 一致）。

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
    }
  ]
}
```

### 渲染约定（`route-plan.json` -> `item_carousel`）

- 渲染单位：`route_options[0]`（单条路线一个 carousel）
- item 来源：对应路线下的 `stop_points[]`（一站一个 item）
- 不允许把整个路线对象当作单个 carousel item
- 每个 stop 必须包含 `poi_id`，用于与 `poi-cache` 做稳定关联（`name` 仅用于展示）
- 若 `stop_points[].detail_url` 存在，前端可提供“查看详情”跳转
- 路线元信息（`route_id/title/summary`）应作为 carousel 外层标题/说明保留

### 路线验证结果

| 字段 | 含义 |
|------|------|
| `route_validation` | 验证阶段持久化摘要（交通 / 天气） |

### JSON 示例（`route-validation.json`）

```json
{
  "trip_id": "dd2df5bc-dfda-447f-8a4e-5d31c724ed10",
  "chosen_route_id": "r1",
  "verdict": "caution",
  "summary": "整体可行。高海拔路段（四姑娘山、新都桥、康定）天气较冷且有雨雪风险，需备好防寒防雨装备。自驾路况正常，各段转场时间合理，最长单日驾驶为Day 1（成都→四姑娘山约4.3h/233km）和返程日（康定→成都约4.1h/267km）。",
  "transport": {
    "status": "ok",
    "mode": "drive",
    "summary": "全程自驾可行。各段转场距离合理，无需单日超4.5小时驾驶。成都出发后沿熊猫大道至四姑娘山约4.3h，之后各段在1~3h之间。",
    "booking_links": [
      {
        "label": "去程：成都到上海，川航3U6996",
        "url": "https://www.example.com/",
        "price": "803"
      },
      {
        "label": "返程：上海到成都，川航3U6996",
        "url": "https://www.example.com/",
        "price": "903"
      }
    ],
    "highlights": [
      "成都→四姑娘山：约233km/4.3h，途经都江堰-映秀-卧龙，路况良好",
      "四姑娘山→丹巴：约133km/3.1h，途经小金县，山路为主",
      "丹巴→雅拉雪山→塔公草原：约120km/2.8h（分段轻松）",
      "塔公草原→新都桥：仅约41km/53min，非常轻松",
      "新都桥→康定：约73km/2.8h，翻越折多山，盘山路注意车速",
      "康定→成都：约267km/4.1h，雅康高速全程通畅"
    ]
  },
  "weather": {
    "status": "caution",
    "highlights": [
      "四姑娘山区：当前有雪，气温-7~16°C，建议带羽绒服和防水鞋",
      "新都桥/折多山：有雷雨/雨雪天气，路面可能湿滑，注意行车安全",
      "康定：当前-5~8°C有雪，早晚温差大",
      "成都：晴好16~28°C，舒适",
      "建议：携带冲锋衣、保暖内层、雨具；高海拔路段留意高原反应"
    ]
  }
}
```

---

## POI 协议：poi-cache（权威来源必须是 amap-lbs-skill）

用于为路线候选（`route-plan.json`）提供可审计的坐标/图片数据，并作为 `save_route_plan` 的硬 gate。解析顺序（resolve → miss → amap → `save_cache` / `save_preview`）见 `workflows/step2-evidence-and-route-choice.md` 与 `workflows/step3-route-poi-and-plan.md` 中的 **「POI 统一管道」**。

### 文件

- `data/trips/<trip_id>/poi-cache.json`

### 结构约定（强制）

- 顶层：
  - `source`: 必须为 `"amap-lbs-skill"`
  - `context_key`: 必填非空字符串；建议与 `route-evidence.destination`（或 adcode）一致，用于全局 POI 索引，禁止仅用裸 `query_name` 做跨行程去重键
  - `entries`: 必须为数组：`[{ ... }]`
- 每个 entry 必须包含：
  - `poi_id`, `name`, `lat`, `lng`, `resolved_at`, `query_name`（与对应 stop 的规范点名一致，供 `save_route_plan` 点名覆盖 gate）
  - `image/detail_url/subtitle` 等见 `validatePoiCache`（`image` 在权威 cache 中必填）
- `raw` 可选：直接存放 amap-lbs-skill 返回中的必要原始字段（用于追溯）

### JSON 示例（`poi-cache.json`）

```json
{
  "source": "amap-lbs-skill",
  "context_key": "川西",
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
      "query_name": "新都桥",
      "lat": 30.0475,
      "lng": 101.5087,
      "image": "https://img.example.com/xinduqiao.jpg",
      "detail_url": "https://example.com/poi/xinduqiao",
      "resolved_at": "2026-04-29T10:20:02.000Z"
    }
  ]
}
```

模板文件：`examples/poi-cache.template.json`

### poi-preview（Step 2 推荐默认，不参与 `save_route_plan` gate）

- 文件：`data/trips/<trip_id>/poi-preview.json`
- 模板：`examples/poi-preview.template.json`
- 用途：选线前少量点位展示；校验见 `validatePoiPreview`（**`entries[].image` 必填**，与 `poi-cache` 一致，须为非空 URL）。
- 顶层 **`context_key` 必填**（与 `poi-cache` 同语义）；`save_preview` 与 `save_cache` 一样会先 upsert 全局 `data/poi/` 再写 trip 文件。
- **不得**替代 `poi-cache.json` 作为权威来源。

### 全局 POI store（`data/poi/`）

- 根路径：`$TRAVEL_PLANNER_DB_DIR/data/poi/`（默认在 `~/.openclaw/agents/travel-planner/data/poi/`）。
- `entries/<base64url(poi_id)>.json`：按 `poi_id` 一条权威记录（跨 trip 复用）。
- `query-index.json`：`sha256(normalize(query_name) + "|||" + context_key)` → `{ poi_id, ingested_at, ... }`（实现见 `scripts/lib/poi-keys.mjs`、`scripts/lib/poi-store.mjs`）。
- CLI：`scripts/poi.mjs` 的 `ingest`、`get_entry`、`resolve`、`doctor_store`；`save_cache` / `save_preview` 在写 trip 前会 upsert 全局 store。

### 字段映射（`amap-lbs-skill` -> `poi-cache.entries`）

| amap-lbs-skill 字段 | 目标字段 | 说明 |
|---|---|---|
| `poi.id` | `entry.poi_id` | POI 唯一主键（route-plan 强制按该字段关联） |
| `poi.name` | `entry.name` | POI 标准名称（展示字段） |
| 查询词（agent 输入） | `entry.query_name` | 必填；与 stop 规范点名一致，供覆盖 gate 与全局 query 索引 |
| `poi.location` | `entry.lng`, `entry.lat` | `location` 为 `lng,lat` 字符串，需拆分并转 number |
| `poi.photos[0].url` | `entry.image` | Step 3 落盘的 `poi-cache` schema 要求非空；取首图即可 |
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
| `save_route_choice` | `trip.stage === intake` 且 `route-evidence` 已存在；写入 `chosen_route_id` 与 `route_selected` |
| `save_route_plan` | `trip.stage === route_selected`；`chosen_route_id` 已设置；`route-evidence` 有效；`route_options.length === 1` 且 `route_id === chosen_route_id`；`poi-cache` 覆盖 gate 通过 |
| `confirm_route_choice` | `stage >= route_planned`；`route-id` 在 `route-plan.route_options` 中且与 `trip.chosen_route_id` 一致（若已锁线） |
| `save_booking_ready` | `trip.stage >= route_confirmed` 且 `chosen_route_id` 已设置，且 `route_validation` 已持久化 |
| `confirm_booking` | 已完成验证（`stage >= validated`），用于持久化用户已确认的预订项 |
| `start_trip` | 已完成验证（`stage >= validated`），且 `bookings_confirmed = true` |
