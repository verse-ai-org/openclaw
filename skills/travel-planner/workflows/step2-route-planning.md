# Step 2 - Route Planning（证据→候选路线→用户选择→持久化）

本文件覆盖主流程 Step 2（A-1 ~ A-9）。

**进入条件**：已存在 `trip_id`，并需要“框定路线/对比路线/基于证据生成路线”。
**产出**：`route-plan.json` + `chosen_route_id`（确认后）+ 对应持久化状态（evidence/plan/choice）。
**失败/降级**：平台/工具失败必须透明降级（见 `references/capability-matrix.md`）；两平台都失败→不得给最终路线。

## 目标

- 基于外部平台证据（搜索 / 小红书 / 用户粘贴）生成 2-3 条候选路线（带 `route_id`），并让用户确认选择
- 内容驱动优先；支持用户手动粘贴作为证据
- 大 JSON 必须通过 `@file` 方式传递，禁止在命令行内联超长 JSON

字段说明与 JSON 示例参见 `references/route-protocol.md`。

## A-1｜平台选择（必须让用户选择确认）

调用 `option_list` 工具让用户二选一（payload 使用 `examples/option-list.route-platform-choice.json`）。
- **必须直接使用** `examples/option-list.route-platform-choice.json` 作为 `option_list` 的 payload（原样发送，不得手写/复述选项内容）。

守卫：
- 必须等用户回答，不得自行跳过（例外：用户已明确说“按搜索/用小红书/默认”）
- 未指定时默认 `search`（Brave）
- 降级（`xhs -> search`）时必须显式提示，并说明原因

## A-2｜拉取平台证据

按所选平台执行：

- **search**：使用搜索引擎检索路线证据，结果归一化写入 `routes[]`（每条含 `stops[]`）
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

- 将本轮的路线证据归一化为 `RouteEvidence` 结构，并写入 `route-evidence.json`（字段说明与 JSON 示例见 `references/route-protocol.md`）。
  - **必须满足协议字段**：`platform`、`evidence_version="v2"`、`destination`、`duration_days`、`verification_status`、`generated_at`、`sources[]`、`routes[]`
  - `routes[]` 数量必须为 2-3 条；每条路线必须包含 `route_id/title/summary/stops[]`
  - `stops[]` 中每个点必须包含 `name/day`，且 `day <= duration_days`
  - `xhs`：用 `search-feeds/get-feed-detail` 获取内容后，由 agent 直接生成结构化 `route-evidence.json`
  - `search`：由 agent 将搜索结果归一化写入 `route-evidence.json`
  - 用户粘贴：直接写入并标记 `verification_status=user_input_unverified`

所有平台统一持久化（`RouteEvidence`）：

```bash
node {baseDir}/scripts/workflow.mjs --cmd=save_route_evidence \
  --trip-id=<trip_id> \
  --payload=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/route-evidence.json
```

守卫：`save_route_evidence` 返回 `ok=true` 才能继续，否则终止并报告失败原因。

后续需要 evidence 路径时：
- 直接读取 `~/.openclaw/agents/travel-planner/data/trips/<trip_id>/route-evidence.json`

## A-4｜POI 预取（强制，不可跳过）

目的：在路线生成前准备好 POI 的图片/坐标数据，保证第一次渲染路线 UI 就能带图与点位。

POI 查询必须由 agent 调用 `@skills/amap-lbs-skill` 完成。该步骤需要将结果以可审计形式落盘为 `poi-cache.json`，并在保存路线规划时强制校验（gate）。

**强制编排约束（不满足即视为 A-4 未完成，禁止进入 A-5）：**
- **禁止提前 POI 查询**：在 A-3 未 `ok=true` 前，禁止调用任何 POI/地图类工具（包括 `@skills/amap-lbs-skill`）。如果 A-3 失败（例如 JSON 不合法），必须先修复 `route-evidence.json` 并重跑 `save_route_evidence`，然后才允许进入 A-4。
- 必须先完成 A-3（`route-evidence.json` 已落盘）。`merged_points[]` 由 `save_route_evidence` 在落盘时根据 `routes[].stops[].name` 自动合并写入；A-4 前请**重新从磁盘读取** `route-evidence.json`，不得沿用保存前的内存草稿。
- **权威输入来源**：A-4 的点名列表只能来自“已落盘”的 `route-evidence.json.merged_points[]`（从磁盘读取）；不得使用 agent 临时草稿/脑内列表/未落盘版本，避免漏查/乱查。
- 必须逐个遍历 `route-evidence.json.merged_points[]` 做 POI 查询，生成 `poi-cache.entries[]`
- **`query_name` 与 gate**：`save_route_plan` 会校验每个 `merged_points[]` 点名都能在 `entries[].query_name` 中找到**完全一致**的字符串（忽略大小写）。因此：对每个合并点名，**至少一条** cache entry 的 `query_name` 必须等于该点名本身（与 evidence 里 stop 名称对齐）。
- 每个 entry 必须包含 **有效图片**（`image` 非空），且 `scripts/lib/schema.mjs` 对 `poi-cache` 校验要求 `image` 必填；若某个点查不到图：必须重试/改检索词直到拿到图（最多 2 次），否则终止 Step 2 并报告缺图点名与查询词。

推荐重试策略（按顺序尝试，最多 2 次）：
- 第一次：用检索词 `=<点名>` 调 POI 搜索；落盘时该条 entry 的 **`query_name` 仍填规范点名**（与 `merged_points[]` 一致），`name` 填高德返回的展示名。
- 若命中结果无图：检索词可改为 `"<点名> 景区"` / `"<点名> 风景区"` / `"<点名> 观景台"` 等再搜，并优先选择带 photos 的结果；**仍须保证**存在一条 `query_name` 等于原始点名的 entry（通常即：该合并点对应**唯一**一条 cache 行，`query_name` 用规范点名，`poi_id/name/lat/lng/image` 填最终选中的 POI）。
  - 避免命中 “政府/行政区/停车场/售票处/游客中心” 等类型导致无图

1) agent 调用 `@skills/amap-lbs-skill` 的 POI 能力（优先关键词 POI 搜索）获取每个点的 POI（含坐标/图片/详情链接）
2) agent 遍历 `route-evidence.merged_points[]`（去重后的点名字符串数组），对每个点名完成检索与选点
3) agent 将结果组装为 `poi-cache.json`（`source="amap-lbs-skill"` + `entries[]`，每个 entry 必须包含 `poi_id/name/lat/lng/resolved_at/query_name/image`，可选 `detail_url/raw`）
4) 调用脚本落盘：

```bash
node {baseDir}/scripts/poi.mjs --cmd=save_cache \
  --trip-id=<trip_id> \
  --payload=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/poi-cache.json
```

可直接参考模板：`examples/poi-cache.template.json`

`@skills/amap-lbs-skill` 到 `poi-cache` 的字段映射（推荐）：
- `poi.id` -> `entries[].poi_id`（主键，route-plan 必须按此关联）
- `poi.name` -> `entries[].name`（标准展示名，建议用于 stop 名称）
- **规范点名（与 `merged_points[]` 一致）** -> `entries[].query_name`（参与 `merged_points` 覆盖 gate，见上文）
- `poi.location`（`lng,lat` 字符串）-> `entries[].lng/lat`
- `poi.photos[0].url`（若存在）-> `entries[].image`
- `poi.type/typecode/address/tel`（若可用）-> `entries[].raw.*`
- `resolved_at` 使用当前 ISO 时间（agent 写入）
- `detail_url`：仅当可由可靠规则（如官方详情页模板）稳定生成时写入；否则留空

## A-5｜生成 `route-plan.json`（由 agent/tool 负责）

组装输出到 `route-plan.json`（文件结构见 `references/route-protocol.md`）：

与 `poi-cache` 的关系约束（由 `save_route_plan` gate 校验）：
- 在生成 `route-plan.json` 时，必须在 `route_options[].stop_points[]` 内联填充 `poi_id/name/lat/lng`，`image/detail_url/subtitle` 可选
- `stop_points[].name` 可以是简称/展示名；真正用于匹配与回填详情的是 `poi_id`（以及其在 `poi-cache` 中对应的 `lat/lng`）。
- `poi-cache.json.entries` 必须是数组，且每个元素必须包含唯一 `poi_id`（示例：`[{ poi_id, name, lat, lng, ... }]`）。
- 路线候选中的所有 stop（`route_options[].stop_points[].poi_id`）都必须能在 `poi-cache.json.entries[].poi_id` 中找到对应项；否则 `save_route_plan` 会拒绝落盘（gate）。
- `route_options[].stop_points[].lat/lng` 必须与 `poi-cache` 中同 `poi_id` 项一致；不一致会被 gate 拒绝
- `route_options[].stop_points[].image` 若提供，必须与 `poi-cache` 中同 `poi_id` 项一致；若 cache 无图则不得自填图片
- `route_options[].stop_points[].detail_url` 若提供，必须与 `poi-cache` 中同 `poi_id` 项一致；若 cache 无链接则不得自填
- 若 stop 未填 `image` 且 `poi-cache` 有图，`save_route_plan` 会自动回填缓存图
- 若 stop 未填 `detail_url` 且 `poi-cache` 有链接，`save_route_plan` 会自动回填缓存链接
- 不得伪造图片 URL。`stop_points[].image` 可留空交由 `save_route_plan` 按 `poi-cache` 回填；`poi-cache` 侧每条 entry 仍须含非空 `image`（见 A-4）。

强制约束：
- 禁止把“未归一化的大段证据文本”直接塞进路线候选结构；应先归一化写入 `route-evidence.json`，再由 agent 依据其内容生成候选路线
- 必须优先以 `route-evidence.json.routes[]` 作为候选路线输入来源（不得再依赖 `route_hints`）
- 每个候选路线的 `stop_points[]` 必须内联 `poi_id/name/lat/lng`（`image/detail_url/subtitle` 可选）
- 建议：优先只填 `poi_id/name/lat/lng`，`image/detail_url` 尽量留空，交由 `save_route_plan` 根据 `poi-cache` 自动回填，避免手填不一致导致落盘失败
- `route-plan.route_options[].route_id` 必须与 `route-evidence.routes[].route_id` 一致（保持单一 ID 语义）

输出检查：
- `route_tool_ui_ready=true` 且结构完整 -> 下一步为 **A-6**（`save_route_plan` 过 gate 落盘）。
- `false` 或缺 `stop_points`/候选数不足等 -> 修正 evidence 或 `route-plan` 后重试（最多一次）。
- **`poi-cache` 与 schema**：当前脚本要求每条 cache entry 含非空 `image`，Step 2 **不支持**「全无图仍落盘路线」；无图须在 A-4 解决或终止。

## A-6｜持久化路线规划（save_route_plan）

**前置**：紧接 A-5；`route-plan.json` 内容须满足 gate（与 `poi-cache`、`route-evidence` 一致）。大 JSON 用 `--payload=@文件`。

守卫（必须同时满足）：
- `save_route_evidence` 已 `ok=true`
- `route_options.length >= 2`

```bash
node {baseDir}/scripts/workflow.mjs --cmd=save_route_plan \
  --trip-id=<trip_id> \
  --payload=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/route-plan.json
```

失败时：只报告原因与下一步动作，不得伪造“已确认路线”。

## A-7｜渲染图文路线

**前置**：已完成 **A-6** `save_route_plan` 且返回 `ok=true`，再读取落盘后的 `route-plan.json`（与 `poi-cache.json` 一致）进行渲染。

目标：将**已通过 gate 落盘**的 `route-plan.json` 渲染为每条路线一个 `item_carousel`，用于路线对比与后续选择；渲染数据必须严格锚定 POI gate 产物，禁止“手写重组”导致图片/坐标错绑。

### A-7-1｜权威输入（不得替换）

- **路线数据唯一来源**：`route-plan.json.route_options[]`
- **stop 唯一来源**：对应路线下的 `stop_points[]`
  - `stop_points[].image/detail_url`（若存在）只能来自 POI gate（`save_route_plan` 自动回填或与 `poi-cache.json` 一致），不得自造/兜底复用

### A-7-2｜渲染规则（强制）

1. **按路线分组**：`route_options[]` 中每条路线渲染一个独立 `item_carousel`
2. **item 粒度固定为 stop**：`item_carousel.items[]` 必须一一对应该路线的 `stop_points[]`
3. **字段映射（逐 stop 映射，不得跨 stop 复用）**：
   - `item.name` ← `stop_points[].name`
   - `item.lat/lng` ← `stop_points[].lat/lng`（用于地图/点位联动；不得从其它来源覆盖）
   - `item.image` ← `stop_points[].image`（可空；**不得用“首图/通用图”兜底填充**）
   - `item.actions[detail].url` ← `stop_points[].detail_url`（仅当存在且可验证）
   - `item.subtitle`：允许补充信息，但不得影响上述字段的权威性
4. **路线元信息保留（carousel 外层）**：每条路线必须保留 `route_id + title + summary`（用于对比与 `option_list` 选择）
5. **文字降级**：若 stop 缺图/无详情链接，仍要渲染卡片（只展示文字 + 坐标）；并保留文本版路线摘要作为兜底

### A-7-3｜Day 信息处理（可选但需一致）

- Day 仅用于展示，**不得参与 POI 匹配或图片选择**。
- 若需要展示 Day：从 `route-evidence.json` 中同 `route_id` 的 `stops[].day` 补充到 `item.subtitle`。
  - 注意同名 stop（如“成都”进出各一次）会出现多次：必须按出现顺序依次消费 day 值，禁止“按 name 取第一个 day”导致错位。

### A-7-4｜推荐做法（避免手写错误）

本技能**不提供** `build_route_carousels` 脚本。推荐：**不要手写/重组 stop 的图片字段或自行拼装 carousel items**；严格按 **A-7-2** 的字段映射，从已落盘的 `route-plan.json.route_options[].stop_points[]` 逐项生成 `item_carousel`（必要时用只读脚本或本地校验打印 JSON，但不要调用不存在的 workflow 子命令）。

若 `option_list_allowed=false`：禁止发起 `option_list`；严格按 `step4_tool_call_order`。

## A-8｜让用户选择路线

图文渲染后再发起 `option_list`（payload 见 `examples/option-list.route-choice.json`）。

约束：
- `options[].id` 与 `label` 必须使用真实 `route_id`（不得造映射 ID）
- 若用户已在本轮明确说出 `route_id`，可直接采用

## A-9｜持久化用户选择 + 清理临时文件

守卫：用户已明确选中 `route_id` 后才能执行。

```bash
node {baseDir}/scripts/workflow.mjs --cmd=confirm_route_choice \
  --trip-id=<trip_id> --route-id=<route_id>
```

`ok=true` 后清理本轮临时文件（如有）。不得删除 `data/trips/<trip_id>/` 下的权威产物（`route-evidence.json` / `route-plan.json`）。
