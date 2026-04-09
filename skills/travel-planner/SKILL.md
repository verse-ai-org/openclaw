---
name: travel-planner
description: "中文旅行规划技能。用于偏好记录、路线规划、目的地调研、逐日行程、交通与住宿策略、预算与行前清单。用户提到行程规划、路线选择、出行预算、酒店交通组合、行中改线重排时触发。"
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
- 大区域目的地先“路线框定”，再展开逐日计划。

## 工作流

### 第一步：读取偏好

```bash
node {baseDir}/scripts/db.mjs --cmd=is_initialized
```

- 若返回 `false`：进入轻量偏好采集。
- 若返回 `true`：读取已有偏好，仅补本次行程缺口。

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

保存时仅写入用户已明确提供的字段：

```bash
node {baseDir}/scripts/db.mjs --cmd=save_preferences --payload='{"departure_city":"上海","budget_level":"mid-range","pace_preference":"moderate","travel_companions":"couple","interests":["nature","food","photography"],"transport_preferences":["private driver","short flight okay"],"walking_tolerance":"moderate"}'
```

### 第三步：创建 trip 记录

尽快建档，允许字段不完整：

```bash
node {baseDir}/scripts/db.mjs --cmd=add_trip --payload='{"destination_text":"新疆","destination":{"region":"Xinjiang","country":"China"},"duration_days":7,"budget":{"total":14000,"currency":"CNY"},"travelers":2,"activities":["nature","photography"],"constraints":["不自驾"],"transport_preferences":["private driver","short domestic flight okay"],"stage":"intake"}' --list=current
```

记录返回的 `trip_id`，后续都用 `--trip-id=<id>`。

### 第四步：路线规划

#### 目标

- 使用外部平台帮助用户做路线规划，平台包括：小红书，高德地图，搜索。
- 始终输出 2-3 条带 `route_id` 的候选路线，并要求用户确认选择。

#### 平台选择

先问用户：

`你想用哪个平台来框定路线：小红书 / 高德地图 / 搜索引擎？`

- 未指定时默认 `小红书`。
- 自动降级链固定为：`小红书 -> 高德地图 -> 搜索引擎`。
- 硬守卫：在用户未完成平台选择前，不得直接执行任意平台检索。
- 仅当用户明确表示“默认就行/你决定/按默认”时，才可直接使用默认 `小红书`。

#### 实现边界（强约束）

- `travel-planner` 内部不直接调用其他 skill 的脚本。
- `route-plan.mjs` 仅消费上游输入（`xhs_evidence`、`route_candidates`、`route_options`）并输出结构化候选；当平台为 `xhs` 时，`xhs_evidence` 必须先通过 `db.mjs --cmd=save_route_evidence` 持久化后，才允许进入 `save_route_plan`。
- 当平台为 `xhs` 时，必须先走 `@skills/xiaohongshu` 检索链路；不允许用 browser 打开网页替代。

路线规划脚本：

```bash
node {baseDir}/scripts/route-plan.mjs --input='<trip_request_json_with_route_platform_metadata>'
```

#### 必须顺序（不可跳步）

1. 读取或设置 `route_source_preference`（`xhs`/`amap`/`web`/`auto`）。
2. 按当前平台拉取上游证据：
   - `xhs`：调用 `@skills/xiaohongshu` 的 `search-feeds`（必要时补 `get-feed-detail`）。
     - `xhs` 检索优化（路线框定专用）：
       - 查询词优先使用：`J人<目的地><days>天行程安排`（例如：`J人川西5天行程安排`）。
       - 强制过滤：`--note-type 图文 --sort-by 最多点赞`。
       - 禁止使用：`--sort-by 最新`（路线框定场景一律不用“最新”排序）。
       - 证据候选中排除视频笔记，只保留图文笔记。
       - 路线证据最多保留前 2-3 条高点赞帖子。
   - `amap`：调用 `@skills/amap-lbs-skill` 获取路线/POI/转场信息。
   - `web`：调用可用搜索工具获取路线证据。

3. 归一化输入：
   - `xhs`：将 `@skills/xiaohongshu` 返回的原始搜索结果，通过 `xhs-evidence-builder.mjs` 规范化后得到 `xhs_evidence`：
```bash
node scripts/xhs-evidence-builder.mjs --input='{ "destination_text": "<目的地>", "duration_days": <天数>, "search_results": <xhs原始结果_json> }'
```
   - `xhs`：必须先持久化证据（写入 `~/.openclaw/agents/travel-planner/data/evidence`），再进入路线保存：
```bash
node scripts/db.mjs --cmd=save_route_evidence --trip-id=<trip_id> --platform=xhs --payload='<xhs_evidence_json>'
```
   - `amap/web`：将结果写入 `route_candidates` 或 `route_options`。

4. 调用 `route-plan.mjs` 输出候选路线。
   - `recommended_route`、`alternatives`、`decision_summary` 必须来自本次 `route-plan.mjs` 输出，不允许手工臆造。
5. 若失败（不可用/无结果/候选不足），记录失败原因并按降级链切到下一个平台，回到第 2 步。
6. 一旦成功，持久化路线框定（含平台与降级信息）：

```bash
node {baseDir}/scripts/db.mjs --cmd=save_route_plan --trip-id=<trip_id> --recommended-route='<recommended_route_json>' --alternatives='<alternatives_json>' --rejected-routes='<rejected_routes_json>' --decision-summary='<decision_summary_json>' --route-source-used=<xhs|amap|web|auto> --source-reason='<source_reason_text>' --route-source-preference=<xhs|amap|web|auto> --route-source-fallbacks='<fallback_chain_json>'
```

7. 展示 `route_options` 并要求用户明确选择 `route_id`。
8. 持久化用户选择：

```bash
node {baseDir}/scripts/db.mjs --cmd=confirm_route_choice --trip-id=<trip_id> --route-id=<route_id>
```

#### 硬性守卫（必须执行）

保存成功判定（必须同时满足）：

- `save_route_evidence` 返回 `ok = true`（`xhs` 平台必需）；
- `route-plan.mjs` 输出的 `route_options` 数量 `>= 2`；
- `save_route_plan` 返回 `ok = true`；
- 任一条件不满足：不得进入 `confirm_route_choice`。

当 `route_source_preference = auto` 时：

- 必须按 `小红书 -> 高德地图 -> 搜索引擎` 依次尝试。
- 不允许并行混合多个平台结果。
- 每次降级必须记录并输出失败原因。
- 三个平台都失败时，不得给“最终路线”。
- 仅可返回：
  1) 已尝试平台与失败原因；
  2) 用户需要的动作（如登录小红书、提供更具体目的地）；
  3) 用户同意后给临时草案路线（明确标注未验证）。

当用户显式选择某个平台时：

- 必须先完成该平台上游检索链路，再调用 `route-plan.mjs`。
- 不得跳过检索链路直接生成“已验证平台结果”。

路线持久化与确认守卫（新增，必须执行）：

- 当 `used_platform = xhs` 时，若未先执行 `save_route_evidence`，不得执行 `save_route_plan`。
- 当 `route_options` 少于 2 条时，不得执行 `save_route_plan`，也不得执行 `confirm_route_choice`。
- `confirm_route_choice` 只能在“展示候选路线 + 用户明确选中 route_id”后执行，不得提前写入确认态。
- 若 `save_route_plan` 返回失败，只能返回失败原因和下一步动作，不得伪造“已确认路线”。

#### 路线框定回复格式

- 必须先输出平台与降级信息：`used_platform`、`fallback_count`、`fallback_reason`
- 若 `used_platform = 小红书` 且有证据，先给“原文参考”区块，再给路线选项
- 小红书“原文参考”区块每条都要展示：标题、链接、点赞数、收藏数
- 给出 2-3 条 `route_id` 路线选项
- 每条 1 行权衡（时间成本/换乘压力/景观收益）
- 指出推荐项与推荐理由
- 解释一个常见备选为何更弱
- 给简短住宿策略 + 交通策略
- 最后必须发起确认问题（让用户选 `route_id`）

小红书链接段落示例：

`小红书原文参考（优先展示）`

- `[帖子标题A](https://www.xiaohongshu.com/...)`（点赞 1280，收藏 940）
- `[帖子标题B](https://www.xiaohongshu.com/...)`（点赞 860，收藏 610）

若无有效链接，明确写：
`本次未拿到可分享的小红书链接，请先登录或重试检索。`

### 第五步：调研交通和天气

#### 必须顺序（不可跳步）

1. 确认 `route_choice_confirmed=true` 且存在 `chosen_route_id`。
2. 使用当前 `trip + selected_route + preferences` 运行一次 `route-validation.mjs` 获取 `tool_plan`（仅生成 `skill_action + skill_input` 计划，不执行外部技能）。
3. 本步只做两类可行性核验：
   - 交通可达性（仅在“需要跨城长途交通”时执行）；
   - 天气窗口风险（始终执行）。
4. 仅允许给风险提醒（如极端天气建议选取其他路线，旺季建议尽早锁房等）。
5. 按 `tool_plan` 调用相关技能（`@skills/flyai`、`@skills/12306`、`@skills/amap-lbs-skill`、`@skills/weather`），不要跳过规划阶段直接乱调。
6. 将原始结果交给 `booking-ready.mjs` 输出轻结论：`go(可行) / caution（慎重） / block（不可行）`。
7. **必须向用户发起确认**（是否继续下一步）；未确认不得进入后续步骤。

#### 兜底处理
`{baseDir}/scripts/route-validation.mjs` 只生成检查计划，不会自动修复外部依赖故障。若调用失败：

1. 明确说明哪一项失败（`flyai`/`12306`/`amap-lbs-skill`/web）。
2. 仍可给路线框定与骨架方案，但价格/余票/时刻必须标注为**未验证**。
3. `booking_ready` 输入不完整时，不得宣称“可直接下单”。
4. 若已有阶段性结果，优先写入 `db.mjs` 便于续跑。


```bash
# 仅构建验证计划（tool_plan），不直接执行外部 skill
node {baseDir}/scripts/route-validation.mjs --trip='<trip_json>' --route='<route_json>' --preferences='<prefs_json>'
```


### 第六步：确认计划骨架

总结计划骨架，并二次确认：

- 选中的路线是否最终确认
- 交通策略 + 住宿区域策略是否确认
- 是否进入每日执行卡片生成

骨架来源：

```bash
node {baseDir}/scripts/plan-generator.mjs --trip-id=<id>
```

优先展示：`route_plan`、`route_validation`、`plan_skeleton`、`booking_strategy`。

#### 输出格式

**必须先展示总结卡片**
先输出“计划骨架总结”，再问确认；未完成确认不进入 Step 7。
这一步必须是一个**独立回复回合**（先总结，再等用户确认），不得与 Step 7 合并在同一回复里。

建议模板：

1. `路线结论`：已选 `route_id` + 1 行推荐理由
2. `行程调研结论`：`go(可行) / caution（慎重） / block（不可行）` + 天气/交通关键提醒
3. `策略摘要`：交通策略（按需）+ 预算策略（按需）+ 住宿策略（按需）
4. `待确认项`：最多 2-3 条（如日期是否微调、是否接受某段长转场）
5. `确认问题`：`是否确认按该骨架进入逐日详细计划？`

完成门槛（全部满足才可进入 Step 7）：

- 已输出 Step 6 总结卡片；
- 已收到用户明确确认（如“确认/继续/按这个走”）；
- 已在上下文中记录 `light_validation_confirmed = true`（或等效确认状态）。

### 第七步：生成详细计划

必须满足：

- `route_choice_confirmed === true`
- `selected_route` 已存在
- `light_validation_confirmed === true`（用户已确认 Step 5 结论）
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

本步回复顺序（固定）：

1. 路线与节奏结论（1-2 行）
2. 简要每日计划（D1..Dn）
3. 天气与体力风险提醒
4. 进入 Step 8 的确认问题（是否开始筛选每日住宿与交通）

#### 简要每日计划规则

每日必须包含：

- 当日主目标
- 当日次目标
- 核心活动区域/景点
- 建议时段（早/中/晚）
- 体力负荷（低/中/高）
- 天气风险提醒

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

Step 8 最终答复顺序（必须遵守）：

1. 推荐结论
2. 交通与住宿策略（按天）
3. 正常详细每日计划（含执行卡片）
4. 预算拆分
5. 打包清单
6. 礼仪与安全提示
7. 行前待办

链接规则（Step 8 适用）：

- 若存在来源链接（航班/高铁/酒店/景点/参考帖子），必须用 Markdown 可点击格式输出；
- 若该条目无可分享链接，明确标注“暂无可分享链接”。

推荐阶段值：

- `intake`
- `route_plan`
- `plan_ready`
- `ready_to_book`
- `in_trip`
- `completed`

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

常用命令：

```bash
node {baseDir}/scripts/db.mjs --cmd=is_initialized
node {baseDir}/scripts/db.mjs --cmd=add_trip --payload='<json>' --list=current
node {baseDir}/scripts/db.mjs --cmd=save_route_evidence --trip-id=<id> --platform=xhs --payload='<xhs_evidence_json>'
node {baseDir}/scripts/db.mjs --cmd=get_route_evidence --trip-id=<id>
node {baseDir}/scripts/db.mjs --cmd=get_preferences
node {baseDir}/scripts/db.mjs --cmd=get_trips --status=current
node {baseDir}/scripts/db.mjs --cmd=stats
node {baseDir}/scripts/plan-generator.mjs --trip-id=<id> --output=plan.json
node {baseDir}/scripts/db.mjs --cmd=export
```

## 资源索引

| Path | Role |
|------|------|
| `scripts/db.mjs` | 偏好、行程、预算摘要、导出（唯一状态存储层） |
| `scripts/route-plan.mjs` | 路线候选结构化输出 |
| `scripts/route-validation.mjs` | 校验计划与门限（不直接调用外部 API） |
| `scripts/plan-generator.mjs` | 读取已持久化的 trip，输出骨架计划、逐日卡片、打包建议（不主动调用其他计算模块） |
| `scripts/xhs-evidence-builder.mjs` | 规范化小红书搜索结果，输出 `xhs_evidence` 对象（第四步 xhs 链路必走） |
| `scripts/booking-ready.mjs` | 合并实时结果生成 booking-ready 包 |
| `scripts/briefing.mjs` | 行前/每日简报 |
| `references/travel_guidelines.md` | 研究、预算、节奏与安全清单 |
| `references/cultural_etiquette.md` | 礼仪与文化注意事项模板 |
| `references/example_dialogue.md` | 中文完整示例（先框线再细化） |
| `references/trigger_regression.md` | 触发/不触发回归检查 |
