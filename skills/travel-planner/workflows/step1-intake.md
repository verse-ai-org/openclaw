# Step 1 - Intake（偏好与 Trip 建档）

本文件覆盖主流程 Step 1：读取偏好 → 轻量偏好采集（交互）→ Trip 建档与 active trip 守卫。

**进入条件**：用户提出要规划行程（目的地/天数/预算/路线对比/改线等）。
**产出**：偏好（可选）+ `trip_id`（用于后续所有步骤）。
**失败/降级**：交互不可用→文本问答；存在 active trip→必须先让用户选择继续/新建。

## 读取偏好

### 执行命令

```bash
node {baseDir}/scripts/preferences.mjs --cmd=is_initialized
```

- 返回 `false`：进入“轻量偏好采集”
- 返回 `true`：读取已有偏好，仅补本次行程缺口

### 配置文件路径

- Preferences: `~/.openclaw/agents/travel-planner/preferences.json`
- Trips: `~/.openclaw/agents/travel-planner/trips.json`

## 轻量偏好采集

只问高影响项，不做超长问卷。

在交互式通道（Control UI）中，必须调用交互工具（`question_flow`），而不是直接输出文字问答，让前端渲染交互式问卷卡片。

偏好采集的完整 `question_flow` payload 请使用 `examples/question-flow.preference.json`（不要在正文内联大 JSON）。

### 保存用户偏好

用户完成问卷后，回答正文为 Q/A 文本，结构化数据在 `metadata.interaction.payload`。

- 优先读取 `metadata.interaction.payload`
- 若缺失，再回退解析纯文本（每步一行：`步骤标题：选中选项标签`）

保存时仅写入用户已明确提供的字段：

```bash
node {baseDir}/scripts/preferences.mjs --cmd=save_preferences --payload='{"departure_city":"上海","budget_level":"mid_range","pace_preference":"moderate","travel_companions":"couple","interests":["nature","food","photography"],"transport_preferences":["private_car","short_flight_ok"],"walking_tolerance":"moderate"}'
```

## 创建 Trip 记录

### 硬守卫（不可跳过）

在执行 `add_trip` 之前，必须先查询是否有进行中的行程：

```bash
node {baseDir}/scripts/trips.mjs --cmd=get_active_trips
```

- 若返回 `active_trips` 为空数组：直接新建
- 若返回有 1 条或多条：必须询问用户“继续其中某个 / 新建”
- 不得在用户明确回答前自行判断或跳过此问

#### 推荐交互方式：`option_list`（优先）

当存在进行中行程时，优先用 `option_list` 让用户点选，避免自然语言歧义。

- `options[]` 应包含：
  - 每个进行中行程一项：`id=<trip_id>`，`label` 包含 `destination_text / duration_days / stage`
  - 新建一项：`id="new"`，`label="开始新的行程"`

模板见 `examples/option-list.active-trip-choice.json`（注意这是模板，实际 `options` 需按返回的 `active_trips` 动态生成）。

守卫：
- 调用 `option_list` 后必须 STOP，等待用户点选
- 用户选 `new`：继续执行 `add_trip`
- 用户选某个 `trip_id`：记录该 `trip_id` 并跳过 `add_trip`
- 若交互不可用：降级为文本二选一 + 让用户回复 `trip_id` 或 `new`（降级细则见 `references/capability-matrix.md`）

### 新建

```bash
node {baseDir}/scripts/trips.mjs --cmd=add_trip --payload='{"destination_text":"新疆","destination":{"region":"Xinjiang","country":"China"},"duration_days":7,"budget":{"total":14000,"currency":"CNY"},"travelers":2,"activities":["nature","photography"],"constraints":["不自驾"],"transport_preferences":["private_car","short_flight_ok"],"stage":"intake"}' --list=current
```

记录返回的 `trip_id`，后续都用 `--trip-id=<id>`。

> 注意：`constraints` 的“自驾/不自驾”口径请以 `references/data-contracts.md` 为准；建议后续逐步迁移到结构化字段（避免自然语言歧义）。
