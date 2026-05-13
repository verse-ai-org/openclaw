# Step 3 — 场景选择 + 分支路由

## 前提

- `detected_language` 已在 Step 0 确定

## 语言资源路径规则

- `zh` → `examples/option-list.scenario-choice.json`
- `en` → `examples/en/option-list.scenario-choice.json`

## 目标

让用户选择一个演示场景，然后根据场景自动映射推荐参数（主题/色板/风格/字体/模板等）。完成后根据 Step 1 选择的格式分支到 html-ppt 或 pptx 路径。

## 守卫

**进入条件**：已完成 Step 2，已记录 `format` 和 `topic_description`
**跳过条件**：用户已在消息中明确描述场景

## 1. 检查跳过（双语言关键词）

如果用户消息中已包含场景关键词：

**[zh]** 中文关键词：
- `技术分享` / `tech` / `代码` → 记录 `scenario=tech-sharing`
- `融资` / `VC` / `路演` / `pitch` → 记录 `scenario=vc-pitch`
- `汇报` / `年报` / `季度` / `corporate` → 记录 `scenario=corporate-report`
- `学术` / `论文` / `答辩` / `academic` → 记录 `scenario=academic`
- `发布` / `launch` / `新品` → 记录 `scenario=product-launch`
- `培训` / `教学` / `课程` / `training` → 记录 `scenario=training`
- `小红书` / `xhs` / `社交媒体` / `图文` → 记录 `scenario=social-media`

**[en]** English keywords:
- `tech sharing` / `developer talk` / `code` / `architecture` → `scenario=tech-sharing`
- `fundraising` / `VC` / `pitch` / `startup` → `scenario=vc-pitch`
- `report` / `annual` / `quarterly` / `corporate` → `scenario=corporate-report`
- `academic` / `thesis` / `defense` / `paper` → `scenario=academic`
- `launch` / `product launch` / `keynote` → `scenario=product-launch`
- `training` / `teaching` / `course` / `education` → `scenario=training`
- `social media` / `xhs` / `xiaohongshu` / `instagram` → `scenario=social-media`

匹配到任一关键词后，跳过交互，直接读取默认参数并分支路由。
否则：进入场景选择交互。

## 2. 场景选择交互

调用 `option_list`，**按 `detected_language` 选择 payload**：

```
zh: option_list payload = examples/option-list.scenario-choice.json
en: option_list payload = examples/en/option-list.scenario-choice.json
```

守卫：
- 调用后必须 STOP，等待用户提交
- 用户选 `other` → 追问场景描述，然后根据描述手动匹配最接近的场景

## 3. 读取默认参数

用户提交后，从 `metadata.interaction.payload.selected` 读取场景 ID（如 `tech-sharing`），然后从 `references/scenario-mapping.md` 读取对应默认参数。

## 4. 分支路由

根据 Step 1 记录的 `format`：

- `format=html-ppt` → 进入 `workflows/step4a-html-ppt.md`
- `format=pptx-generator` → 进入 `workflows/step4b-pptx.md`
