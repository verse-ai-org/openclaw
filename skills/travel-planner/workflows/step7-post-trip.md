# Step 7 - Post-trip（行后沉淀：归档与偏好回写）

本文件覆盖主流程 Step 7（F-1 ~ F-3）。

**进入条件**：行程结束，用户希望归档/复盘，或需要把真实反馈写回偏好。
**产出**：trip 归档 + 偏好更新（用于下次默认值）。
**失败/降级**：脚本失败→停止并报告错误；不确定的反馈→先提问再写入。

## 目标

- 归档行程，更新用户偏好，为下次规划提供更准确初始数据

## F-1｜归档行程

```bash
node {baseDir}/scripts/trips.mjs --cmd=move_to_past --trip-id=<trip_id>
```

## F-2｜更新已访问目的地

```bash
node {baseDir}/scripts/preferences.mjs --cmd=add_previous_destination \
  --payload='{"destination": "<城市, 国家>"}'
```

## F-3｜更新复用偏好

根据本次行程真实反馈，更新后调用 `save_preferences`：

- `pace_preference`
- `hotel_style`
- `hotel_switch_tolerance`
- `interests`

```bash
node {baseDir}/scripts/preferences.mjs --cmd=save_preferences \
  --payload='{"pace_preference":"relaxed","hotel_switch_tolerance":"low"}'
```

