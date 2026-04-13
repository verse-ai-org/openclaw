# 工具UI组件

<cite>
**本文档引用的文件**
- [ToolFallback.tsx](file://ui-react/src/components/chat/ToolFallback.tsx)
- [ToolCallGroup.tsx](file://ui-react/src/components/chat/ToolCallGroup.tsx)
- [OptionList.tsx](file://ui-react/src/components/tool-ui/option-list/option-list.tsx)
- [OptionListSchema.ts](file://ui-react/src/components/tool-ui/option-list/schema.ts)
- [QuestionFlow.tsx](file://ui-react/src/components/tool-ui/question-flow/question-flow.tsx)
- [QuestionFlowSchema.ts](file://ui-react/src/components/tool-ui/question-flow/schema.ts)
- [ActionButtons.tsx](file://ui-react/src/components/tool-ui/shared/action-buttons.tsx)
- [useActionButtons.tsx](file://ui-react/src/components/tool-ui/shared/use-action-buttons.tsx)
- [Chart.tsx](file://ui-react/src/components/tool-ui/chart/chart.tsx)
- [ChartSchema.ts](file://ui-react/src/components/tool-ui/chart/schema.ts)
- [CodeBlock.tsx](file://ui-react/src/components/tool-ui/code-block/code-block.tsx)
- [CodeBlockSchema.ts](file://ui-react/src/components/tool-ui/code-block/schema.ts)
- [LinkPreview.tsx](file://ui-react/src/components/tool-ui/link-preview/link-preview.tsx)
- [LinkPreviewSchema.ts](file://ui-react/src/components/tool-ui/link-preview/schema.ts)
- [StatsDisplay.tsx](file://ui-react/src/components/tool-ui/stats-display/stats-display.tsx)
- [StatsDisplaySchema.ts](file://ui-react/src/components/tool-ui/stats-display/schema.ts)
- [Terminal.tsx](file://ui-react/src/components/tool-ui/terminal/terminal.tsx)
- [TerminalSchema.ts](file://ui-react/src/components/tool-ui/terminal/schema.ts)
- [weather-widget-container.tsx](file://ui-react/src/components/tool-ui/weather-widget/weather-widget-container.tsx)
- [runtime.ts](file://ui-react/src/components/tool-ui/weather-widget/runtime.ts)
- [tool-cards.ts](file://ui/src/ui/chat/tool-cards.ts)
- [tool-helpers.ts](file://ui/src/ui/chat/tool-helpers.ts)
- [constants.ts](file://ui/src/ui/chat/constants.ts)
- [button.tsx](file://ui-react/src/components/ui/button.tsx)
- [drawer.tsx](file://ui-react/src/components/ui/drawer.tsx)
- [utils.ts](file://ui-react/src/lib/utils.ts)
- [window.ts](file://apps/electron/src/main/window.ts)
- [control-ui-assets.ts](file://src/infra/control-ui-assets.ts)
- [markdown-text.tsx](file://ui-react/src/components/assistant-ui/markdown-text.tsx)
- [AssistantMessage.tsx](file://ui-react/src/components/chat/AssistantMessage.tsx)
- [SkillsPage.tsx](file://ui-react/src/pages/SkillsPage.tsx)
</cite>

## 更新摘要
**所做更改**
- 新增Chart、CodeBlock、LinkPreview、StatsDisplay、Terminal等富工具UI组件
- 新增6个完整的工具UI组件系统，每个都包含独立的schema验证和渲染逻辑
- 引入了专业的数据可视化、代码高亮、链接预览、统计展示和终端输出功能
- 更新了工具UI基础设施，支持图表、代码块、链接预览、统计数据、终端输出等丰富内容类型
- 新增了完整的富工具UI基础设施，提升了工具调用结果的可视化和交互体验

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构概览](#架构概览)
5. [详细组件分析](#详细组件分析)
6. [依赖关系分析](#依赖关系分析)
7. [性能考虑](#性能考虑)
8. [故障排除指南](#故障排除指南)
9. [结论](#结论)

## 简介

工具UI组件是OpenClaw项目中用于展示和交互AI工具调用结果的核心界面组件。该组件系统提供了统一的工具调用可视化、状态管理和用户交互功能，支持多种工具类型（读取、写入、执行、搜索、网络请求等）的分类显示和详细查看。

**更新** 新增了强大的富工具UI基础设施，包含6个专业级组件：Chart图表、CodeBlock代码块、LinkPreview链接预览、StatsDisplay统计数据、Terminal终端输出、OptionList选项列表和QuestionFlow问题流程。这些组件提供了从简单到复杂的完整工具UI解决方案，支持数据可视化、代码展示、链接分享、统计分析和交互式问答等多种场景。

该组件系统采用现代化的React设计，结合Tailwind CSS样式系统和专业的第三方库（如Recharts、Shiki、ansi-to-react），为用户提供直观且功能丰富的工具调用体验。组件支持响应式设计，在桌面端和移动端都能提供优秀的用户体验。

## 项目结构

OpenClaw项目的工具UI组件主要分布在两个前端框架中，现已扩展到包含新增的富工具UI基础设施：

```mermaid
graph TB
subgraph "React前端 (ui-react)"
RF1[ToolFallback 组件]
RF2[ToolCallGroup 组件]
RF3[天气小部件]
RF4[UI基础组件]
RF5[Markdown文本组件]
RF6[Chart 图表组件]
RF7[CodeBlock 代码块组件]
RF8[LinkPreview 链接预览组件]
RF9[StatsDisplay 统计显示组件]
RF10[Terminal 终端输出组件]
RF11[OptionList 选项列表组件]
RF12[QuestionFlow 问题流程组件]
RF13[ActionButtons 动作按钮组件]
end
subgraph "Lit前端 (ui)"
LF1[工具卡片渲染]
LF2[工具助手函数]
LF3[聊天常量]
end
subgraph "应用集成"
A1[Electron窗口管理]
A2[控制UI资源解析]
end
subgraph "共享组件系统"
SC1[ActionButtons]
SC2[useActionButtons]
SC3[Contract定义]
SC4[Schema验证]
SC5[主题系统]
SC6[复制粘贴功能]
end
subgraph "第三方库集成"
TL1[Recharts 数据可视化]
TL2[Shiki 语法高亮]
TL3[ansi-to-react ANSI转义]
TL4[Lucide Icons 图标库]
TL5[Zod Schema 类型验证]
end
RF1 --> RF4
RF2 --> RF4
RF3 --> RF4
RF5 --> RF1
RF6 --> SC1
RF7 --> SC1
RF8 --> SC1
RF9 --> SC1
RF10 --> SC1
RF11 --> SC1
RF12 --> SC1
RF13 --> SC2
SC1 --> SC2
SC3 --> SC4
SC5 --> TL1
SC5 --> TL2
SC5 --> TL3
SC6 --> TL4
SC6 --> TL5
LF1 --> LF2
LF2 --> LF3
A1 --> RF1
A2 --> RF1
```

**图表来源**
- [ToolFallback.tsx:1-527](file://ui-react/src/components/chat/ToolFallback.tsx#L1-L527)
- [Chart.tsx:1-183](file://ui-react/src/components/tool-ui/chart/chart.tsx#L1-L183)
- [CodeBlock.tsx:1-468](file://ui-react/src/components/tool-ui/code-block/code-block.tsx#L1-L468)
- [LinkPreview.tsx:1-142](file://ui-react/src/components/tool-ui/link-preview/link-preview.tsx#L1-L142)
- [StatsDisplay.tsx:1-282](file://ui-react/src/components/tool-ui/stats-display/stats-display.tsx#L1-L282)
- [Terminal.tsx:1-284](file://ui-react/src/components/tool-ui/terminal/terminal.tsx#L1-L284)
- [OptionList.tsx:1-626](file://ui-react/src/components/tool-ui/option-list/option-list.tsx#L1-L626)
- [QuestionFlow.tsx:1-794](file://ui-react/src/components/tool-ui/question-flow/question-flow.tsx#L1-L794)

**章节来源**
- [ToolFallback.tsx:1-527](file://ui-react/src/components/chat/ToolFallback.tsx#L1-L527)
- [Chart.tsx:1-183](file://ui-react/src/components/tool-ui/chart/chart.tsx#L1-L183)
- [CodeBlock.tsx:1-468](file://ui-react/src/components/tool-ui/code-block/code-block.tsx#L1-L468)
- [LinkPreview.tsx:1-142](file://ui-react/src/components/tool-ui/link-preview/link-preview.tsx#L1-L142)
- [StatsDisplay.tsx:1-282](file://ui-react/src/components/tool-ui/stats-display/stats-display.tsx#L1-L282)
- [Terminal.tsx:1-284](file://ui-react/src/components/tool-ui/terminal/terminal.tsx#L1-L284)
- [tool-cards.ts:1-157](file://ui/src/ui/chat/tool-cards.ts#L1-L157)

## 核心组件

工具UI组件系统包含以下核心组件：

### 工具分类系统
系统支持9种工具分类，每种分类都有对应的图标、颜色主题和操作标签：

| 分类 | 图标 | 颜色主题 | 操作标签 | 示例工具 |
|------|------|----------|----------|----------|
| read | FileTextIcon | 蓝色 | Read | 文件读取、数据获取 |
| write | PencilIcon | 橙色 | Write | 文件写入、数据更新 |
| exec | TerminalIcon | 紫色 | Exec | 命令执行、脚本运行 |
| search | SearchIcon | 青色 | Search | 搜索、查询 |
| web | GlobeIcon | 天蓝色 | Web | 网络请求、HTTP调用 |
| database | DatabaseIcon | 橙色 | Database | 数据库操作 |
| file | FolderIcon | 黄色 | File | 文件系统操作 |
| function | FunctionSquareIcon | 靛蓝色 | Call | 函数调用 |
| default | WrenchIcon | 灰色 | Tool | 其他工具 |

### 新增的富工具UI组件

**更新** 新增了6个专业级富工具UI组件，提供完整的工具调用结果可视化：

#### Chart 图表组件
- **数据可视化**：支持柱状图和折线图两种类型
- **交互式图表**：支持数据点点击和悬停提示
- **主题定制**：支持自定义颜色和样式
- **响应式设计**：适配不同屏幕尺寸
- **无障碍支持**：完整的ARIA标签和键盘导航

#### CodeBlock 代码块组件
- **语法高亮**：支持多种编程语言的语法高亮
- **主题切换**：自动适配深色/浅色主题
- **行号显示**：可选的行号显示功能
- **代码复制**：一键复制整个代码块
- **折叠展开**：支持大代码块的折叠显示

#### LinkPreview 链接预览组件
- **链接解析**：自动提取链接标题、描述和图片
- **安全导航**：安全的链接打开机制
- **域名标识**：显示网站域名和favicon
- **响应式布局**：适配不同屏幕尺寸
- **无障碍支持**：键盘导航和屏幕阅读器支持

#### StatsDisplay 统计显示组件
- **多格式支持**：数字、货币、百分比等多种格式
- **趋势展示**：内置Sparkline图表展示趋势
- **对比分析**：支持正负变化的颜色标识
- **本地化**：支持多语言数字格式化
- **网格布局**：响应式的统计卡片网格

#### Terminal 终端输出组件
- **ANSI转义**：完整支持ANSI颜色和格式
- **输出分栏**：区分标准输出和错误输出
- **复制功能**：一键复制终端输出
- **折叠控制**：支持大输出的折叠显示
- **状态指示**：显示退出码和执行时间

### 状态管理系统
工具调用状态分为三种：
- **running**: 工具正在执行中
- **complete**: 工具执行完成
- **incomplete**: 工具执行失败或被取消

**章节来源**
- [ToolFallback.tsx:78-154](file://ui-react/src/components/chat/ToolFallback.tsx#L78-L154)
- [ToolFallback.tsx:160-190](file://ui-react/src/components/chat/ToolFallback.tsx#L160-L190)
- [Chart.tsx:39-183](file://ui-react/src/components/tool-ui/chart/chart.tsx#L39-L183)
- [CodeBlock.tsx:178-468](file://ui-react/src/components/tool-ui/code-block/code-block.tsx#L178-L468)
- [LinkPreview.tsx:22-142](file://ui-react/src/components/tool-ui/link-preview/link-preview.tsx#L22-L142)
- [StatsDisplay.tsx:218-282](file://ui-react/src/components/tool-ui/stats-display/stats-display.tsx#L218-L282)
- [Terminal.tsx:192-284](file://ui-react/src/components/tool-ui/terminal/terminal.tsx#L192-L284)

## 架构概览

工具UI组件系统采用分层架构设计，现已扩展包含新增的富工具UI基础设施：

```mermaid
graph TD
subgraph "组件层次结构"
A[ToolCallGroup<br/>工具调用组容器] --> B[ToolFallback<br/>工具回退组件]
B --> C[ToolDetailDrawer<br/>工具详情抽屉]
B --> D[状态徽章<br/>StatusBadge]
A --> E[图标条<br/>Icon Strip]
A --> F[状态徽章<br/>GroupStatusBadge]
end
subgraph "新增富工具UI系统"
CH[Chart<br/>图表组件] --> CHV[ChartView<br/>图表视图]
CB[CodeBlock<br/>代码块组件] --> CBS[CodeBlockState<br/>代码块状态]
LP[LinkPreview<br/>链接预览组件] --> LPS[LinkState<br/>链接状态]
SD[StatsDisplay<br/>统计显示组件] --> SDS[StatCard<br/>统计卡片]
TE[Terminal<br/>终端组件] --> TES[TerminalState<br/>终端状态]
end
subgraph "新增OptionList系统"
OL[OptionList<br/>选项列表组件] --> AB[ActionButtons<br/>动作按钮]
OL --> SL[Selection Logic<br/>选择逻辑]
OL --> RV[Receipt View<br/>收据视图]
end
subgraph "新增QuestionFlow系统"
QF[QuestionFlow<br/>问题流程组件] --> PF[Progressive Mode<br/>渐进式模式]
QF --> UF[Upfront Mode<br/>前置式模式]
QF --> RF[Receipt Mode<br/>收据模式]
QF --> PB[Progress Bar<br/>进度条]
QF --> KB[Keyboard Navigation<br/>键盘导航]
end
subgraph "共享组件系统"
AB --> UAB[useActionButtons<br/>动作按钮钩子]
SC[Schema Contract<br/>模式契约] --> PV[Parse Validation<br/>解析验证]
SH[Shared Helpers<br/>共享助手] --> TH[Theme Handling<br/>主题处理]
SH --> CC[Copy Control<br/>复制控制]
end
subgraph "第三方库集成"
TL1[Recharts<br/>数据可视化库]
TL2[Shiki<br/>语法高亮库]
TL3[ansi-to-react<br/>ANSI转义库]
TL4[Lucide Icons<br/>图标库]
TL5[Zod Schema<br/>类型验证库]
end
subgraph "辅助组件"
G[分类配置<br/>TOOL_CATEGORY_CONFIG]
H[工具分类<br/>classifyTool]
I[参数预览<br/>buildArgsPreview]
J[格式化工具标签<br/>formatToolLabel]
K[Markdown组件共享<br/>plainMdComponents]
end
subgraph "外部集成"
L[Assistant UI<br/>React组件库]
M[Electron窗口<br/>静态服务器]
N[Lit前端<br/>传统UI]
O[ReactMarkdown<br/>Markdown渲染]
P[RemarkGfm<br/>GitHub风格标记]
Q[Zod Schema<br/>Zod模式验证]
R[Lucide Icons<br/>图标库]
end
A --> L
B --> L
C --> L
B --> K
K --> O
O --> P
CH --> TL1
CB --> TL2
TE --> TL3
AB --> R
QF --> R
OL --> R
CH --> SH
CB --> SH
LP --> SH
SD --> SH
TE --> SH
AB --> UAB
SC --> PV
A --> M
B --> M
N --> B
```

**图表来源**
- [ToolCallGroup.tsx:147-274](file://ui-react/src/components/chat/ToolCallGroup.tsx#L147-L274)
- [ToolFallback.tsx:405-527](file://ui-react/src/components/chat/ToolFallback.tsx#L405-L527)
- [Chart.tsx:1-183](file://ui-react/src/components/tool-ui/chart/chart.tsx#L1-L183)
- [CodeBlock.tsx:1-468](file://ui-react/src/components/tool-ui/code-block/code-block.tsx#L1-L468)
- [LinkPreview.tsx:1-142](file://ui-react/src/components/tool-ui/link-preview/link-preview.tsx#L1-L142)
- [StatsDisplay.tsx:1-282](file://ui-react/src/components/tool-ui/stats-display/stats-display.tsx#L1-L282)
- [Terminal.tsx:1-284](file://ui-react/src/components/tool-ui/terminal/terminal.tsx#L1-L284)
- [OptionList.tsx:1-626](file://ui-react/src/components/tool-ui/option-list/option-list.tsx#L1-L626)
- [QuestionFlow.tsx:1-794](file://ui-react/src/components/tool-ui/question-flow/question-flow.tsx#L1-L794)
- [ActionButtons.tsx:1-101](file://ui-react/src/components/tool-ui/shared/action-buttons.tsx#L1-L101)
- [useActionButtons.tsx:1-154](file://ui-react/src/components/tool-ui/shared/use-action-buttons.tsx#L1-L154)

## 详细组件分析

### ToolCallGroup 组件

ToolCallGroup是工具调用组的容器组件，负责管理多个连续的工具调用：

```mermaid
classDiagram
class ToolCallGroup {
+number startIndex
+number endIndex
+JSX.Element children
+deriveGroupStatus(parts, messageIsRunning) GroupStatus
+buildIconStrip(toolNames, maxIcons) IconConfig
+handleToggle() void
}
class GroupStatusBadge {
+GroupStatus status
+number failCount
+render() JSX.Element
}
class RawToolPart {
+string type
+string toolName
+unknown result
+boolean isError
}
ToolCallGroup --> GroupStatusBadge : "使用"
ToolCallGroup --> RawToolPart : "处理"
```

**图表来源**
- [ToolCallGroup.tsx:142-274](file://ui-react/src/components/chat/ToolCallGroup.tsx#L142-L274)

#### 核心功能特性

1. **智能折叠管理**: 自动折叠和展开工具调用组
2. **状态聚合**: 将多个工具调用的状态聚合为组状态
3. **图标条显示**: 显示工具分类的图标条
4. **实时状态更新**: 监听消息流状态变化

**章节来源**
- [ToolCallGroup.tsx:40-67](file://ui-react/src/components/chat/ToolCallGroup.tsx#L40-L67)
- [ToolCallGroup.tsx:69-92](file://ui-react/src/components/chat/ToolCallGroup.tsx#L69-L92)

### ToolFallback 组件

ToolFallback是工具调用的回退显示组件，提供详细的工具调用信息：

```mermaid
sequenceDiagram
participant U as 用户
participant TF as ToolFallback
participant TDC as ToolDetailDrawer
participant CFG as 分类配置
participant ST as 状态检测
U->>TF : 点击工具卡片
TF->>CFG : 获取工具分类配置
TF->>ST : 检测工具状态
ST-->>TF : 返回状态类型
TF->>TDC : 打开详情抽屉
TDC-->>U : 显示详细信息
Note over TF,TDC : 支持参数预览、错误信息、结果展示
```

**图表来源**
- [ToolFallback.tsx:405-527](file://ui-react/src/components/chat/ToolFallback.tsx#L405-L527)
- [ToolFallback.tsx:281-400](file://ui-react/src/components/chat/ToolFallback.tsx#L281-L400)

#### 详细功能模块

1. **工具分类识别**: 基于工具名称自动分类
2. **参数预览生成**: 智能提取关键参数进行预览
3. **状态检测**: 检测工具执行状态和错误
4. **详情抽屉**: 提供完整的工具调用详情
5. **富工具UI支持**: 新增对Chart、CodeBlock、LinkPreview、StatsDisplay、Terminal等组件的支持

**章节来源**
- [ToolFallback.tsx:227-277](file://ui-react/src/components/chat/ToolFallback.tsx#L227-L277)
- [ToolFallback.tsx:438-452](file://ui-react/src/components/chat/ToolFallback.tsx#L438-L452)

### ToolDetailDrawer 组件

ToolDetailDrawer提供工具调用的详细信息展示：

```mermaid
flowchart TD
A[打开抽屉] --> B{检查参数}
B --> |有参数| C[显示参数部分]
B --> |无参数| D[跳过参数部分]
A --> E{检查错误}
E --> |有错误| F[显示错误信息]
E --> |无错误| G[跳过错误部分]
A --> H{检查结果}
H --> |有结果| I[解析并显示结果]
H --> |无结果| J{状态完成?}
J --> |是| K[显示空输出提示]
J --> |否| L[等待结果]
I --> M[显示元数据]
I --> N[渲染Markdown内容]
```

**图表来源**
- [ToolFallback.tsx:294-400](file://ui-react/src/components/chat/ToolFallback.tsx#L294-L400)

**章节来源**
- [ToolFallback.tsx:327-387](file://ui-react/src/components/chat/ToolFallback.tsx#L327-L387)

### Chart 图表组件

Chart组件提供了专业的数据可视化功能：

```mermaid
classDiagram
class Chart {
+ChartProps props
+ChartConfig chartConfig
+ChartContainer container
+handleDataPointClick() void
+render() JSX.Element
}
class ChartSeries {
+string key
+string label
+string color
}
class ChartDataPoint {
+Record dataKey value
+string xKey
+Array series
}
class ChartAdapter {
+Card card
+ChartTooltip tooltip
+ChartLegend legend
+ChartContainer container
}
Chart --> ChartSeries : "使用"
Chart --> ChartDataPoint : "处理"
Chart --> ChartAdapter : "包装"
```

**图表来源**
- [Chart.tsx:39-183](file://ui-react/src/components/tool-ui/chart/chart.tsx#L39-L183)

#### 核心功能特性

1. **双模式支持**: 支持柱状图和折线图两种图表类型
2. **交互式设计**: 支持数据点点击和悬停提示
3. **主题定制**: 支持自定义颜色方案和样式
4. **响应式布局**: 适配不同屏幕尺寸的容器
5. **无障碍支持**: 完整的ARIA标签和键盘导航

**章节来源**
- [Chart.tsx:39-183](file://ui-react/src/components/tool-ui/chart/chart.tsx#L39-L183)
- [Chart.tsx:55-76](file://ui-react/src/components/tool-ui/chart/chart.tsx#L55-L76)
- [Chart.tsx:78-95](file://ui-react/src/components/tool-ui/chart/chart.tsx#L78-L95)

### CodeBlock 代码块组件

CodeBlock组件提供了强大的代码高亮和展示功能：

```mermaid
classDiagram
class CodeBlock {
+CodeBlockProps props
+Highlighter highlighter
+Map htmlCache
+useState expanded
+useState highlightedHtml
+getLanguageDisplayName() string
+copyCode() void
+toggleExpanded() void
+render() JSX.Element
}
class CodeBlockRoot {
+CodeBlockSharedState state
+useResolvedTheme() string
+getCacheKey() string
+setCachedHtml() void
}
class CodeBlockContext {
+CodeBlockSharedState state
+useCodeBlock() CodeBlockSharedState
}
class CodeBlockAdapter {
+Card card
+Button button
+Collapsible collapsible
+CollapsibleTrigger trigger
}
CodeBlock --> CodeBlockRoot : "组合"
CodeBlock --> CodeBlockContext : "使用"
CodeBlock --> CodeBlockAdapter : "包装"
```

**图表来源**
- [CodeBlock.tsx:178-468](file://ui-react/src/components/tool-ui/code-block/code-block.tsx#L178-L468)

#### 核心功能特性

1. **多语言支持**: 支持多种编程语言的语法高亮
2. **主题适配**: 自动适配深色/浅色系统主题
3. **行号显示**: 可选的行号显示功能
4. **代码复制**: 一键复制整个代码块
5. **折叠控制**: 支持大代码块的折叠显示
6. **性能优化**: HTML缓存机制减少重复渲染

**章节来源**
- [CodeBlock.tsx:178-468](file://ui-react/src/components/tool-ui/code-block/code-block.tsx#L178-L468)
- [CodeBlock.tsx:29-38](file://ui-react/src/components/tool-ui/code-block/code-block.tsx#L29-L38)
- [CodeBlock.tsx:42-72](file://ui-react/src/components/tool-ui/code-block/code-block.tsx#L42-L72)

### LinkPreview 链接预览组件

LinkPreview组件提供了优雅的链接预览功能：

```mermaid
classDiagram
class LinkPreview {
+LinkPreviewProps props
+SerializableLinkPreview previewData
+sanitizeHref() string
+openSafeNavigationHref() void
+handleClick() void
+render() JSX.Element
}
class LinkState {
+string id
+string href
+string title
+string description
+string image
+string domain
+string favicon
+string ratio
+string fit
+string locale
}
class LinkAdapter {
+Card card
+Image img
+Button button
+Globe globe
}
LinkPreview --> LinkState : "管理状态"
LinkPreview --> LinkAdapter : "使用适配器"
```

**图表来源**
- [LinkPreview.tsx:22-142](file://ui-react/src/components/tool-ui/link-preview/link-preview.tsx#L22-L142)

#### 核心功能特性

1. **链接解析**: 自动提取链接的标题、描述和图片
2. **安全导航**: 安全的链接打开机制，防止恶意链接
3. **域名标识**: 显示网站域名和favicon图标
4. **响应式布局**: 适配不同屏幕尺寸的卡片设计
5. **无障碍支持**: 键盘导航和屏幕阅读器友好的结构
6. **国际化支持**: 支持多语言环境下的本地化显示

**章节来源**
- [LinkPreview.tsx:22-142](file://ui-react/src/components/tool-ui/link-preview/link-preview.tsx#L22-L142)
- [LinkPreview.tsx:25-45](file://ui-react/src/components/tool-ui/link-preview/link-preview.tsx#L25-L45)
- [LinkPreview.tsx:47-54](file://ui-react/src/components/tool-ui/link-preview/link-preview.tsx#L47-L54)

### StatsDisplay 统计显示组件

StatsDisplay组件提供了专业的统计信息展示功能：

```mermaid
classDiagram
class StatsDisplay {
+StatsDisplayProps props
+StatItem[] stats
+string locale
+boolean isSingle
+render() JSX.Element
}
class StatItem {
+string key
+string label
+number value
+StatFormat format
+StatDiff diff
+StatSparkline sparkline
}
class StatCard {
+StatItem stat
+string locale
+boolean isSingle
+index number
+FormattedValue formattedValue
+DeltaValue deltaValue
+Sparkline sparkline
}
class StatsAdapter {
+Card card
+CardHeader header
+CardContent content
+Sparkline sparkline
}
StatsDisplay --> StatItem : "渲染"
StatsDisplay --> StatCard : "组合"
StatsDisplay --> StatsAdapter : "包装"
```

**图表来源**
- [StatsDisplay.tsx:218-282](file://ui-react/src/components/tool-ui/stats-display/stats-display.tsx#L218-L282)

#### 核心功能特性

1. **多格式支持**: 支持数字、货币、百分比等多种格式
2. **趋势展示**: 内置Sparkline图表展示数值趋势
3. **对比分析**: 支持正负变化的颜色标识和符号显示
4. **本地化**: 支持多语言环境下的数字格式化
5. **响应式布局**: 网格布局适配不同屏幕尺寸
6. **动画效果**: 统计卡片的渐入动画效果

**章节来源**
- [StatsDisplay.tsx:218-282](file://ui-react/src/components/tool-ui/stats-display/stats-display.tsx#L218-L282)
- [StatsDisplay.tsx:24-106](file://ui-react/src/components/tool-ui/stats-display/stats-display.tsx#L24-L106)
- [StatsDisplay.tsx:108-154](file://ui-react/src/components/tool-ui/stats-display/stats-display.tsx#L108-L154)

### Terminal 终端输出组件

Terminal组件提供了专业的终端输出展示功能：

```mermaid
classDiagram
class Terminal {
+TerminalProps props
+useState expanded
+useState copiedId
+countOutputLines() number
+formatDuration() string
+handleCopy() void
+toggleExpanded() void
+render() JSX.Element
}
class TerminalState {
+string id
+string command
+string cwd
+string stdout
+string stderr
+number exitCode
+number durationMs
+boolean truncated
+boolean hasOutput
+number lineCount
+boolean shouldCollapse
+boolean isCollapsed
}
class TerminalAdapter {
+Card card
+Button button
+Collapsible collapsible
+CollapsibleTrigger trigger
+Ansi ansi
}
Terminal --> TerminalState : "管理状态"
Terminal --> TerminalAdapter : "使用适配器"
```

**图表来源**
- [Terminal.tsx:192-284](file://ui-react/src/components/tool-ui/terminal/terminal.tsx#L192-L284)

#### 核心功能特性

1. **ANSI转义**: 完整支持ANSI颜色和格式代码
2. **输出分栏**: 区分标准输出和错误输出的不同样式
3. **复制功能**: 一键复制完整的终端输出
4. **折叠控制**: 支持大输出的折叠显示和展开
5. **状态指示**: 显示退出码、工作目录和执行时间
6. **截断处理**: 对超长输出进行智能截断显示

**章节来源**
- [Terminal.tsx:192-284](file://ui-react/src/components/tool-ui/terminal/terminal.tsx#L192-L284)
- [Terminal.tsx:48-58](file://ui-react/src/components/tool-ui/terminal/terminal.tsx#L48-L58)
- [Terminal.tsx:206-234](file://ui-react/src/components/tool-ui/terminal/terminal.tsx#L206-L234)

### 天气小部件组件

天气小部件是一个专门的工具UI组件，用于展示天气信息：

```mermaid
classDiagram
class WeatherWidget {
+WeatherWidgetRuntimeProps props
+useState reducedMotion
+useState effectsEnabled
+resolveWeatherTime() TimeInfo
+getNearestCheckpoint() TimeCheckpoint
+getWeatherTheme() WeatherTheme
+render() JSX.Element
}
class WeatherDataOverlay {
+string location
+WeatherWidgetCurrent current
+ForecastDay[] forecast
+TemperatureUnit unit
+WeatherTheme theme
+render() JSX.Element
}
class EffectCompositorRuntime {
+WeatherConditionCode conditionCode
+number windSpeed
+PrecipitationLevel precipitationLevel
+number visibility
+Date timestamp
+TimeOfDay timeOfDay
+render() JSX.Element
}
WeatherWidget --> WeatherDataOverlay : "包含"
WeatherWidget --> EffectCompositorRuntime : "可选包含"
```

**图表来源**
- [weather-widget-container.tsx:20-145](file://ui-react/src/components/tool-ui/weather-widget/weather-widget-container.tsx#L20-L145)

**章节来源**
- [weather-widget-container.tsx:75-96](file://ui-react/src/components/tool-ui/weather-widget/weather-widget-container.tsx#L75-L96)

### OptionList 组件系统

**更新** OptionList组件提供了强大的选项列表选择功能：

```mermaid
classDiagram
class OptionList {
+OptionListProps props
+Set selectedIds
+Array optionStates
+Number activeIndex
+handleToggle() void
+updateSelection() void
+toggleSelection() void
+handleCancel() void
}
class OptionItem {
+OptionListOption option
+Boolean isSelected
+Boolean isDisabled
+SelectionIndicator indicator
+render() JSX.Element
}
class ActionButtons {
+Action[] actions
+runAction() void
+confirmAction() void
}
class SelectionIndicator {
+String mode
+Boolean isSelected
+Boolean disabled
+render() JSX.Element
}
OptionList --> OptionItem : "渲染"
OptionList --> ActionButtons : "使用"
OptionItem --> SelectionIndicator : "包含"
```

**图表来源**
- [OptionList.tsx:216-626](file://ui-react/src/components/tool-ui/option-list/option-list.tsx#L216-L626)
- [OptionList.tsx:77-150](file://ui-react/src/components/tool-ui/option-list/option-list.tsx#L77-L150)
- [ActionButtons.tsx:16-101](file://ui-react/src/components/tool-ui/shared/action-buttons.tsx#L16-L101)

#### 核心功能特性

1. **单选/多选支持**: 支持单选和多选两种模式
2. **动态验证**: 支持最小/最大选择数量限制
3. **键盘导航**: 完整的键盘交互支持（上下箭头、Home、End、Enter、Space）
4. **无障碍支持**: ARIA标签和角色定义
5. **动画效果**: 平滑的选择状态切换动画
6. **确认视图**: 支持选择确认和收据模式

**章节来源**
- [OptionList.tsx:216-230](file://ui-react/src/components/tool-ui/option-list/option-list.tsx#L216-L230)
- [OptionList.tsx:352-378](file://ui-react/src/components/tool-ui/option-list/option-list.tsx#L352-L378)
- [OptionList.tsx:456-518](file://ui-react/src/components/tool-ui/option-list/option-list.tsx#L456-L518)

### QuestionFlow 组件系统

**更新** QuestionFlow组件实现了复杂的步骤化交互流程：

```mermaid
classDiagram
class QuestionFlow {
+QuestionFlowProps props
+Union mode
+render() JSX.Element
}
class QuestionFlowProgressive {
+Number step
+Set selectedIds
+handleToggle() void
+handleNext() void
}
class QuestionFlowUpfront {
+Array steps
+Number currentStepIndex
+Object answers
+handleToggle() void
+handleNext() void
+handleBack() void
}
class StepContent {
+Number step
+Number totalSteps
+String title
+String description
+Array options
+Set selectedIds
+render() JSX.Element
}
class ProgressBar {
+Number current
+Number total
+render() JSX.Element
}
QuestionFlow --> QuestionFlowProgressive : "渐进式模式"
QuestionFlow --> QuestionFlowUpfront : "前置式模式"
QuestionFlowUpfront --> StepContent : "渲染步骤"
StepContent --> ProgressBar : "显示进度"
```

**图表来源**
- [QuestionFlow.tsx:781-793](file://ui-react/src/components/tool-ui/question-flow/question-flow.tsx#L781-L793)
- [QuestionFlow.tsx:573-636](file://ui-react/src/components/tool-ui/question-flow/question-flow.tsx#L573-L636)
- [QuestionFlow.tsx:638-779](file://ui-react/src/components/tool-ui/question-flow/question-flow.tsx#L638-L779)
- [QuestionFlow.tsx:33-58](file://ui-react/src/components/tool-ui/question-flow/question-flow.tsx#L33-L58)

#### 核心功能特性

1. **三种模式支持**: 渐进式、前置式和收据模式
2. **步骤导航**: 支持前进/后退的步骤导航
3. **过渡动画**: 平滑的步骤切换动画效果
4. **进度指示**: 清晰的进度条和步骤指示器
5. **键盘导航**: 完整的键盘交互支持
6. **状态管理**: 复杂的状态管理和数据持久化

**章节来源**
- [QuestionFlow.tsx:781-793](file://ui-react/src/components/tool-ui/question-flow/question-flow.tsx#L781-L793)
- [QuestionFlow.tsx:638-779](file://ui-react/src/components/tool-ui/question-flow/question-flow.tsx#L638-L779)
- [QuestionFlow.tsx:257-447](file://ui-react/src/components/tool-ui/question-flow/question-flow.tsx#L257-L447)

## 依赖关系分析

工具UI组件系统的依赖关系已大幅扩展，包含新增的富工具UI基础设施：

```mermaid
graph TB
subgraph "React组件依赖"
A[ToolFallback] --> B[ToolDetailDrawer]
A --> C[Button组件]
A --> D[Drawer组件]
A --> E[状态徽章]
F[ToolCallGroup] --> G[GroupStatusBadge]
F --> H[图标条]
I[天气小部件] --> J[效果合成器]
I --> K[天气数据覆盖层]
L[Markdown文本组件] --> M[plainMdComponents]
A --> L
end
subgraph "新增富工具UI系统"
CH[Chart] --> TL1[Recharts]
CH --> SH1[ChartAdapter]
CB[CodeBlock] --> TL2[Shiki]
CB --> SH2[CodeBlockAdapter]
LP[LinkPreview] --> SH3[LinkAdapter]
SD[StatsDisplay] --> SH4[StatsAdapter]
TE[Terminal] --> TL3[ansi-to-react]
TE --> SH5[TerminalAdapter]
end
subgraph "新增OptionList系统"
OL[OptionList] --> AB[ActionButtons]
OL --> SL[Selection Logic]
OL --> RV[Receipt View]
OL --> SC[Schema Contract]
end
subgraph "新增QuestionFlow系统"
QF[QuestionFlow] --> PF[Progressive Mode]
QF --> UF[Upfront Mode]
QF --> RF[Receipt Mode]
QF --> PB[Progress Bar]
QF --> KB[Keyboard Navigation]
QF --> SC
end
subgraph "共享组件系统"
AB --> UAB[useActionButtons]
SC --> PC[Parse Contract]
SC --> SV[Schema Validation]
SH6[Shared Helpers] --> TH[Theme Handling]
SH6 --> CC[Copy Control]
end
subgraph "样式和工具"
N[Tailwind CSS]
O[工具函数]
P[类型定义]
end
subgraph "外部库"
Q[Assistant UI]
R[lucide-react]
S[react-markdown]
T[vaul]
U[remark-gfm]
V[@assistant-ui/react-markdown]
W[Zod Schema]
X[React Hooks]
Y[FRamer Motion]
Z[第三方库]
end
A --> N
F --> N
I --> N
CH --> N
CB --> N
LP --> N
SD --> N
TE --> N
OL --> N
QF --> N
AB --> X
QF --> Y
OL --> Y
A --> O
F --> O
I --> O
CH --> O
CB --> O
LP --> O
SD --> O
TE --> O
OL --> O
QF --> O
A --> P
F --> P
I --> P
CH --> P
CB --> P
LP --> P
SD --> P
TE --> P
OL --> P
QF --> P
A --> Q
F --> Q
OL --> Q
QF --> Q
A --> R
CH --> R
CB --> R
LP --> R
SD --> R
TE --> R
OL --> R
QF --> R
A --> S
A --> T
S --> U
L --> V
SC --> W
AB --> UAB
SH6 --> Z
```

**更新** 新增了6个富工具UI组件的完整依赖关系，包括Recharts、Shiki、ansi-to-react等专业第三方库的集成

**图表来源**
- [ToolFallback.tsx:1-32](file://ui-react/src/components/chat/ToolFallback.tsx#L1-L32)
- [Chart.tsx:1-28](file://ui-react/src/components/tool-ui/chart/chart.tsx#L1-L28)
- [CodeBlock.tsx:1-22](file://ui-react/src/components/tool-ui/code-block/code-block.tsx#L1-L22)
- [LinkPreview.tsx:1-11](file://ui-react/src/components/tool-ui/link-preview/link-preview.tsx#L1-L11)
- [StatsDisplay.tsx:1-16](file://ui-react/src/components/tool-ui/stats-display/stats-display.tsx#L1-L16)
- [Terminal.tsx:1-16](file://ui-react/src/components/tool-ui/terminal/terminal.tsx#L1-L16)
- [OptionList.tsx:1-26](file://ui-react/src/components/tool-ui/option-list/option-list.tsx#L1-L26)
- [QuestionFlow.tsx:1-21](file://ui-react/src/components/tool-ui/question-flow/question-flow.tsx#L1-L21)
- [ActionButtons.tsx:1-6](file://ui-react/src/components/tool-ui/shared/action-buttons.tsx#L1-L6)
- [useActionButtons.tsx:1-5](file://ui-react/src/components/tool-ui/shared/use-action-buttons.tsx#L1-L5)

**章节来源**
- [button.tsx:1-56](file://ui-react/src/components/ui/button.tsx#L1-L56)
- [drawer.tsx:1-121](file://ui-react/src/components/ui/drawer.tsx#L1-L121)
- [utils.ts:1-7](file://ui-react/src/lib/utils.ts#L1-L7)

### Markdown组件共享机制

工具UI组件系统采用了共享的Markdown组件机制，通过`plainMdComponents`实现跨组件的一致性渲染：

- **共享组件定义**: 在`markdown-text.tsx`中定义了`plainMdComponents`，为所有需要独立Markdown渲染的场景提供统一的组件配置
- **组件复用**: ToolFallback组件直接导入并使用这个共享的组件配置，避免了重复定义和维护成本
- **样式一致性**: 所有使用plain ReactMarkdown的组件都继承了相同的样式和行为规范

**章节来源**
- [markdown-text.tsx:223-243](file://ui-react/src/components/assistant-ui/markdown-text.tsx#L223-L243)
- [ToolFallback.tsx:30-31](file://ui-react/src/components/chat/ToolFallback.tsx#L30-L31)

### 新增共享组件系统

**更新** 新增了完整的共享组件系统，为富工具UI组件提供统一的基础功能：

#### ActionButtons组件
- **统一动作按钮**: 提供一致的动作按钮渲染和交互逻辑
- **确认机制**: 支持二次确认和加载状态显示
- **对齐选项**: 支持左对齐、居中和右对齐
- **无障碍支持**: 完整的键盘导航和ARIA支持

#### useActionButtons钩子
- **状态管理**: 管理动作按钮的确认、执行和加载状态
- **并发控制**: 防止同时执行多个动作
- **超时处理**: 支持确认超时和ESC取消
- **回调处理**: 统一的动作回调处理机制

#### Schema Contract系统
- **类型安全**: 使用Zod提供运行时类型验证
- **契约定义**: 定义工具UI组件的标准接口
- **序列化支持**: 支持工具调用参数的序列化和反序列化
- **错误处理**: 统一的错误处理和调试支持

#### Shared Helpers系统
- **主题处理**: 统一的主题检测和切换逻辑
- **复制控制**: 统一的复制到剪贴板功能
- **状态管理**: 统一的状态管理和生命周期处理

**章节来源**
- [ActionButtons.tsx:16-101](file://ui-react/src/components/tool-ui/shared/action-buttons.tsx#L16-L101)
- [useActionButtons.tsx:48-153](file://ui-react/src/components/tool-ui/shared/use-action-buttons.tsx#L48-L153)
- [contract.ts:10-19](file://ui-react/src/components/tool-ui/shared/contract.ts#L10-L19)

## 性能考虑

工具UI组件系统在设计时充分考虑了性能优化，新增的富工具UI组件也遵循了同样的原则：

### 渲染优化
1. **条件渲染**: 只在需要时渲染详细信息
2. **状态缓存**: 使用React状态管理避免不必要的重渲染
3. **懒加载**: 抽屉组件按需加载
4. **虚拟滚动**: OptionList支持大量选项的虚拟滚动优化
5. **动画优化**: 使用CSS动画而非JavaScript动画
6. **HTML缓存**: CodeBlock组件使用缓存机制减少重复渲染

### 内存管理
1. **事件监听器清理**: 自动清理媒体查询监听器
2. **状态清理**: 组件卸载时清理所有订阅
3. **引用管理**: 使用useRef管理DOM引用，避免闭包陷阱
4. **记忆化**: 使用useMemo和useCallback优化重渲染
5. **缓存管理**: 合理的缓存大小控制和清理策略

### 用户体验优化
1. **无障碍访问**: 完整的键盘导航支持
2. **响应式设计**: 适配不同屏幕尺寸
3. **动画优化**: 减少运动偏好用户的视觉干扰
4. **加载状态**: 提供清晰的加载和执行状态反馈
5. **性能监控**: 关键操作的性能指标收集

### 第三方库优化
1. **Recharts优化**: 图表组件的懒加载和数据优化
2. **Shiki优化**: 语法高亮的异步加载和缓存机制
3. **ansi-to-react优化**: ANSI转义的高效渲染
4. **主题切换优化**: 自动主题检测和切换的性能优化

## 故障排除指南

### 常见问题及解决方案

#### 工具状态显示异常
**问题**: 工具状态不正确显示
**解决方案**: 
1. 检查工具返回的结果格式
2. 验证`isError`标志设置
3. 确认结果字符串中的错误标识

#### 参数预览不准确
**问题**: 工具参数预览显示不完整
**解决方案**:
1. 检查JSON参数格式
2. 验证参数键名匹配
3. 确认参数值的有效性

#### 抽屉组件无法打开
**问题**: 工具详情抽屉无法正常打开
**解决方案**:
1. 检查`canViewDetail`状态判断
2. 验证事件处理器绑定
3. 确认DOM元素存在

#### Markdown渲染问题
**问题**: 工具结果中的Markdown不正确渲染
**解决方案**:
1. 确认使用了正确的组件配置（plainMdComponents）
2. 检查remarkGfm插件的正确引入
3. 验证frontmatter解析逻辑

#### 富工具UI组件问题

**更新** 新增富工具UI组件相关问题解决：

##### Chart图表组件问题
**问题**: 图表渲染异常或数据不显示
**解决方案**:
1. 检查数据格式是否符合ChartSchema要求
2. 验证xKey和series配置的正确性
3. 确认Recharts库的正确引入
4. 检查容器尺寸和响应式配置

##### CodeBlock代码块问题
**问题**: 语法高亮不工作或主题异常
**解决方案**:
1. 检查语言标识符是否在支持列表中
2. 验证Shiki库的正确初始化
3. 确认主题文件的正确加载
4. 检查HTML缓存机制的工作状态

##### LinkPreview链接预览问题
**问题**: 链接预览无法正常显示或安全检查失败
**解决方案**:
1. 检查URL格式是否正确
2. 验证安全导航函数的调用
3. 确认链接解析逻辑的正确性
4. 检查图片加载和域名提取功能

##### StatsDisplay统计显示问题
**问题**: 数字格式化异常或趋势图表不显示
**解决方案**:
1. 检查StatItem数据结构的完整性
2. 验证格式化配置的正确性
3. 确认本地化设置的可用性
4. 检查Sparkline数据的格式要求

##### Terminal终端输出问题
**问题**: ANSI转义不正确或输出显示异常
**解决方案**:
1. 检查ANSI转义序列的正确性
2. 验证ansi-to-react库的版本兼容性
3. 确认输出分栏和颜色处理逻辑
4. 检查折叠控制和截断处理功能

#### OptionList选择问题
**更新** 新增OptionList相关问题解决：
**问题**: 选项无法正确选择或状态异常
**解决方案**:
1. 检查选项ID的唯一性
2. 验证selectionMode配置
3. 确认最小/最大选择数量限制
4. 检查disabled状态设置

#### QuestionFlow导航问题
**更新** 新增QuestionFlow相关问题解决：
**问题**: 步骤间导航异常或状态丢失
**解决方案**:
1. 检查步骤ID的唯一性
2. 验证步骤顺序和依赖关系
3. 确认答案数据的正确存储
4. 检查过渡动画的配置

#### 动作按钮冲突
**更新** 新增共享组件相关问题解决：
**问题**: 动作按钮点击冲突或状态异常
**解决方案**:
1. 检查动作ID的唯一性
2. 验证确认机制配置
3. 确认并发执行控制
4. 检查回调函数的正确绑定

**章节来源**
- [ToolFallback.tsx:454-488](file://ui-react/src/components/chat/ToolFallback.tsx#L454-L488)
- [ToolFallback.tsx:490-513](file://ui-react/src/components/chat/ToolFallback.tsx#L490-L513)
- [Chart.tsx:352-378](file://ui-react/src/components/tool-ui/chart/chart.tsx#L352-L378)
- [CodeBlock.tsx:352-378](file://ui-react/src/components/tool-ui/code-block/code-block.tsx#L352-L378)
- [LinkPreview.tsx:691-714](file://ui-react/src/components/tool-ui/link-preview/link-preview.tsx#L691-L714)
- [StatsDisplay.tsx:691-714](file://ui-react/src/components/tool-ui/stats-display/stats-display.tsx#L691-L714)
- [Terminal.tsx:691-714](file://ui-react/src/components/tool-ui/terminal/terminal.tsx#L691-L714)

## 结论

工具UI组件系统为OpenClaw项目提供了强大而灵活的工具调用可视化解决方案。通过模块化的组件设计、智能的状态管理和丰富的用户交互功能，该系统能够有效提升用户对AI工具调用的理解和控制能力。

**更新** 本次更新大幅增强了组件系统的功能，新增的富工具UI基础设施提供了完整的工具调用结果可视化能力：

### 主要优势包括：
- **高度可扩展**: 支持新的工具类型和分类
- **用户体验优秀**: 直观的界面设计和流畅的交互
- **技术架构先进**: 基于现代React技术和最佳实践
- **性能优化完善**: 充分考虑了渲染性能和内存使用
- **代码复用高效**: 通过共享组件减少重复代码和维护成本
- **富内容支持**: 新增的Chart、CodeBlock、LinkPreview、StatsDisplay、Terminal组件提供专业的内容展示
- **复杂交互支持**: 新增的OptionList和QuestionFlow支持复杂的用户交互流程
- **类型安全**: 使用Zod提供完整的运行时类型验证
- **无障碍友好**: 完整的键盘导航和ARIA支持
- **第三方库集成**: 专业库的深度集成提升了组件的专业性和稳定性

### 新增功能特性：
- **Chart图表组件**: 支持柱状图和折线图的数据可视化，包含交互式图表和主题定制
- **CodeBlock代码块组件**: 提供语法高亮、主题切换、行号显示、代码复制和折叠展开功能
- **LinkPreview链接预览组件**: 实现优雅的链接预览，包含安全导航和域名标识
- **StatsDisplay统计显示组件**: 支持多格式数字、趋势图表、对比分析和本地化显示
- **Terminal终端输出组件**: 提供ANSI转义、输出分栏、复制功能和折叠控制
- **OptionList选项列表组件**: 支持单选/多选的选项列表，包含动态验证和确认视图
- **QuestionFlow问题流程组件**: 实现步骤化的问题流程，支持渐进式和前置式交互
- **共享组件系统**: ActionButtons、useActionButtons和Schema Contract提供统一的基础功能
- **增强的工具UI**: 为复杂的工具调用提供更好的用户体验

### 未来发展方向：
- **更多工具类型支持**: 扩展支持更多专业领域的工具UI组件
- **自定义主题选项**: 提供更丰富的主题定制功能
- **批量工具操作**: 支持多个工具的批量执行和管理
- **高级交互模式**: 实现更复杂的用户交互和数据处理流程
- **性能进一步优化**: 深入优化大型数据集和复杂图表的渲染性能

本次更新反映了新增的富工具UI基础设施，体现了工具UI组件向更专业、更完善的工具发展，为OpenClaw项目提供了更加强大和灵活的工具调用可视化解决方案。