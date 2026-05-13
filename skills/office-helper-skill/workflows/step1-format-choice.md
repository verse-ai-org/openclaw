# Step 1 — 格式选择（html-ppt vs pptx-generator）

## 前提

- `detected_language` 已在 Step 0 确定（`zh` 或 `en`）
- 后续所有用户可见文案按此值选择语言版本

## 语言资源路径规则

- `zh` → `examples/option-list.format-choice.json`
- `en` → `examples/en/option-list.format-choice.json`

## 目标

让用户在 html-ppt（网页幻灯片，推荐）和 pptx-generator（原生 PowerPoint）之间选择。两种格式各有优势，html-ppt 可运行时切换主题/动画，推荐作为首选。

## 守卫

**进入条件**：用户提出 PPT/演示文稿需求，Step 0 已完成
**跳过条件**：用户已在消息中明确指定格式

## 1. 检查跳过（双语言关键词）

如果用户消息中已包含确定的格式选择：

**[zh]** 中文关键词：
- 提到 `html-ppt` / `HTML PPT` / `网页幻灯片` → 记录 `format=html-ppt`，直接进入 Step 2
- 提到 `pptx` / `powerpoint` / `.pptx 文件` / `原生PPT` → 记录 `format=pptx-generator`，直接进入 Step 2

**[en]** English keywords:
- Mentions `html-ppt` / `HTML PPT` / `web slides` / `browser slides` → record `format=html-ppt`, go to Step 2
- Mentions `pptx` / `powerpoint` / `.pptx file` / `native PPT` → record `format=pptx-generator`, go to Step 2

否则：进入格式选择交互

## 2. 格式选择交互

调用 `option_list`，**按 `detected_language` 选择 payload**：

```
zh: option_list payload = examples/option-list.format-choice.json
en: option_list payload = examples/en/option-list.format-choice.json
```

守卫：
- 调用后必须 STOP，等待用户提交
- 交互不可用时降级为纯文本二选一
- 未指定时默认推荐 html-ppt

## 3. 记录用户选择

用户提交后，从 `metadata.interaction.payload.selected` 读取：
- `"html-ppt"` → 记录 `format=html-ppt`
- `"pptx-generator"` → 记录 `format=pptx-generator`

## 下一步

`workflows/step2-topic-intake.md`（主题收集）
