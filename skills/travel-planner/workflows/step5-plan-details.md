# Step 5 - Plan Details（完整行程定稿）

## 目标
基于 **`route-plan.json`** 与 **`route-validation.json`**（`plan_overview` 路径下还可参考已确认的 **`plan-overview.json`**），生成符合 **`references/plan-details.md`** 的 **`plan-details.json`**：固定章节、可直接作为用户交付物（目的地、大交通、天气、每日卡片、行前清单、礼仪文化、安全应急、文字路线 + 可选地图结构）。

**不做酒店查询**；酒店见 `workflows/step5-optional-hotels.md`。  
定稿与 `plan_ready` 见 `references/artifacts.md` **Step 5（Plan details）**。

## 守卫
**进入条件**（满足其一即可）：
- **预览路径**：`trip.stage === validated`，`plan_depth_choice === plan_overview`，`plan-overview.json` 已存在，用户已通过 `approval_card` 且已执行 `workflow.mjs --cmd=confirm_plan_overview`（`trip.plan_overview_confirmed === true`）。
- **跳过预览路径**：`trip.stage === validated`，`plan_depth_choice === full_plan`（无 `plan-overview`；**无需** `confirm_plan_overview`）。

**失败/降级**：地图/坐标失败 → 仍须填 **`geo.text_fallback_route`**；其它字段仍须满足 schema。

## 输入
- **路线**：`route-plan.json`
- **验证**：`route-validation.json`（交通/天气/verdict → 写入 `transport` / `weather` 等人话摘要，与验证结论一致）
- **可选**：`plan.mjs --cmd=get_inputs --trip-id=...` 一次取出 `trip` + 上述 artifact

## 内容要求（与 schema 对齐）
- **目的地**：`destination.summary` / `geography` / `culture_and_customs`；礼仪细节可再写入 `etiquette_and_culture`（见 `references/cultural-etiquette.md`、`references/travel-guidelines.md`）
- **逐日卡片**：`days[]`，`day_index` 从 1 递增；`title` + `summary` 必填；可按需填 `morning` / `afternoon` / `evening`
- **行前清单**：`pre_departure_checklist.items[]` 至少一条
- **安全**：`safety_and_emergency` 必填；caution/block 须体现在天气/日程或安全条目中

**结构校验**：`save_details` 前执行 `validatePlanDetails`；骨架示例：`examples/plan-details.template.json`。

## 定稿落盘
```bash
node {baseDir}/scripts/plan.mjs --cmd=save_details --trip-id=<trip_id> --payload=@.../plan-details.json
```

## 向用户展示

落盘成功后，用户在聊天里看到的应是**与 `plan-details.json` 一致的完整版**，而不是模型自编的「一页速览」。

- **为何常会不全**：Markdown 只负责格式；模型默认倾向缩写、合并表格、省略长段落与清单条目。**必须在回复中显式按 JSON 结构逐项输出**。
- **必含块**（与 `validatePlanDetails` / `references/plan-details.md` 一致）：`destination`（三段全文）→ `transport`（`outbound` / `return` / 若有 `notes`）→ `weather`（`summary` + 每条 `by_stop`）→ **`days[]` 每天**：除 `title`/`summary` 外，已写的 `morning`/`afternoon`/`evening`/`risks_or_notes` **全部照登**→ `pre_departure_checklist.items[]` **逐条列出**（勿写「共 N 项」了事）→ `etiquette_and_culture`（`summary` + 每条 `bullets`）→ `safety_and_emergency`（`summary`、`emergency_numbers_note`、每条 `bullets`）→ `geo.text_fallback_route`（全文；若有 `points`/`legs` 可作列表简述）。
- **禁止**：用「基本数据 / 天气速览表 / 每日仅一行」等**替代**上述完整块；把未写入 JSON 的字段（如总里程、预算档位）当事实塞进「速览」——若需展示，须先写入 JSON 对应位置或明确标注「对话补充、未在 plan-details 内」。
- **篇幅**：若单条消息过长，**分多条**发送，直至上述块全部出现；或首条说明「完整版分 N 条发送」并连续发完。

## 下一步分支（option_list，一次确认）
定稿成功后，模板：`examples/option-list.after-plan-details.json`。  
**守卫**：调用后必须 STOP。

- 行中支持 → `workflows/step6-in-trip-support.md`
- 可选酒店 → `workflows/step5-optional-hotels.md`（须 `plan_ready`）
