# 路线协议参考

本文件供第四步（路线规划）和第五步（调研验证）按需查阅。包含：证据协议字段规范、JSON 示例、行程阶段值枚举。

---

## 统一证据协议：RouteEvidenceV1

所有平台（`xhs/search/...`）统一走 `save_route_evidence`，不得平台私有化绕过。

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `platform` | string | `xhs \| search \| ...` |
| `evidence_version` | string | 固定 `v1` |
| `query` | object | 目的地、天数、关键词 |
| `summary` | string | 证据摘要 |
| `evidence_quality` | string | `low \| medium \| high` |
| `verification_status` | string | `verified_by_platform_tool \| user_input_unverified` |
| `generated_at` | string | ISO 时间 |
| `sources[]` | array | `id / title / url / type / metrics / raw` |
| `route_hints` | object | 路线线索（可选）。`search` 场景建议提供 `key_destinations` 或 `popular_loops` |
| `meta` | object | 适配器信息（可选） |

> 新平台接入只需做"平台结果 -> RouteEvidenceV1"的适配映射，不改持久化主流程。

---

### JSON 示例（`search` 平台）

```json
{
  "platform": "search",
  "evidence_version": "v1",
  "query": { "destination_text": "川西", "duration_days": 5 },
  "summary": "基于公开网页结果的路线参考",
  "evidence_quality": "medium",
  "verification_status": "verified_by_platform_tool",
  "generated_at": "2026-04-09T10:05:00.000Z",
  "sources": [
    {
      "id": "search_result_1",
      "title": "川西 5 天游玩路线攻略",
      "url": "https://example.com/chuanxi-5d",
      "type": "search_result",
      "metrics": {},
      "raw": { "engine": "brave" }
    }
  ],
  "route_hints": {
    "key_destinations": ["成都", "四姑娘山", "塔公", "姑弄村", "新都桥", "冷嘎措"],
    "popular_loops": [["成都", "四姑娘山", "塔公", "姑弄村", "新都桥", "冷嘎措"]]
  },
  "meta": { "adapter": "search-adapter@1.0.0", "engine": "brave" }
}
```

### JSON 示例（`xhs` 平台，用户手动提供内容分支）

```json
{
  "platform": "xhs",
  "evidence_version": "v1",
  "query": { "destination_text": "云南", "duration_days": 7 },
  "summary": "用户手动提供小红书笔记内容",
  "evidence_quality": "medium",
  "verification_status": "user_input_unverified",
  "generated_at": "2026-04-09T10:10:00.000Z",
  "sources": [
    {
      "id": "user_input_1",
      "title": "用户粘贴帖子标题",
      "url": "https://www.xiaohongshu.com/...",
      "type": "user_input",
      "metrics": { "likes": 1280, "collects": 940 },
      "raw": {}
    }
  ],
  "meta": { "evidence_source": "user_input_xhs" }
}
```

---

## 证据落盘路径

```
~/.openclaw/agents/travel-planner/data/evidence/<trip_id>.<platform>.json
```

示例：`<trip_id>.xhs.json`、`<trip_id>.search.json`

---

## 行程阶段值（`stage` 枚举）

| 值 | 含义 |
|----|------|
| `intake` | 初始采集阶段 |
| `route_plan` | 路线规划中 |
| `plan_ready` | 计划已生成 |
| `ready_to_book` | 可预订状态 |
| `in_trip` | 行程进行中 |
| `completed` | 行程已完成 |
