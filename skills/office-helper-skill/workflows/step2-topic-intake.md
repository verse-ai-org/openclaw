# Step 2 — 主题收集（自由文本）

## 前提

- `detected_language` 已在 Step 0 确定

## 目标

收集用户演示的核心信息：主题、内容、大概页数。这是自由文本输入，不使用交互工具。

## 守卫

**进入条件**：已完成 Step 1，已记录 `format`
**跳过条件**：用户已在初始消息中充分描述主题

## 1. 检查跳过

如果用户消息中已包含足够信息（主题 + 内容方向），直接记录并进入 Step 3。
仅当主题完全不清楚时才进入提问。

## 2. 主题提问（按语言选择模板）

以纯文本形式向用户提问（不使用交互工具，因为这是自由文本输入）。

**提问语言 = `detected_language`**：

**[zh]** 中文模板：
```
请简单描述你的演示内容：
- 主题是什么？
- 大概需要多少页？
- 有没有特别要强调的重点？
```

**[en]** English template:
```
Please briefly describe your presentation content:
- What is the topic?
- Approximately how many slides do you need?
- Any key points you want to emphasize?
```

守卫：
- 提问后 STOP，等待用户回复
- 用户回复后记录主题信息进入 Step 3

## 3. 记录主题

将用户的回复作为 `topic_description` 记录下来，在最终确认时展示。

## 下一步

`workflows/step3-scenario-choice.md`（场景选择 + 分支路由）
