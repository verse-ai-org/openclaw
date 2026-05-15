# Step 4b — pptx-generator：确认 + 生成

## 前提

- `detected_language` 已在 Step 0 确定
- `format=pptx-generator`，已记录 `topic_description` 和 `scenario`

## 语言资源路径规则

- `zh` → `examples/approval.confirm-generation.json`
- `en` → `examples/en/approval.confirm-generation.json`

## 目标

展示所有参数摘要并通过 `approval_card` 让用户确认，然后路由到 `pptx-generator` 执行生成。

## 守卫

**进入条件**：Step 3 完成
**确认守卫**：必须先通过 `approval_card` 确认，不得跳过直接生成

## 1. 组装确认摘要

从 `references/scenario-mapping.md` 读取 `pptx-generator` 部分，获取场景对应的默认参数：
- `color_palette`：推荐色板编号与名称（如 `#15 Pure Tech Blue`）
- `style_recipe`：推荐设计风格（如 `Sharp & Compact`）
- `font_pairing`：推荐字体搭配（如 `Consolas + Calibri`）

### Metadata keys （按 `detected_language` 选择）

**[zh]** 中文 metadata：
```json
[
  { "key": "生成方式", "value": "PowerPoint 文件（.pptx）" },
  { "key": "主题内容", "value": "<topic_description>" },
  { "key": "场景", "value": "<scenario_label>" },
  { "key": "推荐色板", "value": "<color_palette>" },
  { "key": "推荐风格", "value": "<style_recipe>" },
  { "key": "推荐字体", "value": "<font_pairing>" },
  { "key": "语言", "value": "中文" }
]
```

**[en]** English metadata:
```json
[
  { "key": "Format", "value": "PowerPoint File (.pptx)" },
  { "key": "Topic", "value": "<topic_description>" },
  { "key": "Scenario", "value": "<scenario_label>" },
  { "key": "Color Palette", "value": "<color_palette>" },
  { "key": "Style", "value": "<style_recipe>" },
  { "key": "Font", "value": "<font_pairing>" },
  { "key": "Language", "value": "English" }
]
```

## 2. 确认交互

调用 `approval_card`，**按 `detected_language` 选择 payload**，并补充上述 metadata。

```
zh: approval_card payload = examples/approval.confirm-generation.json
en: approval_card payload = examples/en/approval.confirm-generation.json
```

守卫：
- 调用后必须 STOP，等待用户提交
- 用户选“确认”(`decision=approved`) → 进入步骤 3
- 用户选“取消”(`decision=denied`) → 询问需要调整哪项参数

## 3. 路由生成

确认通过后，按照 `pptx-generator/SKILL.md` 的完整工作流执行生成：

1. 读取 `@skills/pptx-generator/SKILL.md`
2. 使用映射的色板作为 `theme` 对象（primary/secondary/accent/light/bg）
3. 使用映射的风格控制 `rectRadius` 和间距
4. 使用映射的字体搭配
5. 输出路径（Windows）：与 `%USERPROFILE%\\Documents\\Bossim\\Presentations` 相同，但**盘符改为 `D:`**（保留 `Users/.../Documents/...` 后续路径）；并确保在 pptx-generator 运行阶段设置 `BOSSIM_PPTX_OUTPUT_PATH` 指向最终 `.pptx` 的**绝对文件路径**（避免仍写到 C:）
6. **内容语言 = `detected_language`**：生成时使用对应语言的文本内容
7. 规划 Slide Outline（Cover → TOC → Content × N → Summary）
8. 并行生成 slide JS 文件
9. 编译 `compile.cjs`
10. QA：`markitdown` 提取文本校验
11. 确认 `.pptx` 文件存在，输出绝对路径

### Completion message（按 `detected_language` 选择）

**[zh]** 中文完成格式：
```
PPTX generated successfully.
File: <filename>.pptx
Path: <absolute-path>
RunId: <run-id-if-available>
```

**[en]** English completion format（与上相同，pptx-generator 固定格式）：
```
PPTX generated successfully.
File: <filename>.pptx
Path: <absolute-path>
RunId: <run-id-if-available>
```
