---
name: travel-planner
description: "中文旅行规划技能。用于行程规划、路线框定、交通酒店策略、预算打包、行前/在途调整。路线框定支持小红书/高德地图/搜索引擎三选一，默认小红书并按失败自动降级。"
license: MIT
compatibility: Node.js for bundled CLI scripts; network for live checks. Optional skills flyai, 12306, amap-lbs-skill for booking-stage validation. Default DB paths ~/.openclaw/agents/travel-planner/.
metadata:
  openclaw:
    emoji: "✈️"
    requires:
      bins:
        - node
---

# Travel Planner

## `{baseDir}`（技能根目录）

下文中的 `{baseDir}` 指当前技能目录绝对路径（含 `SKILL.md` 与 `scripts/`）。运行命令时由宿主替换。示例命令统一使用 `node {baseDir}/scripts/xxx.mjs --key=value`。

**程序调用说明：** 在 OpenClaw runtime 中加载 `skills/travel-planner/index.js` 时，按正常相对路径导入模块，不要把 `{baseDir}` 填进真实 import 路径。

## 适用范围

- 行程规划、路线对比、交通酒店组合策略（从轻量建议到近预订方案）
- 与真实行程绑定的预算、打包、礼仪、安全、行前清单
- 行中改线、错过交通后的重排与当天应急建议

## 不适用范围

- 仅单点天气/冷知识问答（无行程决策）
- 非旅行类技术任务
- 纯创作型内容（无出行决策/执行）

## 产品定位

- 路线框定支持平台选择：`小红书`、`高德地图`、`搜索引擎`。
- 默认平台为 `小红书`，失败自动降级：`小红书 -> 高德地图 -> 搜索引擎`。
- 近预订阶段联动 `flyai`、`12306`、`amap-lbs-skill` 做验证。

## 兜底原则（伙伴技能或实时检查失败时）

`live_validation.mjs` 只生成检查计划，不会自动修复外部依赖故障。若调用失败：

1. 明确说明哪一项失败（`flyai`/`12306`/`amap-lbs-skill`/web）。
2. 仍可给路线框定与骨架方案，但价格/余票/时刻必须标注为**未验证**。
3. `booking_ready` 输入不完整时，不得宣称“可直接下单”。
4. 若已有阶段性结果，优先写入 `travel_db.mjs` 便于续跑。

## 核心原则

- 路线正确性优先于景点堆叠。
- 先问最少但高影响的问题，不做超长问卷。
- 到达日与返程日默认轻负荷。
- 每天最多“1 个主锚点 + 1 个附近备选”。
- 把体力、天气、换乘摩擦作为硬约束。
- 大区域目的地先“路线框定”，再展开逐日计划。

## 工作流

### Step 1：读取偏好

```bash
node {baseDir}/scripts/travel_db.mjs --cmd=is_initialized
```

- 若返回 `false`：进入轻量偏好采集。
- 若返回 `true`：读取已有偏好，仅补本次行程缺口。

### Step 2：轻量偏好采集（只问高影响项）

建议优先采集：

- 预算档位（经济/中档/高端）
- 节奏（轻松/适中/紧凑）
- 同行结构（独行/情侣/家庭/多人）
- 出发城市
- 核心兴趣（风景/美食/人文/摄影/亲子等）
- 交通偏好（自驾/包车/公共交通/短途航班可接受）
- 步行耐受与行动限制

保存时仅写入用户已明确提供的字段：

```bash
node {baseDir}/scripts/travel_db.mjs --cmd=save_preferences --payload='{"departure_city":"上海","budget_level":"mid-range","pace_preference":"moderate","travel_companions":"couple","interests":["nature","food","photography"],"transport_preferences":["private driver","short flight okay"],"walking_tolerance":"moderate"}'
```

### Step 3：尽早创建 trip 记录

用户进入具体目的地后，尽快建档（允许字段不完整）：

```bash
node {baseDir}/scripts/travel_db.mjs --cmd=add_trip --payload='{"destination_text":"新疆","destination":{"region":"Xinjiang","country":"China"},"duration_days":7,"budget":{"total":14000,"currency":"CNY"},"travelers":2,"activities":["nature","photography"],"constraints":["不自驾"],"transport_preferences":["private driver","short domestic flight okay"],"stage":"intake"}' --list=current
```

记录返回的 `trip_id`，后续都用 `--trip-id=<id>`。

### Step 4：先做路线框定

#### 目标

- 在用户进入大区域目的地后，先确定可执行路线，再进入逐日细化。
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
- `route_selector.mjs` 仅消费上游输入（`xhs_evidence`、`route_candidates`、`route_options`）并输出结构化候选。
- 当平台为 `xhs` 时，必须先走 `@skills/xiaohongshu` 检索链路；不允许用 browser 打开网页替代。

路线框定脚本：

```bash
node {baseDir}/scripts/route_selector.mjs --input='<trip_request_json_with_route_platform_metadata>'
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
   - `xhs` 写入 `xhs_evidence`；
   - `amap/web` 写入 `route_candidates` 或 `route_options`。
4. 调用 `route_selector.mjs` 输出候选路线。
5. 若失败（不可用/无结果/候选不足），记录失败原因并按降级链切到下一个平台，回到第 2 步。
6. 一旦成功，持久化路线框定（含平台与降级信息）：

```javascript
travel_planner({ mode: "persist_route_framing", tripId, trip });
```

7. 展示 `route_options` 并要求用户明确选择 `route_id`。
8. 持久化用户选择：

```javascript
travel_planner({ mode: "confirm_route_choice", tripId, routeId });
```

#### 硬性守卫（必须执行）

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

- 必须先完成该平台上游检索链路，再调用 `route_selector.mjs`。
- 不得跳过检索链路直接生成“已验证平台结果”。

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

### Step 5：轻验证（确认路线后）

#### 必须顺序（不可跳步）

1. 确认 `route_choice_confirmed=true` 且存在 `chosen_route_id`。
2. 使用当前 `trip + selected_route + preferences` 运行一次 `live_validation.mjs` 获取 `tool_plan`（仅生成 `skill_action + skill_input` 计划，不执行外部技能）。
3. 本步只做两类可行性核验：
   - 交通可达性（仅在“需要跨城长途交通”时执行）；
   - 天气窗口风险（始终执行）。
4. 酒店检索不在本步执行；仅允许给风险提醒（如旺季建议尽早锁房）。
5. 按 `tool_plan` 调用相关技能（`@skills/flyai`、`@skills/12306`、`@skills/amap-lbs-skill`、`@skills/weather`），不要跳过规划阶段直接乱调。
6. 将原始结果交给 `booking_ready.mjs`（或 `index.js` 的 `booking_ready/auto_validate`）输出轻结论：`go / caution / block`。
7. **必须向用户发起确认**（是否继续下一步）；未确认不得进入后续步骤。

```bash
# 仅构建验证计划（tool_plan），不直接执行外部 skill
node {baseDir}/scripts/live_validation.mjs --trip='<trip_json>' --route='<route_json>' --preferences='<prefs_json>'
```

`auto_validate` 默认是计划模式（`execute=false`），只返回：

- 验证计划
- booking 草案
- 用户下一步二选一（确认并继续 / 先调整路线或日期）

### Step 6：先给计划骨架，再给逐日细案

在长行程前先给可确认骨架，并二次确认：

- 选中的路线是否最终确认
- 交通 + 酒店策略是否确认
- 是否进入逐日执行卡片生成

骨架来源：

```bash
node {baseDir}/scripts/plan_generator.mjs --trip-id=<id>
```

优先展示：`route_framing`、`live_validation`、`plan_skeleton`、`booking_strategy`。

#### Step 6 输出格式（必须先展示总结卡片）

先输出“计划骨架总结”，再问确认；未完成确认不进入 Step 7。
这一步必须是一个**独立回复回合**（先总结，再等用户确认），不得与 Step 7 合并在同一回复里。

建议模板：

1. `路线结论`：已选 `route_id` + 1 行推荐理由
2. `轻验证结论`：`go / caution / block` + 天气/交通关键提醒
3. `策略摘要`：交通策略（按需）+ 酒店策略（后置细化）
4. `待确认项`：最多 2-3 条（如日期是否微调、是否接受某段长转场）
5. `确认问题`：`是否确认按该骨架进入逐日详细计划？`

Step 6 完成门槛（全部满足才可进入 Step 7）：

- 已输出 Step 6 总结卡片；
- 已收到用户明确确认（如“确认/继续/按这个走”）；
- 已在上下文中记录 `light_validation_confirmed = true`（或等效确认状态）。

### Step 7：生成详细计划（满足硬门槛）

必须满足：

- `route_choice_confirmed === true`
- `selected_route` 已存在
- `light_validation_confirmed === true`（用户已确认 Step 5 结论）
- `booking_ready.status === "ready"`（或用户明确接受未就绪草案）

合成 booking-ready：

```bash
node {baseDir}/scripts/booking_ready.mjs --trip='<trip_json>' --route='<route_json>' --validation='<live_validation_json>' --results='<live_results_json>'
```

`live_results_json` 典型字段：

- `flights`（`flyai search-flight`）
- `hotels`（`flyai search-hotel`）
- `pois`（`flyai search-poi`）

`live_results_json` 应保留原始工具输出（即工具返回的原始结果），例如：

- `flights`：`flyai search-flight` 的结果
- `hotels`：`flyai search-hotel` 的结果
- `pois`：`flyai search-poi` 的结果

使用生成后的 `booking_ready` 部分来选择：

- 首选交通方案
- 首选酒店基地与 2-3 个候选酒店/酒店区域
- 应保留在最终行程中的核心锚点景点

最终答复顺序（必须遵守）：

1. 推荐结论
2. 实时交通与酒店验证摘要
3. 交通与住宿策略
4. 逐日执行卡片
5. 预算拆分
6. 打包清单
7. 礼仪与安全提示
8. 行前待办

补充规则：若任一条目存在来源链接（如航班/酒店/景点/参考帖子），必须在该条目中附上可点击链接；若没有可分享链接，明确标注“暂无可分享链接”。

#### 近预订输出规则

当用户接近预订时，答复不应只说“我也可以继续帮你查酒店/机票”。必须包含：

- 一个首选交通模式；
- 2-3 个酒店候选或酒店区域；
- 对路线产生影响的关键实时约束；
- 任何“需要尽快锁定”的项目；
- 若未完全验证，明确剩余不确定项。

#### 每日执行卡片规则

每日必须是执行卡片，而不是景点清单。每一天都应包含：

- 当日主目标
- 当日次目标
- 时间锚点
- 转场策略
- 餐食策略
- 体力负荷
- 预订风险提醒
- 天气备选方案

使用 `plan_generator.mjs` 生成的行程结构作为骨架，并在完成交通与酒店选择后填充真实 POI。

### Step 8：行前服务（用户开始预订后）

进入执行态后建议持久化：

```bash
node {baseDir}/scripts/travel_db.mjs --cmd=save_live_results --trip-id=<trip_id> --payload='<live_results_json>'
node {baseDir}/scripts/travel_db.mjs --cmd=save_booking_ready --trip-id=<trip_id> --payload='<booking_ready_json>'
node {baseDir}/scripts/travel_db.mjs --cmd=patch_trip --trip-id=<trip_id> --payload='<partial_json>'
node {baseDir}/scripts/travel_db.mjs --cmd=confirm_booking --trip-id=<trip_id> --category=hotel --payload='<selected_hotel_json>'
```

推荐阶段值：

- `intake`
- `route_framing`
- `plan_ready`
- `ready_to_book`
- `in_trip`
- `completed`

### Step 9：行中支持

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
node {baseDir}/scripts/travel_db.mjs --cmd=start_trip --trip-id=<trip_id>
```

### Step 10：行后沉淀

程序接口：

- `moveTripToPast(tripId)`
- `addPreviousDestination("城市, 国家")`
- `updatePreference` / `savePreferences`

更新可复用偏好：真实节奏承受、酒店风格偏好、是否厌恶频繁换酒店、兴趣权重变化等。

## 示例与回归

- 完整中文示例：`references/example_dialogue.md`
- 描述与触发回归：`references/trigger_regression.md`

## 备注

- 数据文件：`~/.openclaw/agents/travel-planner/preferences.json`、`~/.openclaw/agents/travel-planner/trips.json`
- CLI 统一入口：`node {baseDir}/scripts/<script>.mjs --key=value`

常用命令：

```bash
node {baseDir}/scripts/travel_db.mjs --cmd=is_initialized
node {baseDir}/scripts/travel_db.mjs --cmd=add_trip --payload='<json>' --list=current
node {baseDir}/scripts/travel_db.mjs --cmd=get_preferences
node {baseDir}/scripts/travel_db.mjs --cmd=get_trips --status=current
node {baseDir}/scripts/travel_db.mjs --cmd=stats
node {baseDir}/scripts/plan_generator.mjs --trip-id=<id> --output=plan.json
node {baseDir}/scripts/travel_db.mjs --cmd=export
```

## 资源索引

| Path | Role |
|------|------|
| `scripts/travel_db.mjs` | 偏好、行程、预算摘要、导出 |
| `scripts/plan_generator.mjs` | 路线框定、计划骨架、逐日行程、打包建议 |
| `scripts/live_validation.mjs` | 校验计划与门槛（不直接调用外部 API） |
| `scripts/route_selector.mjs` | 路线候选结构化输出 |
| `scripts/booking_ready.mjs` | 合并实时结果生成 booking-ready 包 |
| `scripts/briefing.mjs` | 行前/每日简报 |
| `references/travel_guidelines.md` | 研究、预算、节奏与安全清单 |
| `references/cultural_etiquette.md` | 礼仪与文化注意事项模板 |
| `references/example_dialogue.md` | 中文完整示例（先框线再细化） |
| `references/trigger_regression.md` | 触发/不触发回归检查 |
