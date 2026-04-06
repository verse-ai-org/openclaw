# 旅行规划 Travel Planner

[OpenClaw](https://github.com/openclaw/openclaw) Skill — 旅行决策与行程结构化：偏好与行程数据、路线框定、预订前校验清单、计划生成与行前/行中简报。

## 安装

本仓库已包含该技能，目录为 `skills/travel-planner/`。在 Agent 中启用后，按 `SKILL.md` 与系统提示里的 `{baseDir}` 引用脚本即可。

## 功能

- 本地 JSON 存储偏好与行程（`~/.openclaw/agents/travel-planner/`）
- 复杂目的地先做 **路线框定**（`route_selector.mjs`），再展开日程
- **live_validation**：生成需用 `flyai` / `12306` 等校验的任务清单（脚本本身不调外部 API）
- **plan_generator**：结构化计划骨架、日程卡、预算与清单
- **booking_ready**：把已拿到的搜索结果整理成可预订向摘要
- **briefing**：行前 / 当日简报 JSON
- **index.js**：统一入口（`route_framing`、`live_validation`、`trip_plan`、`auto_validate`、`briefing` 等 mode）

## 依赖

- Node.js（建议 22+，与 OpenClaw 主项目一致）
- 可选：`flyai` CLI（`auto_validate` 模式）、`12306` 技能脚本（国内车次校验）

## 用法

以下命令均在技能根目录执行（与 `scripts/` 相对路径）。

```bash
# 是否已初始化偏好
node scripts/travel_db.mjs is_initialized

# 保存偏好（JSON 一段参数）
node scripts/travel_db.mjs save_preferences '{"departure_city":"成都","budget_level":"mid-range"}'

# 新建当前行程（返回 trip_id）
node scripts/travel_db.mjs add_trip '{"destination_text":"Xinjiang","destination":{"region":"Xinjiang","country":"China"},"duration_days":7,"stage":"intake"}' current

# 路线候选（stdin/参数为行程 JSON）
node scripts/route_selector.mjs --input '{"destination":{"region":"Xinjiang"},"duration_days":7}'

# 校验清单
node scripts/live_validation.mjs --trip '{}' --route '{}'

# 完整计划（内联 JSON 或按 trip id 读库）
node scripts/plan_generator.mjs --trip-json '{"destination":{"country":"China"},"duration_days":5}'

# 帮助
node scripts/travel_db.mjs --help
```

运行时入口`index.js`：

| mode | 说明 |
|------|------|
| `trip_plan` | 生成完整计划 JSON |
| `route_framing` | 路线候选 |
| `live_validation` | 校验包 |
| `booking_ready` | 预订向摘要 |
| `auto_validate` | 生成校验并尝试执行 `flyai`/12306，可选写回 DB |
| `briefing` | 行前或每日简报 |

## 数据与脚本路径

- 偏好与行程数据：`~/.openclaw/agents/travel-planner/*.json`
- CLI 与模块：`skills/travel-planner/scripts/*.mjs`
- 文档与工具参数中的 **`{baseDir}`** 即技能根目录

## 参考

- 目的地研究参考 `references/travel_guidelines.md`、`references/cultural_etiquette.md`
