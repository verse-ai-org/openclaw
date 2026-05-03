# Step 2 - Evidence & Route Choice（证据→可选预览→选线锁定）

## 目标
主要目标是帮用户搜集总结几条可行的旅行路线，用户可以选择不同的平台来进行路线信息的搜集（搜索/小红书）。根据用户选择的平台搜集整理相关路线信息，为用户提供不同的路线选择。最终产出路线信息`route-evidence.json`和路线预览信息`poi-preview.json`

## 守卫
**进入条件**：已存在 `trip_id`，`trip.stage === intake`
**失败/降级**：平台/工具失败须透明降级（见 `references/capability-matrix.md`）；两平台都失败→不得给出可执行最终路线承诺

## 1. 平台选择与路线信息整理
- 基于外部平台证据（搜索 / 小红书 / 用户粘贴）生成 2-3 条候选路线（带 `route_id`）
- 路线信息整理，将信息归一化处理，方便后续处理

### 1.1 平台选择
**必须让用户选择确认**
调用`option_list`，**必须直接使用**`examples/option-list.route-platform-choice.json`作为`option_list`的payload参数，不得臆造。

守卫：
- 必须等用户回答，不得自行跳过
- 未指定时默认 `search`（Brave）
- 降级（`xhs -> search`）时必须显式提示，并说明原因

### 1.2 从选择的平台上搜集路线信息
按所选平台执行：
- **search**：使用搜索引擎检索路线证据，结果归一化写入 `RouteEvidence` 结构，字段说明与 JSON 示例见 `references/route-protocol.md`）。
- **xhs**：调用 `@skills/xiaohongshu` 的 `search-feeds` + `get-feed-detail`
  - 查询词：`J人<目的地><days>天行程安排`
  - 过滤：`--note-type 图文 --sort-by 最多点赞`，只保留前>=2条图文笔记
  - 若 detail 失败/超时/空：进入1.2.1
- **用户手动粘贴**：直接作为证据，标记
  - `verification_status=user_input_unverified`
  - `evidence_source=user_input_xhs|user_input_search`

### 1.2.1 xhs 异常分流
**必须向用户发起二选一确认**：
1. 用户手动提供小红书内容 -> 走“用户手动粘贴”，标记 `evidence_source=user_input_xhs`
2. 切换到搜索 -> 记录 `fallback_reason=xhs_detail_unavailable`，提示“已降级到搜索”，重新走 search 链路

用户未明确选择前，不得进入 1.3。

### 1.3 归一化并持久化证据
- 将本轮的路信息归一化为 `RouteEvidence` 结构，并写入 `route-evidence.json`（字段说明与 JSON 示例见 `references/route-protocol.md`）。
  - **必须满足协议字段**：`platform`、`destination`、`duration_days`、`verification_status`、`generated_at`、`sources[]`、`routes[]`
  - `routes[]` 数量必须>=2条；每条路线必须包含 `route_id/title/summary/stops[]`
  - `stops[]` 中每个点必须包含 `name/day`，且 `day <= duration_days`
  - `xhs`：用 `search-feeds/get-feed-detail` 获取内容后，由 agent 直接生成结构化 `route-evidence.json`
  - `search`：由 agent 将搜索结果归一化写入 `route-evidence.json`
  - 用户粘贴：直接写入并标记 `verification_status=user_input_unverified`

守卫：`save_route_evidence` 返回 `ok=true` 才能继续，否则终止并报告失败原因。

```bash
node {baseDir}/scripts/workflow.mjs --cmd=save_route_evidence \
  --trip-id=<trip_id> \
  --payload=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/route-evidence.json
```

## 2. 景点查询与预览
**目的**：选线前用少量**带图景点**增强可读性，方便对比候选线；本步预览**不参与**后续「单条路线落盘」的硬校验（权威景点数据在 Step 3 完成）。
**脚本边界**：`scripts/poi.mjs` **不会**自动查全局缓存，也**不会**代调地图技能；是否命中缓存、是否调用 `@skills/amap-lbs-skill`，均由执行方按下列步骤编排（与 Step 3「景点详情」同一套**全局缓存 → 未命中再查地图 → 再落盘**语义；协议级说明见 `references/route-protocol.md` 中 **`poi-preview` 与全局 `data/poi/`** 相关段落）。
**对每个抽样景点**（见下「抽样」）依次执行，在内存中累积多条**预览条目**，**勿每点单独落盘**：
1. **只读查全局**：是否已有「检索用词 + 目的地范围」对应的缓存结果：
   ```bash
   node {baseDir}/scripts/poi.mjs --cmd=resolve \
     --query-name="<与路线证据中的点名一致>" \
     --context-key="<route-evidence.destination>"
   ```
2. **仅当返回未命中**（`hit=false`）：调用 `@skills/amap-lbs-skill` **至多一次**，整理为一条预览条目。字段须满足落盘前校验及模板 `examples/poi-preview.template.json`（例如根级 `source`、`context_key`；每条须含高德侧景点唯一标识字段 `poi_id`、展示名 `name`、检索用词 `query_name`、经纬度、解析时间 `resolved_at`、**非空**配图 `image` 等）。
3. **抽样**：每条候选线 ≤**2** 个景点，合计在**未命中之后**调用地图技能 ≤**6** 次；所选点名须能在 `route-evidence` 各线 `stops[]` 中对上。
4. **组装预览对象**：根级 `context_key` = `route-evidence.destination`；`entries[]` 为上述全部预览条目。

**落盘（一次命令：先写全局景点库，再写本 trip 预览文件）**（路径相对 `TRAVEL_PLANNER_DB_DIR`，默认即 `~/.openclaw/agents/travel-planner/...`）：

```bash
node {baseDir}/scripts/poi.mjs --cmd=save_preview \
  --trip-id=<trip_id> \
  --payload=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/poi-preview.json
```

`save_preview` 会先 upsert 全局目录 `data/poi/`（逐条景点记录 + 按「检索词 + 目的地范围」建立的查询索引），再写入 `data/trips/<trip_id>/poi-preview.json`（磁盘文件名仍为历史命名 `poi-preview.json`）。

## 3. 展示预览景点
选线前用 `item_carousel` 展示预览景点，数据以本步落盘的 `poi-preview.json` 为准。

## 4. 用户选择路线并锁定
1. 使用 `option_list` 让用户在 `route-evidence.routes[]` 的 `route_id` 中选择（payload 可参考 `examples/option-list.route-choice.json`，`options[].id` 必须为真实 `route_id`）。
2. 用户确认后，**必须**调用下面脚本记录：

```bash
node {baseDir}/scripts/workflow.mjs --cmd=save_route_choice \
  --trip-id=<trip_id> \
  --route-id=<route_id>
```

守卫：
- `save_route_evidence` 已成功；`route_id` 必须存在于 `route-evidence.json`
- `ok=true` 后：`trip.stage` 变为 **`route_selected`**，`trip.chosen_route_id` 已写入

**下一步**：`workflows/step3-route-poi-and-plan.md`。
