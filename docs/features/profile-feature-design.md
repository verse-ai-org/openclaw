# Profile 功能设计方案

**版本**: v1.2  
**状态**: 已实现（含页面重构与交互优化）  
**所属模块**: Dashboard > Profile  
**最后更新**: 2026-03-17

---

## 一、背景与目标

### 背景

OpenClaw 通过 workspace 目录下的一组 bootstrap 文件（`USER.md`、`MEMORY.md` 等）为 AI 代理提供用户上下文。这些文件决定了代理对用户的了解程度，直接影响对话质量和个性化程度。

当前问题：

- 用户安装完成后，这些文件默认为空模板，代理对用户一无所知
- 没有友好的界面引导用户填写这些信息
- 用户已有的自我描述内容（个人主页、简介文档等）无法直接利用

### 目标

在 Dashboard 新增 **Profile** 功能入口，通过两种路径完成用户画像采集，最终写入 workspace 的 `USER.md` 和 `MEMORY.md`，让 OpenClaw 更懂用户。

---

## 二、功能范围（本期）

### 功能一：用户画像模板（Template Mode）

为 5 类目标用户提供预设画像模板，用户选择模板后按字段填写，点击保存写入 workspace 文件。

### 功能二：用户画像输入框（Free Input Mode）

提供自由输入入口，用户可输入文字、URL 链接，系统自动解析并提取画像信息，经用户预览确认后写入 workspace 文件。

### 本期范围边界

**做（本期）：**

- 5 个固定职业模板 + 模板字段填写与保存
- 功能二支持文字输入和 URL 解析
- 写入前必须经过预览确认界面
- 结果写入 `USER.md` 和 `MEMORY.md`，两者独立，不互相影响

**暂缓（下期）：**

- 图片 / 文件上传解析
- 用户自定义模板
- Profile 历史版本 / 撤销功能

---

## 三、用户交互设计

### 3.1 整体页面结构

```
Dashboard 侧边栏
└─ Profile（新增入口）
   ├─ Profile Home（入口页面）
   │  ├─ [Card1] Profile Templates → 进入模板子页面
   │  └─ [Card2] Profile Edit → 进入编辑子页面
   │
   ├─ Profile Templates（子页面）
   │  ├─ Current USER.md 预览/编辑区域
   │  ├─ 模板选择网格（默认展开）
   │  └─ 模板表单（选择后展开）
   │
   └─ Profile Edit（子页面）
      ├─ USER.md 预览/编辑
      ├─ MEMORY.md 预览/编辑
      └─ Add from Text/URL 输入区域
```

**导航说明：**

- Profile 入口页面展示两个功能卡片，点击分别进入子页面
- 子页面顶部有返回按钮 (← Back) 可返回 Profile Home
- 当处于子页面时，侧边栏 Profile 菜单保持高亮状态

### 3.2 功能一：画像模板交互流程

```
① 进入 Profile > Profile Templates 子页面
② 顶部展示 Current USER.md 内容（如有），支持 Preview/Edit 切换
③ 下方展示 5 个职业模板卡片（默认自动展开）
   - 系统根据现有 USER.md 中的 ROLE 自动匹配对应模板
   - 无匹配时默认选中第一个模板
④ 模板表单默认展开，显示当前选中模板的字段
⑤ 字段内容预填模板默认值，用户按需修改
⑥ 点击「Preview & Save」→ 弹出预览弹窗
⑦ 用户确认 → 点击「Save to workspace」→ 写入 workspace → 成功提示 → 刷新 USER.md 展示
```

**重要交互约定：**

- 功能一的结果仅更新 `USER.md`，不影响 `MEMORY.md`
- Profile Templates 页面**不展示 MEMORY.md**
- 若 `USER.md` 已有内容，保存时采用**追加**策略（新内容追加到文件末尾），不覆盖
- 用户可多次进入修改，每次保存均为追加
- Domains/Tools/Preferences 字段使用对话框交互：点击「+ Add」打开对话框，输入后添加

### 3.3 功能二：自由输入交互流程

```
① 进入 Profile > Profile Edit 子页面
② 页面直接展示：
   - USER.md 当前内容（Preview/Edit 模式可切换）
   - MEMORY.md 当前内容（Preview/Edit 模式可切换）
③ 「Add from Text / URL」折叠面板：
   - 展开后输入文字 + URL（两者可混合使用）
   - 点击「Analyze & Append」→ 系统处理 → 展示 Loading
④ 解析完成 → 弹出预览界面，展示两部分内容（均可编辑）：
   - 将写入 USER.md 的结构化信息
   - 将写入 MEMORY.md 的补充记忆内容
⑤ 用户确认 → 点击「Save to workspace」→ 分别追加写入两个文件 → 成功提示 → 刷新页面内容
```

**重要交互约定：**

- 功能二的结果写入 `USER.md`（结构化部分）和 `MEMORY.md`（非结构化补充部分）
- 功能二与功能一**完全独立**，功能二不修改功能一填写的内容
- 写入策略：追加到文件末尾
- 用户可直接编辑现有 USER.md / MEMORY.md 内容并保存

---

## 四、数据模型设计

### 4.1 画像字段结构（功能一）

所有模板共用以下字段，各模板提供差异化的默认值：

| 字段     | 字段 Key      | 输入类型             | 说明                   |
| -------- | ------------- | -------------------- | ---------------------- |
| 用户名称 | `name`        | 文本输入             | 姓名或希望被称呼的方式 |
| 用户身份 | `role`        | 单选（模板选择决定） | 职业角色               |
| 目标领域 | `domains`     | 多选 + 自定义        | 专注的工作方向         |
| 常用工具 | `tools`       | 多选 + 自定义        | 日常使用的软件/平台    |
| 个人偏好 | `preferences` | 多选 + 自定义        | 沟通风格、回复习惯     |

### 4.2 各职业模板预设内容

**🎬 自媒体工作者**

- 目标领域默认：内容创作、短视频、社交媒体运营
- 常用工具默认：剪映/Premiere、小红书、抖音、微信公众号
- 个人偏好默认：爆款标题建议、平台规则感知、内容选题辅助

**✍️ 文字工作者**

- 目标领域默认：写作、编辑、内容策划
- 常用工具默认：Notion/Word、语雀、飞书文档
- 个人偏好默认：文风润色、结构建议、素材整理

**🗺️ 旅游向导**

- 目标领域默认：旅游路线规划、景点介绍、客户服务
- 常用工具默认：高德地图/谷歌地图、携程、小红书
- 个人偏好默认：本地特色推荐、多语言支持、实时信息

**📚 教育工作者**

- 目标领域默认：课程设计、知识讲解、学生辅导
- 常用工具默认：PPT/Keynote、ClassIn、Notion
- 个人偏好默认：分层解释（深入浅出）、举例说明、结构化输出

**💻 软件开发工程师**

- 目标领域默认：编程开发、技术调研、架构设计
- 常用工具默认：VSCode/Cursor、GitHub、Terminal
- 个人偏好默认：代码优先、简洁直接、技术术语无需解释

### 4.3 写入 USER.md 的格式

功能一生成内容，追加到 `USER.md` 末尾：

```markdown
## Profile（由 Profile 功能生成，2026-03-16）

- **Name:** 张三
- **What to call them:** 三哥
- **Role:** 软件开发工程师

### Professional Context

- **Domains:** 编程开发, 技术调研, 架构设计
- **Primary Tools:** VSCode, GitHub, Terminal

### Communication Preferences

- **Style:** 简洁直接，代码优先，技术术语无需解释
```

### 4.4 写入 MEMORY.md 的格式

功能二生成内容，追加到 `MEMORY.md` 末尾：

```markdown
## User Context（由 Profile 功能生成，2026-03-16）

用户是一名软件开发工程师，主要使用 VSCode 和 GitHub，偏好简洁直接的技术回答。
[用户在输入框中的原始补充描述或从 URL 提取的背景信息]
```

---

## 五、技术实现方案

### 5.1 整体架构

```
前端（ui/ — Lit UI，即 http://127.0.0.1:18789）    后端（Gateway）
──────────────────────────────────────           ──────────────────────
Profile Home (profile tab)
 ├─ Profile Templates Card ───────────────────→  进入 profile-templates 子页面
 └─ Profile Edit Card ────────────────────────→  进入 profile-edit 子页面

Profile Templates 子页面 (profile-templates tab)
 ├─ USER.md 预览/编辑区域 ────────────────────→  agents.files.get   (读取现有 USER.md)
 ├─ 模板选择 + 字段表单  ─────────────────────→  agents.files.set   (写入 USER.md)
 └─ Save 成功后 ──────────────────────────────→  自动刷新 USER.md 展示

Profile Edit 子页面 (profile-edit tab)
 ├─ USER.md / MEMORY.md 预览/编辑 ────────────→  agents.files.get   (读取现有文件)
 ├─ Add from Text/URL  ───────────────────────→  profile.parse      (新增 Gateway 方法)
 └─ Save 成功后 ──────────────────────────────→  自动刷新两个文件展示
```

> **注意**：Profile 功能实现在旧版 Lit UI（`ui/`），即 `http://127.0.0.1:18789` 直接加载的 Dashboard，而非 `ui-react/`（后者是独立的实验性 React 版本）。

### 5.2 前端实现路径（Lit UI）

**新增文件：**

```
ui/src/ui/views/profile.ts          # Profile 页面完整实现（Lit html 模板）
```

**修改文件：**

```
ui/src/ui/navigation.ts             # 新增 "profile" / "profile-templates" / "profile-edit" Tab 类型
                                    # 路径 /profile、/profile/templates、/profile/edit
                                    # 分组 "me"、图标 "user"
ui/src/ui/icons.ts                  # 新增 user SVG 图标
ui/src/i18n/locales/en.ts          # 新增 tabs.profile = "Profile"、subtitles.profile
ui/src/ui/app-view-state.ts        # 新增 profile 相关 state 字段
ui/src/ui/app.ts                   # 新增 @state() 字段初始化
ui/src/ui/app-render.ts            # 导入 renderProfileHome / renderProfileTemplates / renderProfileEdit
                                    # 注册三个 tab 的渲染块
ui/src/ui/app-settings.ts          # 在 refreshActiveTab 中添加 profile-templates 和 profile-edit 的数据加载
```

### 5.3 导航注册

在 `ui/src/ui/navigation.ts` 中：

**Tab 类型定义：**

- `Tab` 类型联合新增 `"profile" | "profile-templates" | "profile-edit"`

**路径映射：**

- `TAB_PATHS` 新增：
  - `profile: "/profile"`
  - `profile-templates: "/profile/templates"`
  - `profile-edit: "/profile/edit"`

**分组配置：**

- `TAB_GROUPS` 新增 `{ label: "me", tabs: ["profile"] }`
- 子页面（profile-templates、profile-edit）不归入分组，通过导航高亮规则处理

**图标配置：**

- `iconForTab` 新增 `case "profile": return "user"`
- 子页面继承父级图标

**高亮规则：**

- 当 `state.tab === "profile-templates" || state.tab === "profile-edit"` 时，Profile 菜单保持高亮

### 5.4 Gateway 方法调用

**功能一（模板写入）** 复用现有 Gateway 方法：

| 操作             | Gateway 方法       | 说明                   |
| ---------------- | ------------------ | ---------------------- |
| 读取当前 USER.md | `agents.files.get` | 获取现有内容，用于追加 |
| 写入 USER.md     | `agents.files.set` | 写入拼接后的内容       |

**功能二（自由输入解析）** 新增 Gateway 方法：

```
profile.parse
  params: { text?: string; urls?: string[] }
  returns: {
    userMdContent: string;   // 建议写入 USER.md 的内容
    memoryContent: string;   // 建议写入 MEMORY.md 的内容
    skippedUrls?: string[];  // 无法抓取的 URL 列表
  }
```

该方法内部：

1. 对 URL 调用 fetch 抓取网页正文（15 秒超时，失败则加入 skippedUrls）
2. 将所有内容（用户文字 + URL 正文）送入 Gateway 当前默认 AI 模型分析
3. AI 按预设 prompt 以 `<USER_MD>...</USER_MD>` 和 `<MEMORY_MD>...</MEMORY_MD>` 格式返回
4. 解析 XML 标签提取两份内容，返回给前端预览

### 5.5 后端实现路径

**新增文件：**

```
src/gateway/server-methods/profile.ts    # profile.parse 方法实现
```

**修改文件：**

```
src/gateway/server-methods-list.ts       # 在 BASE_METHODS 末尾追加 "profile.parse"
src/gateway/server-methods.ts            # import profileHandlers 并 spread 到 coreGatewayHandlers
```

### 5.6 模板自动选择逻辑

在 `handleProfileTemplateLoad()` 中实现：

```typescript
// 1. 从 USER.md 解析当前 ROLE
function parseRoleFromUserMd(content: string): string | null {
  const roleMatch = content.match(/\*\*Role\*\*:\s*(.+)/i);
  return roleMatch?.[1]?.trim() || null;
}

// 2. 根据 ROLE 匹配模板 ID
function findTemplateIdByRole(role: string): string | null {
  const normalizedRole = role.toLowerCase();
  // 优先精确匹配
  const exactMatch = PROFILE_TEMPLATES.find((t) => t.defaultRole.toLowerCase() === normalizedRole);
  if (exactMatch) {
    return exactMatch.id;
  }
  // 其次部分匹配
  const partialMatch = PROFILE_TEMPLATES.find(
    (t) =>
      normalizedRole.includes(t.defaultRole.toLowerCase()) ||
      t.defaultRole.toLowerCase().includes(normalizedRole),
  );
  if (partialMatch) {
    return partialMatch.id;
  }
  return null;
}

// 3. 加载时自动选择
const role = parseRoleFromUserMd(content);
if (role) {
  const templateId = findTemplateIdByRole(role);
  if (templateId && !state.profileTemplateId) {
    await handleProfileTemplateSelect(state, templateId);
  }
}
// 兜底：选择第一个模板
if (!state.profileTemplateId && PROFILE_TEMPLATES.length > 0) {
  await handleProfileTemplateSelect(state, PROFILE_TEMPLATES[0].id);
}
```

### 5.7 页面刷新数据加载

在 `ui/src/ui/app-settings.ts` 的 `refreshActiveTab()` 中添加：

```typescript
if (host.tab === "profile-templates") {
  await handleProfileTemplateLoad(host as unknown as OpenClawApp);
}
if (host.tab === "profile-edit") {
  await handleProfileEditLoad(host as unknown as OpenClawApp);
}
```

这样当用户：

- 刷新页面时，数据会自动加载
- 从其他 tab 切换回来时，数据会自动刷新

### 5.8 文件写入策略（追加）

写入时的合并逻辑（前端和后端均遵循）：

```typescript
const existing =
  (await client.request("agents.files.get", { agentId, name: "USER.md" }))?.file?.content ?? "";
const merged = existing.trimEnd() ? `${existing.trimEnd()}\n\n${newSection}` : newSection;
await client.request("agents.files.set", { agentId, name: "USER.md", content: merged });
```

---

## 六、各 Workspace 文件写入规则（本期）

| 文件          | 功能一写入 | 功能二写入            | 备注                           |
| ------------- | ---------- | --------------------- | ------------------------------ |
| `USER.md`     | ✅ 追加    | ✅ 追加（结构化部分） | 主要画像文件                   |
| `MEMORY.md`   | ❌ 不写入  | ✅ 追加（补充背景）   | 长期记忆文件                   |
| `AGENTS.md`   | ❌ 不写入  | ❌ 不写入             | 系统行为规则，不由用户画像决定 |
| `SOUL.md`     | ❌ 不写入  | ❌ 不写入             | Agent 人格，独立于用户画像     |
| `IDENTITY.md` | ❌ 不写入  | ❌ 不写入             | Agent 自我设定，Profile 不干预 |
| `TOOLS.md`    | ❌ 不写入  | ❌ 不写入             | 技术工具配置，与用户习惯无关   |

**设计原则：**

- 功能一仅写 `USER.md`，功能二写 `USER.md` 和 `MEMORY.md`
- 功能一和功能二**相互独立**，各自追加，不互相覆盖
- 所有写入操作必须经过预览确认步骤

---

## 七、关键设计决策

### Q1：内容冲突如何处理？

采用**追加策略**，每次保存在文件末尾追加一个带时间戳的 section。代理读取文件时会综合所有内容，新内容自然优先（靠近文件底部，上下文中排序更靠后）。

### Q2：功能一和功能二是否共享字段？

不共享。功能一写入结构化模板字段，功能二写入 AI 分析的自由内容，两者在文件中是独立的 section，互不影响。

### Q3：URL 解析失败如何处理？

- 抓取失败（网络错误、访问限制）：在预览界面提示"无法访问该 URL，已跳过"
- 内容为空或无效：提示用户，不生成对应内容
- 部分 URL 失败：仅处理成功的部分，在预览界面注明哪些 URL 未能解析

### Q4：写入后如何验证生效？

- 写入成功后，前端显示成功提示
- 用户可切换到 `agents.files.get` 查看实际文件内容
- 下次 AI 对话时，代理会读取更新后的 `USER.md` / `MEMORY.md`

---

## 八、开发任务拆解

### Phase 1：前端基础框架 ✅

- [x] 新增 `ui/src/ui/navigation.ts` 中 profile / profile-templates / profile-edit tab 注册
- [x] 新增 `ui/src/ui/icons.ts` 中 user 图标
- [x] 新增 `ui/src/i18n/locales/en.ts` 中 profile 翻译
- [x] 新增 `ui/src/ui/app-view-state.ts` 中 profile state 字段
- [x] 新增 `ui/src/ui/app.ts` 中 @state() 初始化
- [x] 新增 `ui/src/ui/views/profile.ts`：
  - Profile Home 入口页面（两个功能卡片）
  - Profile Templates 子页面（USER.md 展示 + 模板选择 + 表单）
  - Profile Edit 子页面（双文件编辑 + Text/URL 输入）
- [x] 新增 `ui/src/ui/app-render.ts` 中三个页面的渲染注册
- [x] 新增 `ui/src/ui/app-settings.ts` 中 refreshActiveTab 数据加载

### Phase 2：功能一写入对接 ✅

- [x] 调用 `agents.files.get` 读取现有 `USER.md`
- [x] 实现内容追加拼接逻辑（`mergeContent`）
- [x] 调用 `agents.files.set` 写入更新内容
- [x] 写入成功/失败状态处理（3 秒成功提示）

### Phase 3：功能二后端实现 ✅

- [x] 新增 `src/gateway/server-methods/profile.ts`，实现 `profile.parse` 方法
- [x] URL 内容抓取逻辑（15 秒超时，失败加入 skippedUrls）
- [x] AI 分析 Prompt 设计（`<USER_MD>` / `<MEMORY_MD>` XML 格式输出）
- [x] 注册到 `server-methods-list.ts` 和 `server-methods.ts`

### Phase 4：功能二前端对接 ✅

- [x] Free Input Tab：文字 + URL 混合输入
- [x] 调用 `profile.parse` 方法，处理 Loading 状态
- [x] 预览弹窗展示两部分内容（USER.md + MEMORY.md 可编辑）
- [x] 写入确认后分别追加写入两个文件

### Phase 5：页面架构重构 ✅

- [x] Profile 页面拆分为三个子页面（Home / Templates / Edit）
- [x] 子页面导航和返回按钮实现
- [x] 侧边栏高亮规则（子页面时 Profile 保持高亮）

### Phase 6：交互优化 ✅

- [x] Profile Templates 页面移除 MEMORY.md 展示
- [x] USER.md 预览/编辑双模式切换
- [x] Domains/Tools/Preferences 改为对话框交互
- [x] Save 成功后自动刷新内容展示

### Phase 7：智能模板选择 ✅

- [x] 从 USER.md 解析 ROLE 字段
- [x] ROLE 与模板自动匹配（精确匹配 → 部分匹配）
- [x] 无匹配时默认选择第一个模板
- [x] 模板表单默认展开

### Phase 8：刷新 Bug 修复 ✅

- [x] 在 `refreshActiveTab` 中添加 profile-templates 数据加载
- [x] 在 `refreshActiveTab` 中添加 profile-edit 数据加载
- [x] 页面刷新后自动加载 USER.md / MEMORY.md 内容

### Phase 9：测试与完善（待验证）

- [ ] 各职业模板的字段预填验证
- [ ] 追加写入不覆盖已有内容的验证
- [ ] URL 解析失败的错误处理验证
- [ ] 预览界面的可编辑性验证
- [ ] 模板自动选择逻辑验证（不同 ROLE 的匹配情况）

---

## 九、已确认事项

1. **侧边栏 Profile 图标**：使用 `User` 图标
2. **profile.parse 的 AI 模型**：使用 Gateway 当前配置的默认模型
3. **URL 抓取的超时时间**：15 秒，超时则跳过该 URL 并在预览界面提示
4. **多语言支持**：本期不做国际化，界面语言统一使用英文（English），仅针对功能展示字段，用户输入内容不做翻译处理。
