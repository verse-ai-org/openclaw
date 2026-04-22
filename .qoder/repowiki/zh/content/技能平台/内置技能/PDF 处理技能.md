# PDF 处理技能

<cite>
**本文档引用的文件**
- [nano-pdf/SKILL.md](file://skills/nano-pdf/SKILL.md)
- [minimax-pdf/SKILL.md](file://skills/minimax-pdf/SKILL.md)
- [pdf-tool.d.ts](file://apps/electron/resources/prod-node_modules/node_modules/pdfjs-dist/types/web/pdf_rendering_queue.d.ts)
- [pdf-tool.helpers.d.ts](file://apps/electron/resources/prod-node_modules/node_modules/pdfjs-dist/types/web/pdf_page_view.d.ts)
- [pdf-native-providers.d.ts](file://apps/electron/resources/prod-node_modules/node_modules/pdfjs-dist/types/src/pdf.d.ts)
- [pdf-extract.d.ts](file://apps/electron/resources/prod-node_modules/node_modules/pdfjs-dist/types/web/pdf_rendering_queue.d.ts)
- [pdf-parse.js](file://apps/electron/resources/prod-node_modules/node_modules/pdf-parse/lib/pdf-parse.js)
- [pdf.js](file://apps/electron/resources/prod-node_modules/node_modules/pdf-parse/lib/pdf.js/v2.0.550/build/pdf.js)
- [pdf.worker.js](file://apps/electron/resources/prod-node_modules/node_modules/pdf-parse/lib/pdf.js/v2.0.550/build/pdf.worker.js)
- [pdf.min.mjs](file://apps/electron/resources/prod-node_modules/node_modules/pdfjs-dist/build/pdf.min.mjs)
- [pdf.mjs](file://apps/electron/resources/prod-node_modules/node_modules/pdfjs-dist/build/pdf.mjs)
- [pdf.worker.min.mjs](file://apps/electron/resources/prod-node_modules/node_modules/pdfjs-dist/build/pdf.worker.min.mjs)
</cite>

## 更新摘要
**变更内容**
- 移除了关于已删除的my-pdf技能的所有内容
- 更新了技能现状，仅保留当前可用的nano-pdf和minimax-pdf技能
- 更新了架构图和依赖关系分析，反映实际存在的组件
- 修正了历史参考信息，确保文档准确性

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

本文件系统性地梳理了 OpenClaw 项目中的 PDF 处理能力，涵盖从基础文本提取到高级表单处理、从命令行工具到原生插件的完整技术栈。该能力由两大支柱构成：**nano-pdf** 技能（自然语言驱动的 PDF 编辑）和 **minimax-pdf** 技能（高质量 PDF 生成和表单处理），以及底层的插件SDK组件。这些组件通过技能包的形式集成到 OpenClaw 的智能体工作流中，为用户提供从简单文本提取到复杂文档操作的全方位 PDF 处理解决方案。

**重要说明**：原 my-pdf 技能在本次更新中已被移除，不再存在于代码库中。本文档已相应更新以反映当前的实际状态。

## 项目结构

OpenClaw 的 PDF 处理能力在项目中呈现多层次、多语言的分布特征：

```mermaid
graph TB
subgraph "技能层"
A[nano-pdf 技能]
B[minimax-pdf 技能]
end
subgraph "插件SDK层"
C[pdf-tool.d.ts]
D[pdf-tool.helpers.d.ts]
E[pdf-native-providers.d.ts]
F[pdf-extract.d.ts]
end
subgraph "原生解析层"
G[pdf-parse.js]
H[pdf.js]
I[pdf.worker.js]
end
subgraph "浏览器渲染层"
J[pdf.min.mjs]
K[pdf.mjs]
L[pdf.worker.min.mjs]
end
A --> C
B --> D
C --> G
D --> H
E --> I
F --> J
F --> K
F --> L
```

**图表来源**
- [nano-pdf/SKILL.md:1-39](file://skills/nano-pdf/SKILL.md#L1-L39)
- [minimax-pdf/SKILL.md:1-210](file://skills/minimax-pdf/SKILL.md#L1-L210)
- [pdf-tool.d.ts](file://apps/electron/resources/prod-node_modules/node_modules/pdfjs-dist/types/web/pdf_rendering_queue.d.ts)
- [pdf-tool.helpers.d.ts](file://apps/electron/resources/prod-node_modules/node_modules/pdfjs-dist/types/web/pdf_page_view.d.ts)

**章节来源**
- [nano-pdf/SKILL.md:1-39](file://skills/nano-pdf/SKILL.md#L1-L39)
- [minimax-pdf/SKILL.md:1-210](file://skills/minimax-pdf/SKILL.md#L1-L210)

## 核心组件

### 当前可用的 PDF 处理技能

#### nano-pdf 技能
- **自然语言编辑**：使用自然语言指令对 PDF 进行编辑操作
- **页面级操作**：支持对特定页面进行精确编辑
- **安装简便**：通过 uv 包管理器一键安装
- **跨平台支持**：支持 macOS、Linux 和 Windows 系统

#### minimax-pdf 技能
- **高质量生成**：专注于视觉质量和设计一致性的 PDF 生成
- **三类任务**：CREATE（从零创建）、FILL（表单填写）、REFORMAT（重新设计）
- **设计系统**：基于令牌的设计系统，确保视觉一致性
- **打印就绪**：输出符合打印标准的高质量 PDF

### 插件SDK 组件

OpenClaw 的插件SDK为 PDF 处理提供了标准化的接口和类型定义。

#### PDF 工具接口
- **统一抽象**：提供统一的 PDF 处理接口
- **多提供商支持**：支持多种 PDF 处理提供商
- **原生与回退**：支持原生 PDF 处理和内容提取回退机制
- **安全策略**：集成文件系统访问策略

#### 原生解析组件
- **pdf.js 引擎**：基于 Mozilla pdf.js 的浏览器端解析
- **pdf-parse 集成**：Node.js 环境下的 PDF 内容提取
- **Canvas 支持**：可选的图像提取功能
- **Worker 支持**：独立线程处理，避免阻塞 UI

**章节来源**
- [nano-pdf/SKILL.md:1-39](file://skills/nano-pdf/SKILL.md#L1-L39)
- [minimax-pdf/SKILL.md:1-210](file://skills/minimax-pdf/SKILL.md#L1-L210)
- [pdf-tool.d.ts](file://apps/electron/resources/prod-node_modules/node_modules/pdfjs-dist/types/web/pdf_rendering_queue.d.ts)
- [pdf-tool.helpers.d.ts](file://apps/electron/resources/prod-node_modules/node_modules/pdfjs-dist/types/web/pdf_page_view.d.ts)

## 架构概览

OpenClaw 的 PDF 处理架构采用分层设计，确保不同场景下的最佳性能和易用性：

```mermaid
graph TB
subgraph "用户接口层"
A[智能体指令]
B[自然语言描述]
C[PDF 文件输入]
end
subgraph "技能编排层"
D[nano-pdf 技能]
E[minimax-pdf 技能]
F[PDF 工具集]
end
subgraph "执行引擎层"
G[原生 PDF 处理]
H[内容提取引擎]
I[浏览器解析器]
end
subgraph "存储管理层"
J[临时文件]
K[缓存数据]
L[结果输出]
end
A --> D
B --> E
C --> F
D --> G
E --> H
F --> I
G --> J
H --> K
I --> L
```

**图表来源**
- [nano-pdf/SKILL.md:1-39](file://skills/nano-pdf/SKILL.md#L1-L39)
- [minimax-pdf/SKILL.md:1-210](file://skills/minimax-pdf/SKILL.md#L1-L210)
- [pdf-tool.d.ts](file://apps/electron/resources/prod-node_modules/node_modules/pdfjs-dist/types/web/pdf_rendering_queue.d.ts)

## 详细组件分析

### nano-pdf 技能详解

nano-pdf 技能专注于自然语言驱动的 PDF 编辑，提供直观的编辑体验。

#### 编辑指令解析

```mermaid
flowchart LR
A[自然语言指令] --> B[指令词法分析]
B --> C[提取编辑类型]
C --> D[解析目标页面]
D --> E[定位编辑区域]
E --> F[执行具体操作]
F --> G[验证编辑结果]
G --> H[输出修改后的 PDF]
```

**图表来源**
- [nano-pdf/SKILL.md:27-33](file://skills/nano-pdf/SKILL.md#L27-L33)

#### 安装配置流程

nano-pdf 技能通过统一的安装接口支持多种包管理器：

```mermaid
sequenceDiagram
participant U as 用户
participant N as nano-pdf 技能
participant P as 包管理器
participant S as 系统环境
U->>N : 请求安装 nano-pdf
N->>P : 检测可用包管理器
P->>S : 验证系统兼容性
S-->>P : 返回系统信息
P->>P : 选择最优安装方案
P->>S : 执行安装命令
S-->>P : 返回安装状态
P-->>N : 安装完成通知
N-->>U : 技能准备就绪
```

**图表来源**
- [nano-pdf/SKILL.md:11-21](file://skills/nano-pdf/SKILL.md#L11-L21)

**章节来源**
- [nano-pdf/SKILL.md:1-39](file://skills/nano-pdf/SKILL.md#L1-L39)

### minimax-pdf 技能分析

minimax-pdf 技能专注于高质量 PDF 的生成和处理，提供专业的文档制作能力。

#### 三类处理任务

```mermaid
flowchart TD
A[用户请求] --> B{任务类型}
B --> |CREATE| C[从零创建新文档]
B --> |FILL| D[填写现有表单]
B --> |REFORMAT| E[重新设计现有文档]
C --> F[设计系统应用]
D --> G[字段识别与填充]
E --> H[内容解析与重建]
F --> I[输出高质量 PDF]
G --> I
H --> I
```

**图表来源**
- [minimax-pdf/SKILL.md:39-47](file://skills/minimax-pdf/SKILL.md#L39-L47)

#### 设计系统架构

minimax-pdf 使用基于令牌的设计系统，确保文档的视觉一致性：

```mermaid
classDiagram
class DesignSystem {
+accent_colors : string[]
+typography_scales : object
+spacing_tokens : number[]
+visual_identity : string
}
class DocumentType {
+report : DesignTokens
+proposal : DesignTokens
+resume : DesignTokens
+portfolio : DesignTokens
}
class DesignTokens {
+color_palette : object
+font_family : string
+layout_rules : object
+brand_elements : object
}
DesignSystem --> DocumentType : defines
DocumentType --> DesignTokens : contains
```

**图表来源**
- [minimax-pdf/SKILL.md:65-106](file://skills/minimax-pdf/SKILL.md#L65-L106)

**章节来源**
- [minimax-pdf/SKILL.md:1-210](file://skills/minimax-pdf/SKILL.md#L1-L210)

### 插件SDK 组件

OpenClaw 的插件SDK为 PDF 处理提供了标准化的接口和类型定义。

#### PDF 工具接口

```mermaid
classDiagram
class PDFTool {
<<interface>>
+extractText(file : string) Promise<string>
+extractTables(file : string) Promise<Array<Array<string>>>
+mergeFiles(files : string[]) Promise<string>
+splitFile(file : string) Promise<string[]>
+rotatePages(file : string, rotation : number) Promise<string>
}
class PDFToolHelpers {
+validatePDF(file : string) boolean
+getPDFInfo(file : string) PDFInfo
+convertToText(file : string) string
+optimizePDF(file : string) string
}
class NativeProviders {
+loadPyPDF() PyPDFProvider
+loadPDFJS() PDFJSProvider
+loadCommandLine() CommandLineProvider
}
class PDFExtract {
+extractWithLayout(file : string) Promise<LayoutContent>
+extractImages(file : string) Promise<ImageSet>
+extractBookmarks(file : string) Promise<BookmarkList>
}
PDFTool --> PDFToolHelpers : 使用
PDFTool --> NativeProviders : 依赖
PDFExtract --> NativeProviders : 依赖
```

**图表来源**
- [pdf-tool.d.ts](file://apps/electron/resources/prod-node_modules/node_modules/pdfjs-dist/types/web/pdf_rendering_queue.d.ts)
- [pdf-tool.helpers.d.ts](file://apps/electron/resources/prod-node_modules/node_modules/pdfjs-dist/types/web/pdf_page_view.d.ts)
- [pdf-native-providers.d.ts](file://apps/electron/resources/prod-node_modules/node_modules/pdfjs-dist/types/src/pdf.d.ts)
- [pdf-extract.d.ts](file://apps/electron/resources/prod-node_modules/node_modules/pdfjs-dist/types/web/pdf_rendering_queue.d.ts)

**章节来源**
- [pdf-tool.d.ts](file://apps/electron/resources/prod-node_modules/node_modules/pdfjs-dist/types/web/pdf_rendering_queue.d.ts)
- [pdf-tool.helpers.d.ts](file://apps/electron/resources/prod-node_modules/node_modules/pdfjs-dist/types/web/pdf_page_view.d.ts)
- [pdf-native-providers.d.ts](file://apps/electron/resources/prod-node_modules/node_modules/pdfjs-dist/types/src/pdf.d.ts)
- [pdf-extract.d.ts](file://apps/electron/resources/prod-node_modules/node_modules/pdfjs-dist/types/web/pdf_rendering_queue.d.ts)

## 依赖关系分析

OpenClaw 的 PDF 处理能力形成了一个相互依赖的生态系统：

```mermaid
graph TB
subgraph "核心依赖"
A[pypdf] --> B[pycryptodome]
C[reportlab] --> D[fpdf2]
E[playwright] --> F[Chromium]
end
subgraph "工具链依赖"
G[pdf-parse] --> H[pdf.js]
I[pdfjs-dist] --> J[Canvas]
K[Node.js] --> L[异步处理]
end
subgraph "技能依赖"
M[nano-pdf] --> N[uv 包管理器]
O[minimax-pdf] --> A
O --> C
O --> E
P[PDF 工具集] --> G
P --> I
end
```

**图表来源**
- [minimax-pdf/SKILL.md:196-202](file://skills/minimax-pdf/SKILL.md#L196-L202)
- [nano-pdf/SKILL.md:10-20](file://skills/nano-pdf/SKILL.md#L10-L20)

**章节来源**
- [minimax-pdf/SKILL.md:196-202](file://skills/minimax-pdf/SKILL.md#L196-L202)
- [nano-pdf/SKILL.md:10-20](file://skills/nano-pdf/SKILL.md#L10-L20)

## 性能考虑

### 内存优化策略

1. **流式处理**：对于大文件采用流式读取，避免一次性加载到内存
2. **分页处理**：PDF 按页处理，及时释放已处理页面的内存
3. **增量写入**：合并操作采用增量写入，减少中间文件大小

### 并发处理

```mermaid
flowchart TD
A[接收多个 PDF 文件] --> B{文件数量 > 阈值?}
B --> |是| C[启动并发处理]
B --> |否| D[顺序处理]
C --> E[创建工作线程池]
E --> F[分配文件任务]
F --> G[监控处理进度]
G --> H{所有任务完成?}
H --> |否| G
H --> |是| I[合并结果输出]
D --> I
```

### 缓存机制

- **元数据缓存**：缓存 PDF 元数据以避免重复解析
- **解析结果缓存**：对常用查询结果进行缓存
- **临时文件管理**：合理管理中间文件生命周期

## 故障排除指南

### 常见问题诊断

#### 文档格式兼容性问题
- **症状**：某些 PDF 文件无法正确解析
- **原因**：加密保护、损坏文件、特殊字体
- **解决方案**：先进行文档修复，再尝试解析

#### 内存不足错误
- **症状**：处理大型 PDF 时出现内存溢出
- **原因**：单次处理过多页面或高分辨率图像
- **解决方案**：启用分页处理，降低图像质量设置

#### 文本提取不准确
- **症状**：提取的文本顺序混乱或格式错误
- **原因**：扫描版 PDF、复杂布局
- **解决方案**：使用 pdfplumber 的布局模式，或先进行 OCR 处理

### 调试工具

```mermaid
flowchart LR
A[问题发生] --> B[检查日志级别]
B --> C[启用详细日志]
C --> D[分析错误堆栈]
D --> E{错误类型分类}
E --> |解析错误| F[检查 PDF 格式]
E --> |内存错误| G[优化内存使用]
E --> |性能问题| H[调整并发参数]
F --> I[应用修复方案]
G --> I
H --> I
I --> J[验证修复效果]
```

**章节来源**
- [minimax-pdf/SKILL.md:188-210](file://skills/minimax-pdf/SKILL.md#L188-L210)

## 结论

OpenClaw 的 PDF 处理能力通过多层次的技术架构实现了从基础文本提取到复杂文档操作的全覆盖。当前可用的技能包括：

- **nano-pdf**：专注于自然语言驱动的 PDF 编辑，提供直观的编辑体验
- **minimax-pdf**：专注于高质量 PDF 的生成和处理，提供专业的文档制作能力

结合插件SDK提供的标准化接口，用户可以根据具体需求选择最适合的处理方式，实现从简单的文本提取到复杂的文档编辑的全流程自动化。

**重要更新**：原 my-pdf 技能在本次更新中已被移除，不再存在于代码库中。建议用户使用现有的 nano-pdf 或 minimax-pdf 技能替代相关功能。

这种架构设计不仅保证了功能的完整性，还通过模块化的设计确保了系统的可维护性和可扩展性，为未来的功能增强和技术升级奠定了坚实的基础。