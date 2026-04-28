# Step 4 - Itinerary Skeleton（生成每日行程骨架）

本文件覆盖主流程 Step 4（C-1 ~ C-3）。

**进入条件**：用户已批准 Step 3 的计划骨架（approved）。
**产出**：每日行程骨架 + 是否进入 Step 5 的用户确认。
**失败/降级**：生成失败→停止并报告脚本错误；交互不可用→用“确认/调整”文本确认（见 `references/capability-matrix.md`）。

## 目标

- 基于已确认路线与 Step 3 验证结论，按天生成可执行的计划骨架
- 输出每天去向/节奏/住宿区域，不含具体班次与预订信息

## 进入条件

- 用户已对 Step 3 骨架明确确认（approval_card approved）

## C-1｜生成每日骨架

```bash
node {baseDir}/scripts/plan-generator.mjs --trip-id=<trip_id> --cmd=itinerary_skeleton
```

## C-2｜输出每日计划（每一天必含字段）

- 主目标（核心景区/区域）
- 次目标（可选备选点）
- 建议出发时段（上午/下午/全天）
- 关键转场说明（长途/短途，不给具体班次）
- 体力负荷（轻松/适中/紧凑）
- 天气风险提醒（来自 Step 3 验证结果）
- 住宿区域（无需具体酒店信息）

### 禁止事项

- 不输出机票/高铁班次候选
- 不输出酒店名称或预订链接
- 不给“可直接下单”结论

完成本步后询问用户是否进入 Step 5（形成详细每日计划）。

## C-3｜确认逐日骨架并等待用户确认（approval_card）

在输出“逐日骨架（每天的主目标/备选/转场/体力/住宿区域等）”后，必须发起 `approval_card` 交互确认，确认是否按该骨架进入 Step 5 做详细每日计划（payload 见 `examples/approval.itinerary-skeleton.json`）。

守卫：
- 仅当 `metadata.interaction.payload.decision === "approved"` 才能进入 Step 5
- `denied`：先按用户反馈调整每日行程骨架，再次发起 `approval_card`
