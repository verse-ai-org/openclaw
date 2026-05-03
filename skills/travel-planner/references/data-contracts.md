# Data Contracts（字段规范与枚举口径）

目的：减少“中文 label / 英文值混用”“自驾/不自驾歧义”等执行偏差。

## 总原则

- **存储值要稳定**：用于持久化/脚本输入的字段，优先使用稳定枚举值（推荐英文 snake_case）
- **展示文案随意**：用户看到的 label 可以是中文、带 emoji 等，但不应直接作为持久化值
- **约束字段避免否定句**：例如不要混用“自驾/不自驾”两个自然语言字符串；建议统一成一个布尔或一个枚举

> 现有脚本若仍使用自然语言字符串（例如 `constraints:["不自驾"]`），在迁移前需保证判断口径一致：以本文件为准。

## Trip 字段（关键）

### `plan_depth_choice`（验证后是否先预览；对用户展示文案见 option-list 模板）

- 取值：`plan_overview` | `full_plan`
- **`plan_overview`**：先根据已有 `route-plan` + `route-validation` 生成并保存 `plan-overview.json`，用户 `confirm_plan_overview` 后再做 Step 5 详单。
- **`full_plan`**：不保存 `plan-overview`，`set_plan_depth_choice` 后**直接** Step 5 详单（输入仍为 `route-plan` + `route-validation`）。
- 在 `save_route_validation` 成功后被清空；用户从 `option_list` 选定后须 `workflow.mjs --cmd=set_plan_depth_choice`
- **`plan.mjs save_details`**（Step 5 唯一落盘）：`plan_overview` 须已存在 `plan-overview.json` 且 `plan_overview_confirmed === true`；payload 须通过 **`validatePlanDetails`**（`schema_version: 1`，见 `references/plan-details.md`）

### `constraints`

**推荐**：改为结构化字段，避免歧义：

- `mobility_mode`: `self_drive | private_car | public_transport | mixed`
- `self_drive_allowed`: `true | false`

**在未迁移前（兼容口径）**：

- 若 `constraints` 包含任一字符串：`"自驾"` / `"可自驾"` → 视为允许自驾
- 若 `constraints` 包含任一字符串：`"不自驾"` / `"不自驾游"` / `"不考虑自驾"` → 视为不允许自驾
- **不得**同时写入“自驾”和“不自驾”两类值；出现冲突时应向用户澄清并修正

### `transport_preferences`

建议使用稳定枚举（示例）：

- `self_drive`
- `private_car`（包车/司机）
- `public_transport`
- `short_flight_ok`

**兼容口径（历史自然语言）**：

- `"private driver"` / `"包车"` / `"司机"` → `private_car`
- `"short flight ok"` / `"short flight okay"` / `"短途飞行"` / `"短途航班"` → `short_flight_ok`
- `"public transport"` / `"公共交通"` → `public_transport`
- `"self drive"` / `"自驾"` → `self_drive`

### `pace_preference`

- `relaxed`
- `moderate`
- `intensive`

### `travel_companions`

- `solo`
- `couple`
- `family`
- `group`

### `budget_level`（如使用）

- `economy`
- `mid_range`
- `high_end`

**兼容口径（历史自然语言）**：

- `"mid-range"` / `"中档"` / `"中端"` → `mid_range`
- `"high-end"` / `"高端"` → `high_end`
- `"economy"` / `"经济型"` → `economy`

## Route / Evidence 字段

以 `references/route-protocol.md` 为准，尤其：
- `RouteEvidence` 的字段与 `verification_status/evidence_source`
- 平台降级时必须记录 `fallback_reason`
