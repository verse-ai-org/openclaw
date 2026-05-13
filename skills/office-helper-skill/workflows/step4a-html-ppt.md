# Step 4a — html-ppt：逐字稿选择 + 确认 + 生成

## 前提

- `detected_language` 已在 Step 0 确定
- `format=html-ppt`，已记录 `topic_description` 和 `scenario`

## 语言资源路径规则

| 用途 | zh | en |
|------|----|----|
| 逐字稿 option_list | `examples/option-list.presenter-notes.json` | `examples/en/option-list.presenter-notes.json` |
| 确认 approval_card | `examples/approval.confirm-generation.json` | `examples/en/approval.confirm-generation.json` |

## 目标

收集最后一个必选项（逐字稿需求），展示所有参数摘要并通过 `approval_card` 让用户确认，然后路由到 `html-ppt-skill` 执行生成。

## 守卫

**进入条件**：Step 3 完成
**确认守卫**：必须先通过 `approval_card` 确认，不得跳过直接生成

## 1. 逐字稿选择

调用 `option_list`，**按 `detected_language` 选择 payload**：

```
zh: option_list payload = examples/option-list.presenter-notes.json
en: option_list payload = examples/en/option-list.presenter-notes.json
```

守卫：
- 调用后必须 STOP，等待用户提交
- 用户选 `yes` → 记录 `presenter_notes=true`，模板固定为 `presenter-mode-reveal`
- 用户选 `no` → 记录 `presenter_notes=false`

## 2. 组装确认摘要

从 `references/scenario-mapping.md` 读取 `html-ppt` 部分，获取场景对应的默认参数：
- `theme`：推荐主题（如 `tokyo-night,dracula,nord`）
- `template`：推荐模板（如 `tech-sharing`）
- `animation`：动画强度（默认 `克制`）

### Metadata keys （按 `detected_language` 选择）

**[zh]** 中文 metadata：
```json
[
  { "key": "生成方式", "value": "HTML 演示文稿" },
  { "key": "主题内容", "value": "<topic_description>" },
  { "key": "场景", "value": "<scenario_label>" },
  { "key": "推荐主题", "value": "<theme>" },
  { "key": "推荐模板", "value": "<template>" },
  { "key": "动画强度", "value": "克制（fade-up + stagger-list）" },
  { "key": "逐字稿", "value": "<有/无>" },
  { "key": "语言", "value": "中文" }
]
```

**[en]** English metadata:
```json
[
  { "key": "Format", "value": "HTML Presentation" },
  { "key": "Topic", "value": "<topic_description>" },
  { "key": "Scenario", "value": "<scenario_label>" },
  { "key": "Recommended Theme", "value": "<theme>" },
  { "key": "Recommended Template", "value": "<template>" },
  { "key": "Animation Level", "value": "Subtle (fade-up + stagger-list)" },
  { "key": "Speaker Notes", "value": "<yes/no>" },
  { "key": "Language", "value": "English" }
]
```

## 3. 确认交互

调用 `approval_card`，**按 `detected_language` 选择 payload**，并补充上述 metadata。

```
zh: approval_card payload = examples/approval.confirm-generation.json
en: approval_card payload = examples/en/approval.confirm-generation.json
```

守卫：
- 调用后必须 STOP，等待用户提交
- 用户选“确认”(`decision=approved`) → 进入步骤 4
- 用户选“取消”(`decision=denied`) → 询问需要调整哪项参数

## 4. 路由生成

确认通过后，按照 `html-ppt-skill/SKILL.md` 的完整工作流执行生成：

1. 读取 `@skills/html-ppt-skill/SKILL.md`
2. 根据模板选择使用 `new-full-deck.sh` 或从布局拼接
3. 设置 `<body data-themes="...">` 包含推荐主题列表
4. 按动画强度施加动画属性
5. **内容语言 = `detected_language`**：生成时使用对应语言的文本内容
6. 生成自包含的 HTML deck 到 `~/Documents/Bossim/Html/` 目录
7. QA 验证：确保 `index.html` + `assets/` 自包含，无 repo-coupled 路径

### Completion message（按 `detected_language` 选择）

**[zh]** 中文完成提示：
- T 键切换主题
- A 键预览动画
- S 键演讲者视图（如有逐字稿）
- F 键全屏
- ← → 翻页

**[en]** English completion tips:
- Press T to cycle themes
- Press A to preview animations
- Press S for Presenter View (if speaker notes enabled)
- Press F for fullscreen
- ← → to navigate
