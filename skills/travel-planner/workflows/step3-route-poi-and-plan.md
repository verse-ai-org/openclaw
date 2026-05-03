# Step 3 - 选中路线的景点详情和最终路线确认

## 目标
用户在上一步完成路线选择后，整理**选中路线**上各站的景点详情（坐标、配图等），生成可确认的单条行程计划并落盘，产出路线详情 `route-plan.json`。

## 守卫
**前置**：已完成 `workflows/step2-evidence-and-route-choice.md`，且 `trip.stage === route_selected`、`trip.chosen_route_id` 非空。
**失败/降级**：景点查询失败 / 落盘失败须报告原因；不得伪造已确认路线。

## 1. 景点查询（脚本边界）
**`scripts/poi.mjs` 不会自动查全局缓存，也不会代调地图技能**；是否命中缓存、是否调用 `@skills/amap-lbs-skill`，均由执行方编排。与 Step 2「景点预览」共用同一套语义：**全局缓存 → 未命中再查地图 → 再落盘**（协议说明见 `references/route-protocol.md` 中 **`poi-cache`、全局 `data/poi/`** 相关段落）。

**`save_cache` 实际顺序**：对 payload 做**落盘前校验**（与模板 `examples/poi-cache.template.json` 一致）→ **先**更新全局景点库 `data/poi/`（逐条景点记录 `entries/*.json` + 按「检索词 + 目的地范围」的查询索引 `query-index.json`）→ **再**写本 trip 的 **`poi-cache.json`**（磁盘文件名仍为历史命名）；并追加事件 `poi_cache_saved`。

**本步景点数据的定位**：主决策载体是 **`route-plan.json`**。**`poi-cache.json`** 是 `save_route_plan` gate 要求的、**本线每一站**对应的景点绑定快照（可与 Step 2 的 `poi-preview.json` 并存为「预览子集 vs 全线权威」；**检索与落盘顺序不变**）。

**与 Step 2 的全局复用**：若某 `query_name + context_key` 已在 Step 2 `save_preview` 写入全局，本步对该站执行 `resolve` 应 **命中**（`hit=true`），**禁止**再无意义调用地图技能（仅统计 **未命中之后** 的调用次数）。

## 2. 读取选中路线
从磁盘读取 `route-evidence.json`，在 `routes[]` 中取出 `route_id === trip.chosen_route_id` 的那一条，得到 `stops[]`（`name` + `day`）。**不得**改用其他 `route_id`。

## 3. 权威景点预取（逐点编排 → 一次落盘）
对 **该线** `stops[].name` **去重**后的每个站名，**按顺序**执行（内存中累积多条**缓存条目** `entries[]`，**勿每站单独 `save_cache`**）：

1. **只读查全局**：是否已有「检索用词 + 目的地范围」对应结果：
   ```bash
   node {baseDir}/scripts/poi.mjs --cmd=resolve \
     --query-name="<与后续 stop 规范点名一致>" \
     --context-key="<route-evidence.destination>"
   ```
   若**已命中**（`hit=true`），可直接用返回中的景点唯一标识、坐标、配图等组装一条缓存条目，**不必**再调地图技能。
2. **仅当未命中**（`hit=false`）：调用 `@skills/amap-lbs-skill` **至多一次**，整理为一条 `entries[]` 元素。字段须满足落盘前校验及模板 `examples/poi-cache.template.json`（例如根级 `source` 须为 `"amap-lbs-skill"`、`context_key` 非空；每条须含高德侧景点唯一标识字段 `poi_id`、展示名 `name`、检索用词 `query_name`、经纬度、`resolved_at`、**非空**配图 `image` 等）；字段映射见 `references/route-protocol.md`。
3. 全部站点处理完后，组装完整 **`poi-cache.json`**（根级 `context_key` = `route-evidence.destination`，与各条 `query_name` 所用 `context_key` 一致）。

**落盘（一次命令：先写全局景点库，再写本 trip 缓存文件）**（路径相对 `TRAVEL_PLANNER_DB_DIR`，默认即 `~/.openclaw/agents/travel-planner/...`）：
```bash
node {baseDir}/scripts/poi.mjs --cmd=save_cache \
  --trip-id=<trip_id> \
  --payload=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/poi-cache.json
```
**`query_name` 约定**：可与地图检索入参一致或带后缀消歧；须与后续 `route-plan.json` 中 `stop_points[].name` 的规范点名一致，以满足 `save_route_plan` 与 **`poi-cache.json`** 的覆盖校验。

## 生成单条 `route-plan.json`
- `route_options` **数组长度必须为 1**。
- 唯一元素的 `route_id` / `title` / `summary` / `stop_points[]` 须与 evidence 中该线一致语义；`stop_points` 须含 `poi_id`、`name`、`lat`、`lng`（与 **`poi-cache.json`** 中对应条目一致），`image` / `detail_url` 可留空由 `save_route_plan` 按缓存回填。

## 持久化路线规划（`save_route_plan`）
守卫：`trip.stage === route_selected`；`save_route_evidence` 已成功；`route_options.length === 1` 且 `route_id` 与 `trip.chosen_route_id` 一致。

```bash
node {baseDir}/scripts/workflow.mjs --cmd=save_route_plan \
  --trip-id=<trip_id> \
  --payload=@~/.openclaw/agents/travel-planner/data/trips/<trip_id>/route-plan.json
```

成功后 `trip.stage === route_planned`。

## 可视化路线
在 `save_route_plan` 返回 `ok=true` 后，基于落盘 `route-plan.json` 可视化路线信息：
- 渲染 `item_carousel`（映射规则：按 `stop_points[]` 逐项）。
- 渲染 `geo-map`（映射规则：按 `stop_points[]` 逐项）。

## 用户确认（`approval_card`）→ 再落盘「路线已确认」
**不得**在未获用户明确同意前调用 `confirm_route_choice`。在完成上述可视化后，必须发起 **`approval_card`** 让用户确认是否采用当前 **`route-plan.json`**（与 `trip.chosen_route_id` 一致）。
**payload 必须直接使用** `examples/approval.route-plan.json` 作为 `approval_card` 的入参（仅允许改文案以贴合本 trip，**不得**臆造字段或省略 `id`）。

守卫：
- 调用 `approval_card` 后必须 **STOP**，等待用户提交（与 `SKILL.md` 交互守卫一致）。
- **仅当** `metadata.interaction.payload.decision === "approved"` 时，才允许执行下方的 `confirm_route_choice`。
- **`denied` / 取消**：不得调用 `confirm_route_choice`。按用户说明调整（例如改 `stop_points`、重跑景点缓存与 `save_route_plan`），必要时重新展示可视化并**再次**发起 `approval_card`，直至用户确认。

## 确认路线（`confirm_route_choice`）
**仅**在用户已通过 `approval_card` 明确同意后执行：

```bash
node {baseDir}/scripts/workflow.mjs --cmd=confirm_route_choice \
  --trip-id=<trip_id> \
  --route-id=<trip.chosen_route_id 相同值>
```

守卫：
- `trip.stage >= route_planned`；`route-id` 必须与 `trip.chosen_route_id` 及 `route-plan` 内唯一 `route_id` 一致。
- `ok=true` 后：`trip.stage === route_confirmed`。

**下一步**：`workflows/step4-validate-transport-weather.md`。
