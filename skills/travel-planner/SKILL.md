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

中文旅行规划技能。用于偏好记录、路线规划、目的地调研、规划每日行程、交通/住宿策略、预算与行前清单，以及行中改线重排。

## 适用范围

- 行程规划、路线规划、路线对比、制定每日计划、交通酒店组合策略
- 与真实行程绑定的预算、打包、礼仪、安全、行前清单
- 行中改线、错过交通后的重排与当天应急建议

## 不适用范围

- 仅单点天气/冷知识问答（无行程决策）
- 非旅行类技术任务
- 纯创作型内容（无出行决策/执行）

## Guardrails（必须遵守）

- **交互守卫**：调用交互工具（如 `question_flow` / `option_list` / `approval_card`）后必须 STOP，等待用户提交/选择后再继续
- **确认守卫**：遇到“继续旧行程 vs 新建”“路线选择”“计划骨架确认”“开启推送”等关键决策，必须明确问并等答复，不得自作主张
- **真实性**：不得臆造价格/班次/库存/评分/预订链接；实时信息必须来自实时查询（失败则标注“未验证”并降级）
- **降级透明**：平台或工具降级（如 `xhs -> search`）必须显式提示并记录原因；不得静默切换
- **轻量提问**：只问高影响项，不做超长问卷；到达日/返程日默认轻负荷
- **行程约束**：体力/天气/换乘摩擦是硬约束；每天最多“1 个主锚点 + 1 个附近备选”；大区域目的地先框路线再铺每日

## Quick start（按需阅读）

1. 先读 `workflows/step1-intake.md`（偏好/Trip 建档 + active trip 守卫）
2. 路线框定：`workflows/step2-route-planning.md`
3. 交通/天气验证 + 骨架确认：`workflows/step3-validate-transport-weather.md`
4. 逐日骨架：`workflows/step4-itinerary-skeleton.md`
5. 逐日细化 + booking-ready：`workflows/step5-itinerary-detail-booking.md`
6. 行中支持（含可选推送）：`workflows/step6-in-trip-support.md`
7. 行后沉淀：`workflows/step7-post-trip.md`

## 工作流索引

- Step 1：Intake（偏好/Trip 建档）→ `workflows/step1-intake.md`
- Step 2：Route planning（证据→候选→选择→持久化）→ `workflows/step2-route-planning.md`
- Step 3：Validate transport & weather + 骨架确认 → `workflows/step3-validate-transport-weather.md`
- Step 4：Itinerary skeleton → `workflows/step4-itinerary-skeleton.md`
- Step 5：Itinerary detail & booking → `workflows/step5-itinerary-detail-booking.md`
- Step 6：In-trip support → `workflows/step6-in-trip-support.md`
- Step 7：Post-trip → `workflows/step7-post-trip.md`

## 参考资料（只在需要时读）

- **工具可用性/降级**：`references/capability-matrix.md`
- **字段契约/枚举口径**：`references/data-contracts.md`
- **协议**：`references/route-protocol.md`
- **行前清单/安全**：`references/travel_guidelines.md`
- **礼仪文化**：`references/cultural_etiquette.md`

## 资源索引（scripts）

| Path | Role |
|------|------|
| `scripts/preferences.mjs` | 偏好域存储与读写 |
| `scripts/trips.mjs` | Trip 数据层：schema 标准化、CRUD |
| `scripts/trip-workflow.mjs` | 流程层：阶段守卫、路线确认、evidence/plan 持久化、预订与启程流转 |
| `scripts/route-plan.mjs` | 路线候选结构化输出 |
| `scripts/poi-cache.mjs` | POI 缓存与 stop_media/stop_points 构建 |
| `scripts/xhs-evidence-builder.mjs` | 小红书证据规范化 |
| `scripts/plan-generator.mjs` | 计划骨架与总结生成 |
| `scripts/booking-ready.mjs` | 合并实时结果生成 booking-ready 包 |
| `scripts/briefing.mjs` | 行前/每日简报 |
