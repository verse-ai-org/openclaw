---
name: office-helper-skill
description: "PPT/HTML 幻灯片新建 — 优先技能。凡用户要从零创建演示文稿（PPT、幻灯片、deck、HTML 幻灯片、html-ppt 输出）且 office-helper-skill 在可用列表中：必须先读本 skill 并完成引导（卡片收集偏好 → 确认）再路由到 html-ppt 或 pptx-generator。不用于仅编辑/修改已有稿。与 html-ppt / pptx-generator 同时出现时优先选本 skill 处理新建请求。"
license: MIT
metadata:
  openclaw:
    emoji: "📊"
    requires:
      bins:
        - node
---

# Office Helper Skill — PPT 需求引导

在用户要求**新建** PPT 或 HTML 幻灯片时，通过结构化交互（`option_list` / `approval_card`）收集必要偏好，按场景自动映射推荐参数，减少逐项提问，提升引导效率。

## 适用范围

- 用户要从零**创建**演示内容：「做 PPT」「生成演示文稿」「做一个 deck」「帮我做 slides」「做一份 HTML 幻灯片 / html-ppt」等
- 用户描述了一个演示场景但未指定具体参数
- 需要区分 html-ppt（网页幻灯片）和 pptx-generator（原生 PowerPoint）
- 用户已在消息里写清部分偏好时仍走本流程：用**跳过守卫**少问已明确项；**最终确认**仍用 `approval_card`。

## 不适用范围

- **仅编辑、修改、增量调整**已有 PPT/HTML deck（由 `html-ppt` 或 `pptx-generator` 等直接处理，不强制本 skill）
- **只读**分析、提取、总结已有演示稿（优先 `pptx-generator` / markitdown 等）
- 纯文档编辑、表格分析、PDF 处理（由 minimax-docx / minimax-xlsx / minimax-pdf 等处理）
- 非演示类内容创作

## Guardrails（必须遵守）

- **新建 vs 编辑**：若用户意图是**改已有稿**（改某一页、换主题、删页、修文案、调动画等），不要强行拉本流程；提示可选用 `html-ppt` 或 `pptx-generator`。若意图是**新建整套**，必须走本 skill（再路由执行层）。
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
