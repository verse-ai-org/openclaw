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
node {baseDir}/scripts/db.mjs --cmd=is_initialized
```

- 若返回 `false`：进入轻量偏好采集。
- 若返回 `true`：读取已有偏好，仅补本次行程缺口。

#### 配置文件路径
- Preferences: `~/.openclaw/agents/travel-planner/preferences.json`、
- Trips: `~/.openclaw/agents/travel-planner/trips.json`

### 第二步：轻量偏好采集

**只问高影响项**,建议优先采集：

- 预算档位（经济/中档/高端）
- 节奏（轻松/适中/紧凑）
- 同行结构（独行/情侣/家庭/多人）
- 出发城市
- 出发时间
- 核心兴趣（风景/美食/人文/摄影/亲子等）
- 交通偏好（自驾/包车/公共交通/短途航班可接受）
- 步行耐受与行动限制

> 预算分配比例与节奏设计细则见 `references/travel_guidelines.md`。

保存时仅写入用户已明确提供的字段：

```bash
node {baseDir}/scripts/db.mjs --cmd=save_preferences --payload='{"departure_city":"上海","budget_level":"mid-range","pace_preference":"moderate","travel_companions":"couple","interests":["nature","food","photography"],"transport_preferences":["private driver","short flight okay"],"walking_tolerance":"moderate"}'
```

### 第三步：创建 trip 记录

**硬守卫（不可跳过）**：在执行 `add_trip` 之前，必须先查询是否有进行中的行程：

```bash
node {baseDir}/scripts/db.mjs --cmd=get_active_trips
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
node {baseDir}/scripts/db.mjs --cmd=add_trip --payload='{"destination_text":"新疆","destination":{"region":"Xinjiang","country":"China"},"duration_days":7,"budget":{"total":14000,"currency":"CNY"},"travelers":2,"activities":["nature","photography"],"constraints":["不自驾"],"transport_preferences":["private driver","short domestic flight okay"],"stage":"intake"}' --list=current
```

记录返回的 `trip_id`，后续都用 `--trip-id=<id>`。

### 第四步：路线规划

#### 目标

- 使用外部平台帮助用户做路线规划，平台包括：小红书、搜索。
- 路线框定阶段以内容驱动为主（`xhs/search`），支持用户手动粘贴内容（如小红书图文链接/正文摘要/截图转文字）作为输入证据。
- 始终输出 2-3 条带 `route_id` 的候选路线，并要求用户确认选择。

#### 平台选择

先问用户：

`你想用哪个平台来参考框定路线：小红书 / 搜索？`

**硬守卫（不可绕过）**：必须等用户回答后才能开始检索，无论用户是否"显然想往下走"，都不允许跳过这一问。唯一例外：用户在本轮消息中已明确说出"默认就行 / 你决定 / 按默认 / 用搜索 / 用小红书"等等效表达，方可直接采用对应平台。

- 未指定时默认使用`搜索`（Brave）。
- 如果小红书流程失败：必须提示用户二选一（`手动提供小红书内容` 或 `改用搜索`）。
- 当发生平台降级（`xhs -> search`）时，必须在回复中显式提示：`已从小红书降级到搜索`，并说明降级原因。

#### 实现边界（强约束）

- `travel-planner` 内部不直接调用其他 skill 的脚本。
- `route-plan.mjs` 仅消费上游输入（`route_evidence`、`route_options`）并输出结构化候选；所有平台（`xhs/search/...`）都必须先按 `RouteEvidenceV1` 调用 `db.mjs --cmd=save_route_evidence` 持久化后，才允许进入 `save_route_plan`。
- 证据落盘命名采用平台分文件：`~/.openclaw/agents/travel-planner/data/evidence/<trip_id>.<platform>.json`（例如：`<trip_id>.xhs.json`、`<trip_id>.search.json`）。
- 当平台为 `xhs` 时，默认先走 `@skills/xiaohongshu` 检索链路；若用户明确提供小红书图文内容，可走“用户输入证据”分支，不强制调用平台检索。

统一证据协议（`RouteEvidenceV1`）：

- 所有平台统一走 `save_route_evidence`，不得平台私有化绕过。
- 证据落盘路径：`~/.openclaw/agents/travel-planner/data/evidence/<trip_id>.<platform>.json`
- 新平台接入只需做"平台结果 -> RouteEvidenceV1"的适配映射，不改持久化主流程。

> 完整字段说明与 JSON 示例见 `references/route-protocol.md`。

路线规划脚本：

```bash
node {baseDir}/scripts/route-plan.mjs --input='<trip_request_json_with_route_platform_metadata>'
```

#### 必须顺序（不可跳步）

1. 确认用户已在本步骤中明确选择平台（`xhs` 或 `search`），不得自行设置默认值直接继续。
2. 按当前平台拉取上游证据：
   - `search`：默认使用搜索获取路线证据；仅当用户明确指定其他搜索引擎时覆盖默认值。
   - `xhs`：调用 `@skills/xiaohongshu` 的 `search-feeds` 和 `get-feed-detail`。
     - `xhs` 检索优化（路线框定专用）：
       - 查询词优先使用：`J人<目的地><days>天行程安排`（例如：`J人川西5天行程安排`）。
       - 强制过滤：`--note-type 图文 --sort-by 最多点赞`。
       - 证据候选中排除视频笔记，只保留图文笔记。
       - 路线证据最多保留前 2-3 条高点赞帖子。
     - `xhs` 异常分流（新增，必须执行）：
       - 若 `get-feed-detail` 失败/超时/返回空，必须显式提示用户当前状态，不得静默继续。
       - 必须给用户二选一动作：
         1) 用户手动提供小红书内容（帖子正文摘要/截图转文字）；
         2) 改用搜索继续路线框定。
       - 当用户未明确选择动作时，不得直接进入 `route-plan.mjs`。
       - 用户选择手动提供内容时，标记为 `evidence_source = user_input_xhs`，并在回复中注明“用户提供，未自动校验”。
       - 用户选择切换平台时，记录一次 `fallback_reason`（`xhs_detail_unavailable`）后进入 搜索链路，并明确提示用户“已从小红书降级到搜索”。
   - 用户输入证据分支（适用于 `xhs/search`）：
     - 当用户主动粘贴内容（小红书图文、网页摘要、截图转文字）时，可直接作为证据输入，不强制重新检索。
     - 必须标记 `verification_status = user_input_unverified`，并在 `meta` 中写入 `evidence_source`（`user_input_xhs` 或 `user_input_search`）。

3. 归一化输入：
   - `xhs`：将 `@skills/xiaohongshu` 返回的原始搜索结果，通过 `xhs-evidence-builder.mjs` 规范化后得到 `route_evidence`（`platform=xhs`）：
```bash
node scripts/xhs-evidence-builder.mjs --input='{ "destination_text": "<目的地>", "duration_days": <天数>, "search_results": <xhs原始结果_json> }'
```
   - `xhs/search`：统一先持久化证据（写入 `~/.openclaw/agents/travel-planner/data/evidence`），再进入路线保存：
```bash
node scripts/db.mjs --cmd=save_route_evidence --trip-id=<trip_id> --platform=<xhs|web> --payload='<route_evidence_v1_json>'
```
   - `search`：优先在 `route_evidence.route_hints` 提供锚点链路（`key_destinations` 或 `popular_loops`）；`route-plan.mjs` 将据此生成带 `stops` 的候选路线（如 `成都 -> 四姑娘山 -> ...`）。

4. 调用 `route-plan.mjs` 输出候选路线。
   - `recommended_route`、`alternatives`、`decision_summary` 必须来自本次 `route-plan.mjs` 输出，不允许手工臆造。
5. 若失败（不可用/无结果/候选不足），记录失败原因并按降级链切到下一个平台，回到第 2 步。
6. 一旦成功，持久化路线框定（含平台与降级信息）：

```bash
node {baseDir}/scripts/db.mjs --cmd=save_route_plan --trip-id=<trip_id> --recommended-route='<recommended_route_json>' --alternatives='<alternatives_json>' --rejected-routes='<rejected_routes_json>' --decision-summary='<decision_summary_json>' --route-source-used=<xhs|search> --route-source-preference=<xhs|search> --route-source-fallbacks='<fallback_chain_json>'
```

7. 展示 `route_options` 并要求用户明确选择 `route_id`。
8. 持久化用户选择：

```bash
node {baseDir}/scripts/db.mjs --cmd=confirm_route_choice --trip-id=<trip_id> --route-id=<route_id>
```

#### 硬性守卫（必须执行）

保存成功判定（必须同时满足）：

- `save_route_evidence` 返回 `ok = true`（平台统一前置）；
- `route-plan.mjs` 输出的 `route_options` 数量 `>= 2`；
- `save_route_plan` 返回 `ok = true`；
- 任一条件不满足：不得进入 `confirm_route_choice`。

当 `route_source_preference = auto` 时：

- 必须先走 `搜索引擎`, 默认使用Brave。
- 仅当用户明确指定“小红书优先”时，才按 `小红书 -> 搜索` 尝试。
- 不允许并行混合多个平台结果。
- 每次降级必须记录并输出失败原因。
- 两个平台都失败时，不得给“最终路线”。
- 仅可返回：
  1) 已尝试平台与失败原因；
  2) 用户需要的动作（如登录小红书、提供更具体目的地）；
  3) 用户同意后给临时草案路线（明确标注未验证）。
- 若首次平台为 `xhs` 且 `get-feed-detail` 不可用，优先发起分流确认：`手动提供小红书内容` 或 `切到搜索`；未确认前不得自动跳过；一旦降级必须显式提示“已降级到搜索”。

当用户显式选择某个平台时：

- 必须先完成该平台上游检索链路，再调用 `route-plan.mjs`。
- 不得跳过检索链路直接生成“已验证平台结果”。

路线持久化与确认守卫（新增，必须执行）：

- 当 `used_platform in {xhs, search}` 时，若未先执行 `save_route_evidence` 或证据不足，不得执行 `save_route_plan`。
- 当 `used_platform = search` 时，允许弱校验进入 `save_route_plan`。
- 当 `route_options` 少于 2 条时，不得执行 `save_route_plan`，也不得执行 `confirm_route_choice`。
- `confirm_route_choice` 只能在“展示候选路线 + 用户明确选中 route_id”后执行，不得提前写入确认态。
- 若 `save_route_plan` 返回失败，只能返回失败原因和下一步动作，不得伪造“已确认路线”。
- 当 `xhs` 明确走“用户手动提供内容”分支时，必须在 `decision_summary` 和用户回复中同时标注：`evidence_source=user_input_xhs`、`verification_status=unverified_by_xhs_tool`。

#### 路线框定回复格式

> 完整回复顺序规范、xhs 失败分流提示模板、小红书链接展示格式见 `references/reply-templates.md`。

核心要点：
- 必须先输出平台与降级信息：`used_platform`、`fallback_count`、`fallback_reason`
- 给出 2-3 条 `route_id` 路线选项，每条 1 行权衡（时间成本/换乘压力/景观收益）
- 最后必须发起确认问题（让用户选 `route_id`）, 同时说明下一步内容

### 第五步：调研交通和天气

#### 必须顺序（不可跳步）

1. 确认 `route_choice_confirmed=true` 且存在 `chosen_route_id`。
2. 从 `route_options` 取出 `chosen_route_id` 对应的路线，读取 `stops`。

**交通核验**（出发城市 ≠ `stops[0]` 时执行）：

3. 从 `trip.departure_city` 或 `preferences.departure_city` 确定出发城市。
4. 判断出行方式（分两段）：
   - **进入段**（出发城市 → `stops[0]`）：无论 `trip.constraints` 是否包含「自驾」，若两地跨省或距离显著（> 500km），使用 `@skills/flyai search-flight` 查询航班；若同省或中短途（< 500km），使用 `@skills/amap-lbs-skill` 评估驾车/高铁可行性。
   - **游览段**（`stops` 内部转场）：若 `trip.constraints` 包含「自驾」，用 `@skills/amap-lbs-skill` 查询关键相邻 stop 之间的驾车时长，评估单日转场是否现实（超过 4 小时需提醒）；否则说明以公共交通/包车为主，无需单独验证。
5. 将原始结果写入 `route_validation.transport_result`，并记录 `status: ok / unavailable / not_required`。

**天气核验**（始终执行）：

6. 从 `stops` 中选取 2-3 个有代表性的地点（首站、中间高海拔/偏远站、末站）。
7. 使用 `@skills/weather` 查询每个地点在 `trip.departure_date ~ trip.return_date` 内的天气预报。
8. 将原始结果写入 `route_validation.weather_result`，并按以下规则裁决 `status`：
   - `go`：无明显风险
   - `caution`：2 天以上连续强降雨/大雪/风力预警，或极端高温/低温影响户外活动
   - `block`：核心路段（如折多山、高原公路）因天气存在通行安全风险

**裁决与持久化**（必须在向用户回复前完成）：

9. 综合交通 + 天气结果，写入 `verdict: go / caution / block` 和 `verdict_reasons`。
10. 持久化：

```bash
node {baseDir}/scripts/db.mjs --cmd=patch_trip --trip-id=<trip_id> --payload='{"route_validation": <route_validation_json>}'
```

11. **必须向用户发起确认**：输出验证结论后，以「需要我总结当前的计划骨架行程吗？」收尾；未收到用户明确确认不得进入 Step 6。

#### `route_validation` 写入结构

```json
{
  "stage": "validated",
  "transport_result": {
    "required": true,
    "mode": "flight",
    "checked": true,
    "raw": {},
    "status": "ok"
  },
  "weather_result": {
    "locations_checked": ["成都", "四姑娘山", "康定"],
    "raw": {},
    "status": "caution"
  },
  "verdict": "caution",
  "verdict_reasons": ["5月初四姑娘山有降雪风险"],
  "checked_at": ""
}
```

#### 兜底处理

若技能调用失败：
1. 明确说明哪一项失败（`flyai` / `amap-lbs-skill` / `weather`）。
2. 仍可给路线框定与骨架方案，但价格/时刻/天气必须标注为**未验证**。
3. 有阶段性结果时优先写入 `db.mjs` 便于续跑，命令同步骤 10。


### 第六步：确认计划骨架

**进入条件**：用户已对 Step 5 验证结论明确确认（如「需要」/ 「是」/ 「总结一下」等等效表达）。

总结计划骨架，并二次确认：

- 选中的路线是否最终确认
- 交通策略 + 住宿区域策略是否确认
- 是否进入每日执行卡片生成

> 完整对话示例见 `references/example_dialogue.md`；触发/不触发回归场景见 `references/trigger_regression.md`。

骨架来源：

```bash
node {baseDir}/scripts/plan-generator.mjs --trip-id=<id>
```

优先展示：`route_plan`、`route_validation`、`plan_skeleton`、`booking_strategy`。

#### 输出格式

> 计划骨架总结卡片模板（5项结构）见 `references/reply-templates.md` — 第六步。

**必须先展示总结卡片**，再等用户确认；未完成确认不进入 Step 7。这一步必须是一个**独立回复回合**，不得与 Step 7 合并。

完成门槛（全部满足才可进入 Step 7）：

- 已输出 Step 6 总结卡片；
- 已收到用户明确确认（如"确认/继续/按这个走"）；
- 已在上下文中记录 `light_validation_confirmed = true`（或等效确认状态）。

### 第七步：生成详细计划

必须满足：

- `route_choice_confirmed === true`
- `chosen_route_id` 已存在
- 用户已确认 Step 6 结论
- 本步仅生成“简要每日计划骨架”，不考虑机票/高铁/酒店选择。

本步输出目标（仅简要每日计划）：

- 按天给出：主目标、次目标、核心景点/区域、建议出发时段、体力负荷、天气风险提醒。
- 保留路线节奏与关键转场（仅说明长途/短途，不给具体班次与预订信息）。
- 明确标注：交通与住宿细化将在 Step 8 完成。

本步禁止事项：

- 不输出机票/高铁/酒店候选；
- 不输出预订链接；
- 不给“可直接下单”结论。

建议命令（骨架生成）：

```bash
node {baseDir}/scripts/plan-generator.mjs --trip-id=<trip_id>
```

本步回复顺序与每日计划必含字段见 `references/reply-templates.md` — 第七步。

### 第八步：行前服务（用户开始预订后）

进入条件：

- 用户已确认进入 Step 8；
- 已存在 Step 7 的简要每日计划骨架。

本步目标（补齐详细计划）：

- 基于 Step 7 每日骨架，补齐“每日住宿建议（区域或候选酒店）+ 每日交通建议（自驾段/高铁/航班/接驳）”；
- 形成“正常详细每日计划”（执行卡片 + 住宿 + 交通 + 风险）；
- 仅给候选与筛选建议，不替用户做最终下单决策。

实时查询来源（强约束，必须优先）：

- `flights`：使用 `flyai search-flight`
- `hotels`：使用 `flyai search-hotel`
- `pois`：使用 `flyai search-poi`
- `food` / `dining`：优先使用 `flyai search-poi` 餐饮结果；若不可用可用 `@skills/amap-lbs-skill` 餐饮结果补充

真实性要求（必须执行）：

- Step 8 的交通/酒店/餐饮推荐必须基于实时查询结果，不得凭经验臆造价格、班次、库存、评分。
- 若任一类实时查询失败，必须明确标注该类为“未实时验证”，并给补查动作，不得伪装为已验证结果。
- `live_results_json` 必须保留工具原始输出，供 `booking-ready.mjs` 消费与追溯。

合成与持久化建议：

```bash
node {baseDir}/scripts/booking-ready.mjs --trip='<trip_json>' --route='<route_json>' --validation='<route-validation_json>' --results='<live_results_json>'
node {baseDir}/scripts/db.mjs --cmd=save_live_results --trip-id=<trip_id> --payload='<live_results_json>'
node {baseDir}/scripts/db.mjs --cmd=save_booking_ready --trip-id=<trip_id> --payload='<booking_ready_json>'
```

若用户确认具体预订项，再执行：

```bash
node {baseDir}/scripts/db.mjs --cmd=confirm_booking --trip-id=<trip_id> --category=hotel --payload='<selected_hotel_json>'
```

最终答复顺序（7项，必须遵守）及链接输出规范见 `references/reply-templates.md` — 第八步。

> 行前清单、打包建议、安全应急细则见 `references/travel_guidelines.md`。
> 礼仪与文化注意事项见 `references/cultural_etiquette.md`。

推荐阶段值枚举见 `references/route-protocol.md`。

### 第九步：行中支持

支持行中场景：

- 天气突变改线
- 误车/误点后的重排
- 附近备选点位
- 当日简报与支出跟踪

```bash
node {baseDir}/scripts/briefing.mjs --mode=pre_trip --trip='<trip_json>' --plan='<plan_json>'
node {baseDir}/scripts/briefing.mjs --mode=daily --trip='<trip_json>' --plan='<plan_json>' --day=2
```

已出发先标记：

```bash
node {baseDir}/scripts/db.mjs --cmd=start_trip --trip-id=<trip_id>
```

### 第十步：行后沉淀

程序接口：

- `moveTripToPast(tripId)`
- `addPreviousDestination("城市, 国家")`
- `updatePreference` / `savePreferences`

更新可复用偏好：真实节奏承受、酒店风格偏好、是否厌恶频繁换酒店、兴趣权重变化等。

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
| `scripts/db.mjs` | 偏好、行程、预算摘要、导出（唯一状态存储层） |
| `scripts/route-plan.mjs` | 路线候选结构化输出 |
| `scripts/route-validation.mjs` | 对实时技能结果做可行性裁决（`go/caution/block`），不再生成 tool_plan |
| `scripts/plan-generator.mjs` | 读取已持久化的 trip，输出骨架计划、每日卡片、打包建议（不主动调用其他计算模块） |
| `scripts/xhs-evidence-builder.mjs` | 规范化小红书搜索结果，输出 `route_evidence` 对象（其中 `platform=xhs`，第四步 xhs 链路必走） |
| `scripts/booking-ready.mjs` | 合并实时结果生成 booking-ready 包 |
| `scripts/briefing.mjs` | 行前/每日简报 |
| `references/route-protocol.md` | RouteEvidenceV1 协议字段、JSON 示例、行程阶段值枚举 |
| `references/reply-templates.md` | 路线框定回复格式、xhs 失败分流模板、链接展示规范 |
| `references/travel_guidelines.md` | 研究、预算、节奏与安全清单 |
| `references/cultural_etiquette.md` | 礼仪与文化注意事项模板 |
| `references/example_dialogue.md` | 中文完整示例（先框线再细化） |
| `references/trigger_regression.md` | 触发/不触发回归检查 |
