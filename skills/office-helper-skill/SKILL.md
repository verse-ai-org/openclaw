---
name: office-helper-skill
description: "PPT/演示文稿需求引导技能。在生成 PPT 前通过交互式卡片收集用户偏好（格式、场景、逐字稿需求），按场景自动映射推荐参数，最终确认后路由到 html-ppt-skill 或 pptx-generator 执行生成。用户提到做 PPT、演示文稿、幻灯片、deck 时触发。"
license: MIT
metadata:
  openclaw:
    emoji: "📊"
    requires:
      bins:
        - node
---

# Office Helper Skill — PPT 需求引导

在用户要求生成 PPT/演示文稿时，通过结构化交互（`option_list` / `approval_card`）收集必要偏好，按场景自动映射推荐参数，减少逐项提问，提升引导效率。

## 适用范围

- 用户提到「做 PPT」「生成演示文稿」「做一个 deck」「帮我做 slides」
- 用户描述了一个演示场景但未指定具体参数
- 需要区分 html-ppt（网页幻灯片）和 pptx-generator（原生 PowerPoint）

## 不适用范围

- 纯文档编辑、表格分析、PDF 处理（由其他 office-helper skill 处理）
- 非演示类内容创作
- 用户已明确指定所有参数并直接要求生成（此时直接路由到对应 skill）

## Guardrails（必须遵守）

- **交互守卫**：调用 `option_list` / `approval_card` 后必须 STOP，等待用户提交后再继续
- **跳过守卫**：用户已在消息中明确提供的信息（如"用 html-ppt 做技术分享"），不得重复提问
- **场景驱动**：场景选择后，推荐参数由 `references/scenario-mapping.md` 映射表自动填充，不逐项询问
- **确认守卫**：生成前必须用 `approval_card` 展示所有参数摘要，等用户确认
- **html-ppt 优先**：格式选择时主动推荐 html-ppt（可运行时切换主题/动画），仅当用户需要原生 .pptx 时路由到 pptx-generator
- **降级透明**：交互工具不可用时降级为纯文本问答，显式提示

## Step 0：语言检测（前置，必须最先执行）

在进入任何引导步骤之前，检测用户语言，决定后续所有引导文案的语言（`zh` = 中文，`en` = 英文）。

### 三级降级检测策略

```
┌─ Level 1：检测用户 prompt 文本（成本 < 1ms）
│  - prompt 通常 < 5KB，直接全文 CJK 统计
│  - CJK 统一汉字（U+4E00–U+9FFF）占比 ≥ 30% → zh
│  - CJK 占比 < 30% → en
│  - 覆盖 95%+ 场景
│
├─ Level 2：prompt 过短（< 20 字符且无法判断）
│  - 用户上传了文件 → 采样文件前 5KB 做 CJK 统计
│  - 否则 → 默认 en
│
└─ Level 3：兜底
   - 以上均无法判断 → 默认 en
```

### 冲突处理

- 上传文件语言与 prompt 语言不一致 → **以 prompt 为准**（用户用什么语言提问，就用什么语言引导）
- 多个上传文件语言不一致 → 以 prompt 为准

### 结果记录

检测完成后记录 `detected_language = "zh" | "en"`，后续所有步骤按此值选择对应语言资源。

### 语言对最终生成的影响

- `detected_language` 不仅影响引导文案，也传递到 html-ppt-skill / pptx-generator，控制 PPT 内容语言
- 最终生成的 PPT 内容语言 = 引导语言（与用户输入语言一致）

---

## 工作流索引

- Step 0：语言检测（此文件内）→ 必须最先执行
- Step 1：格式选择（html-ppt vs pptx-generator）→ `workflows/step1-format-choice.md`
- Step 2：主题收集（自由文本）→ `workflows/step2-topic-intake.md`
- Step 3：场景选择 + 分支路由 → `workflows/step3-scenario-choice.md`
- Step 4a（html-ppt 分支）：逐字稿选择 + 确认 + 生成 → `workflows/step4a-html-ppt.md`
- Step 4b（pptx 分支）：确认 + 生成 → `workflows/step4b-pptx.md`

## 参考资料

- **场景→默认参数映射表**：`references/scenario-mapping.md`
- **交互组件规范**：`@skills/openclaw-interactions` 的 `SKILL.md`

## 语言资源分叉规则

所有引导文案按 `detected_language` 选择对应语言版本：

- `zh` → 使用 `examples/*.json`（中文）
- `en` → 使用 `examples/en/*.json`（英文）

工作流文件中的文本模板同样按语言分叉（见各 workflow 文件内的 `[zh]` / `[en]` 标记）。

## Examples 资源

| 语言 | Path | Role |
|------|------|------|
| zh | `examples/option-list.format-choice.json` | 格式选择 |
| en | `examples/en/option-list.format-choice.json` | Format choice |
| zh | `examples/option-list.scenario-choice.json` | 场景选择 |
| en | `examples/en/option-list.scenario-choice.json` | Scenario choice |
| zh | `examples/option-list.presenter-notes.json` | 逐字稿选择 |
| en | `examples/en/option-list.presenter-notes.json` | Presenter notes |
| zh | `examples/approval.confirm-generation.json` | 确认卡片 |
| en | `examples/en/approval.confirm-generation.json` | Confirm card |
