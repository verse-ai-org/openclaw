# HTML PPT Studio演示文稿技能

<cite>
**本文档引用的文件**
- [SKILL.md](file://skills/html-ppt-skill/SKILL.md)
- [runtime.js](file://skills/html-ppt-skill/assets/runtime.js)
- [base.css](file://skills/html-ppt-skill/assets/base.css)
- [animations.css](file://skills/html-ppt-skill/assets/animations/animations.css)
- [fx-runtime.js](file://skills/html-ppt-skill/assets/animations/fx-runtime.js)
- [confetti-cannon.js](file://skills/html-ppt-skill/assets/animations/fx/confetti-cannon.js)
- [themes.md](file://skills/html-ppt-skill/references/themes.md)
- [layouts.md](file://skills/html-ppt-skill/references/layouts.md)
- [new-deck.sh](file://skills/html-ppt-skill/scripts/new-deck.sh)
- [render.sh](file://skills/html-ppt-skill/scripts/render.sh)
- [demo-deck/index.html](file://skills/html-ppt-skill/examples/demo-deck/index.html)
- [presenter-mode-reveal/index.html](file://skills/html-ppt-skill/templates/full-decks/presenter-mode-reveal/index.html)
- [deck.html](file://skills/html-ppt-skill/templates/deck.html)
</cite>

## 更新摘要
**所做更改**
- 更新了资产管理和部署能力章节，反映新的自包含演示文稿生成机制
- 新增了脚本增强功能的详细说明
- 更新了演示者模式的部署能力和自包含特性
- 增强了PNG导出和渲染流程的描述

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构概览](#架构概览)
5. [详细组件分析](#详细组件分析)
6. [资产管理和部署能力](#资产管理和部署能力)
7. [依赖关系分析](#依赖关系分析)
8. [性能考虑](#性能考虑)
9. [故障排除指南](#故障排除指南)
10. [结论](#结论)

## 简介

HTML PPT Studio是一个专业的HTML演示文稿制作技能，允许用户创建美观、可交互的静态HTML演示文稿。该项目提供了36种主题、15个完整的演示文稿模板、31种布局和27种CSS动画效果，以及20种Canvas画布特效。

该技能的核心特点包括：
- **零构建需求**：纯静态HTML/CSS/JavaScript，仅使用CDN网络字体
- **主题系统**：基于CSS变量的令牌设计系统，支持主题切换
- **演示者模式**：内置演讲者视图，包含当前页预览、下一页预览、逐字稿和计时器
- **键盘导航**：完整的键盘快捷键支持，包括主题切换、动画演示等
- **PNG导出**：支持无头Chrome渲染为PNG图像

## 项目结构

HTML PPT Studio采用模块化的文件组织结构：

```mermaid
graph TB
subgraph "技能根目录"
A[SKILL.md] --> B[assets/]
A --> C[templates/]
A --> D[scripts/]
A --> E[examples/]
A --> F[references/]
end
subgraph "assets/"
B1[base.css] --> B2[runtime.js]
B1 --> B3[animations/]
B1 --> B4[themes/]
B3 --> B5[animations.css]
B3 --> B6[fx-runtime.js]
B3 --> B7[fx/]
B7 --> B8[confetti-cannon.js]
B7 --> B9[... 18个其他特效]
end
subgraph "templates/"
C1[full-decks/] --> C2[presenter-mode-reveal/]
C1 --> C3[tech-sharing/]
C1 --> C4[... 13个其他模板]
C5[single-page/] --> C6[cover.html]
C5 --> C7[bullets.html]
C5 --> C8[... 30个其他布局]
end
subgraph "scripts/"
D1[new-deck.sh] --> D2[渲染PNG]
D2 --> D3[render.sh]
end
```

**图表来源**
- [SKILL.md:165-192](file://skills/html-ppt-skill/SKILL.md#L165-L192)

**章节来源**
- [SKILL.md:165-192](file://skills/html-ppt-skill/SKILL.md#L165-L192)

## 核心组件

### 主题系统 (Theme System)

HTML PPT Studio使用基于CSS变量的令牌系统，每个主题都是一个简短的CSS文件，覆盖`assets/base.css`中定义的`:root`块中的变量。

**主题分类**：
- **明亮与平静**：minimal-white、editorial-serif、soft-pastel等
- **大胆声明**：sharp-mono、neo-brutalism、bauhaus等  
- **酷感深色**：catppuccin-mocha、dracula、tokyo-night等
- **温暖活力**：sunset-warm等
- **特效丰富**：glassmorphism、aurora、rainbow-gradient等

**章节来源**
- [themes.md:1-108](file://skills/html-ppt-skill/references/themes.md#L1-L108)

### 动画系统 (Animation System)

系统提供两种类型的动画：

1. **CSS动画**（27种）：通过`data-anim`属性或`class="anim-<name>"`应用
2. **Canvas特效**（20种）：通过`data-fx`属性应用，需要额外的运行时管理

**CSS动画示例**：
- 方向性淡入：fade-up、fade-down、fade-left、fade-right
- 特效动画：rise-in、zoom-pop、neon-glow、typewriter
- 3D效果：card-flip-3d、cube-rotate-3d、page-turn-3d

**章节来源**
- [animations.css:1-139](file://skills/html-ppt-skill/assets/animations/animations.css#L1-L139)

### 演示者模式 (Presenter Mode)

这是HTML PPT Studio最具特色的功能，提供演讲者专用视图：

```mermaid
sequenceDiagram
participant Audience as "观众视图"
participant Runtime as "runtime.js"
participant Popup as "演讲者弹窗"
participant Preview as "预览iframe"
Audience->>Runtime : 按下 S 键
Runtime->>Popup : 创建新窗口
Popup->>Preview : 加载当前页预览
Popup->>Preview : 加载下一页预览
Popup->>Popup : 显示逐字稿区域
Popup->>Popup : 显示计时器
Audience->>Runtime : 导航到新页面
Runtime->>Popup : postMessage({type : 'preview-goto', idx : N})
Popup->>Preview : 同步更新预览
Popup->>Runtime : 监听广播消息
```

**图表来源**
- [runtime.js:17-200](file://skills/html-ppt-skill/assets/runtime.js#L17-L200)

**章节来源**
- [runtime.js:17-200](file://skills/html-ppt-skill/assets/runtime.js#L17-L200)

## 架构概览

HTML PPT Studio采用分层架构设计，确保主题、布局和动画的解耦：

```mermaid
graph TB
subgraph "用户界面层"
UI[演示文稿HTML]
UI --> NAV[导航控件]
UI --> NOTES[备注抽屉]
UI --> OVERVIEW[概览网格]
end
subgraph "运行时层"
RT[runtime.js]
RT --> NAV
RT --> NOTES
RT --> OVERVIEW
RT --> PM[演示者模式]
end
subgraph "样式层"
BASE[base.css - 基础令牌]
THEME[themes/*.css - 主题覆盖]
ANIM[animations.css - 动画]
STYLE[组合样式]
end
subgraph "特效层"
FXRT[fx-runtime.js]
FXRT --> CANVAS[Canvas特效]
CANVAS --> UTIL[_util.js]
CANVAS --> SPECIFIC[特定特效]
end
subgraph "工具层"
NEW[new-deck.sh]
RENDER[render.sh]
THEME --> STYLE
ANIM --> STYLE
BASE --> STYLE
RT --> UI
FXRT --> CANVAS
end
UI --> RT
STYLE --> UI
CANVAS --> UI
NEW --> UI
RENDER --> UI
```

**图表来源**
- [base.css:1-151](file://skills/html-ppt-skill/assets/base.css#L1-L151)
- [runtime.js:17-200](file://skills/html-ppt-skill/assets/runtime.js#L17-L200)
- [fx-runtime.js:1-100](file://skills/html-ppt-skill/assets/animations/fx-runtime.js#L1-L100)

## 详细组件分析

### 基础样式系统 (Base Styles)

基础样式系统定义了完整的CSS变量令牌系统：

```mermaid
classDiagram
class BaseTokens {
+--bg : 背景色
+--text-1/2/3 : 文本色彩
+--accent : 强调色
+--surface : 表面色
+--radius : 圆角半径
+--shadow : 阴影效果
+--font-* : 字体系列
+--grad : 渐变定义
}
class ThemeOverride {
+继承 BaseTokens
+覆盖特定变量
+保持一致性
}
class LayoutPrimitives {
+deck : 演示容器
+slide : 幻灯片
+card : 卡片组件
+grid : 网格系统
+stack : 垂直间距
}
class Typography {
+eyebrow : 小标题
+kicker : 强调词
+h1/h2/h3 : 标题层级
+lede : 副标题
+mono : 等宽字体
+serif : 衬线字体
}
BaseTokens <|-- ThemeOverride
BaseTokens --> LayoutPrimitives
BaseTokens --> Typography
```

**图表来源**
- [base.css:1-151](file://skills/html-ppt-skill/assets/base.css#L1-L151)

**章节来源**
- [base.css:1-151](file://skills/html-ppt-skill/assets/base.css#L1-L151)

### Canvas特效系统 (Canvas FX System)

Canvas特效系统提供了丰富的视觉效果，通过动态加载机制实现：

```mermaid
flowchart TD
Start([特效初始化]) --> LoadModules["加载FX模块列表"]
LoadModules --> DynamicLoad["动态加载脚本"]
DynamicLoad --> InitElements["初始化[data-fx]元素"]
InitElements --> ActiveCheck{"元素是否激活?"}
ActiveCheck --> |是| CreateEffect["创建特效实例"]
ActiveCheck --> |否| WaitEvent["等待事件"]
CreateEffect --> AnimationLoop["启动动画循环"]
AnimationLoop --> UpdateParticles["更新粒子状态"]
UpdateParticles --> RenderFrame["渲染帧"]
RenderFrame --> CheckLife["检查生命周期"]
CheckLife --> |存活| UpdateParticles
CheckLife --> |结束| Cleanup["清理资源"]
Cleanup --> WaitEvent
WaitEvent --> ActiveCheck
```

**图表来源**
- [fx-runtime.js:1-100](file://skills/html-ppt-skill/assets/animations/fx-runtime.js#L1-L100)

**章节来源**
- [fx-runtime.js:1-100](file://skills/html-ppt-skill/assets/animations/fx-runtime.js#L1-L100)

### 演示者模式实现

演示者模式通过以下组件协同工作：

```mermaid
graph LR
subgraph "演示者窗口"
CURRENT[当前页预览]
NEXT[下一页预览]
SCRIPT[逐字稿区域]
TIMER[计时器]
end
subgraph "广播通信"
BC[BroadcastChannel]
BC --> CURRENT
BC --> NEXT
BC --> SCRIPT
BC --> TIMER
end
subgraph "本地存储"
LS[localStorage]
LS --> CURRENT
LS --> NEXT
LS --> SCRIPT
LS --> TIMER
end
subgraph "像素完美预览"
IF[iframe预览]
IF --> CURRENT
IF --> NEXT
IF --> SCRIPT
IF --> TIMER
end
CURRENT -.->|postMessage| NEXT
SCRIPT -.->|同步| CURRENT
TIMER -.->|控制| CURRENT
```

**图表来源**
- [runtime.js:111-200](file://skills/html-ppt-skill/assets/runtime.js#L111-L200)

**章节来源**
- [runtime.js:111-200](file://skills/html-ppt-skill/assets/runtime.js#L111-L200)

### 模板系统 (Template System)

HTML PPT Studio提供了15个完整的演示文稿模板，每个模板都是自包含的：

**模板类型**：
- **技术分享**：`tech-sharing/` - 适合技术演讲
- **产品发布**：`product-launch/` - 适合新产品介绍
- **演示者模式**：`presenter-mode-reveal/` - 专为演讲者设计
- **课程模块**：`course-module/` - 适合教育培训
- **周报**：`weekly-report/` - 适合团队汇报

**章节来源**
- [presenter-mode-reveal/index.html:1-188](file://skills/html-ppt-skill/templates/full-decks/presenter-mode-reveal/index.html#L1-L188)

## 资产管理和部署能力

### 自包含演示文稿生成

HTML PPT Studio的最新更新实现了真正自包含的演示文稿生成能力。新的`new-deck.sh`脚本不仅复制资产文件，还智能重写模板路径，确保生成的演示文稿完全独立。

**核心功能**：
- **资产复制**：自动复制`assets/`目录到新项目
- **路径重写**：将模板中的相对路径转换为本地相对路径
- **自包含输出**：生成的HTML文件不再依赖外部资源

**更新**：新增的资产管理和部署能力显著提升了演示文稿的便携性和独立性

**章节来源**
- [new-deck.sh:1-85](file://skills/html-ppt-skill/scripts/new-deck.sh#L1-L85)

### 脚本增强功能

#### new-deck.sh 脚本改进

新的脚本实现了更智能的资产管理和路径处理：

```mermaid
flowchart TD
Start([执行 new-deck.sh]) --> CheckArgs["检查参数"]
CheckArgs --> GetTemplate["获取模板路径"]
GetTemplate --> CopyAssets["复制 assets/ 目录"]
CopyAssets --> RewritePaths["重写模板路径"]
RewritePaths --> GenerateDeck["生成自包含HTML"]
GenerateDeck --> OutputSuccess["输出成功信息"]
OutputSuccess --> NextSteps["显示下一步操作"]
```

**图表来源**
- [new-deck.sh:60-75](file://skills/html-ppt-skill/scripts/new-deck.sh#L60-L75)

#### render.sh 脚本优化

渲染脚本现在支持更灵活的输出配置：

- **自动幻灯片计数**：支持`all`参数自动检测幻灯片数量
- **自定义输出目录**：支持指定自定义输出目录
- **跨平台兼容**：改进了Windows和macOS的路径处理

**章节来源**
- [render.sh:1-96](file://skills/html-ppt-skill/scripts/render.sh#L1-L96)

### 演示者模式部署增强

演示者模式现在支持更好的部署和共享能力：

- **独立窗口管理**：每个演示者窗口独立管理，支持多显示器环境
- **主题同步**：演示者窗口和观众窗口之间的主题同步机制
- **布局持久化**：卡片布局和尺寸自动保存到localStorage

**章节来源**
- [runtime.js:223-265](file://skills/html-ppt-skill/assets/runtime.js#L223-L265)

## 依赖关系分析

HTML PPT Studio的依赖关系相对简单，主要依赖关系如下：

```mermaid
graph TD
subgraph "外部依赖"
CDN[CDN网络字体]
CHART[Chart.js 4.4.3]
end
subgraph "内部模块"
RUNTIME[runtime.js]
BASE[base.css]
ANIM[animations.css]
FXRT[fx-runtime.js]
THEMES[themes/*.css]
LAYOUTS[templates/single-page/*.html]
TEMPLATES[templates/full-decks/*]
end
subgraph "工具脚本"
NEWDECK[new-deck.sh]
RENDER[render.sh]
ENDDECK[自包含演示文稿]
ENDRENDER[PNG导出]
end
RUNTIME --> BASE
RUNTIME --> ANIM
RUNTIME --> THEMES
RUNTIME --> FXRT
FXRT --> THEMES
FXRT --> BASE
NEWDECK --> TEMPLATES
NEWDECK --> THEMES
NEWDECK --> ANIM
RENDER --> RUNTIME
RENDER --> CDN
LAYOUTS --> BASE
LAYOUTS --> ANIM
LAYOUTS --> THEMES
TEMPLATES --> LAYOUTS
TEMPLATES --> RUNTIME
NEWDECK --> ENDDECK
ENDRENDER --> ENDDECK
```

**图表来源**
- [demo-deck/index.html:1-162](file://skills/html-ppt-skill/examples/demo-deck/index.html#L1-L162)
- [new-deck.sh:1-94](file://skills/html-ppt-skill/scripts/new-deck.sh#L1-L94)
- [render.sh:1-96](file://skills/html-ppt-skill/scripts/render.sh#L1-L96)

**章节来源**
- [demo-deck/index.html:1-162](file://skills/html-ppt-skill/examples/demo-deck/index.html#L1-L162)
- [new-deck.sh:1-94](file://skills/html-ppt-skill/scripts/new-deck.sh#L1-L94)
- [render.sh:1-96](file://skills/html-ppt-skill/scripts/render.sh#L1-L96)

## 性能考虑

### 加载优化

1. **延迟加载**：Canvas特效采用动态加载机制，只在需要时加载
2. **缓存策略**：主题CSS文件可以被浏览器缓存
3. **最小化依赖**：除了必要的CDN字体和Chart.js外，尽量减少外部依赖

### 运行时优化

1. **MutationObserver**：监听DOM变化，只在必要时重新初始化特效
2. **生命周期管理**：特效在幻灯片离开时自动清理，避免内存泄漏
3. **动画优化**：CSS动画使用硬件加速，Canvas动画使用requestAnimationFrame

### 渲染优化

1. **无头Chrome渲染**：使用虚拟时间预算限制渲染时间
2. **批量处理**：PNG导出时批量处理多个幻灯片
3. **路径优化**：生成相对路径，减少文件大小

## 故障排除指南

### 常见问题及解决方案

**问题1：主题切换无效**
- 检查`<body>`或`<html>`标签是否包含`data-themes`属性
- 确认`data-theme-base`指向正确的主题目录
- 验证主题CSS文件是否存在

**问题2：Canvas特效不显示**
- 确认`<script src="../../../assets/animations/fx-runtime.js"></script>`已正确引入
- 检查`data-fx`属性是否正确设置
- 验证浏览器是否支持Canvas

**问题3：演示者模式无法同步**
- 检查浏览器是否支持BroadcastChannel API
- 确认两个窗口在同一域名下
- 验证localStorage是否可用

**问题4：PNG导出失败**
- 确认Google Chrome已安装在默认位置
- 检查HTML文件路径是否正确
- 验证是否有足够的磁盘空间

**问题5：自包含演示文稿无法加载资产**
- 确认`assets/`目录已正确复制到输出目录
- 检查生成的HTML文件中的相对路径是否正确
- 验证文件权限和路径分隔符

**章节来源**
- [runtime.js:111-200](file://skills/html-ppt-skill/assets/runtime.js#L111-L200)
- [render.sh:14-18](file://skills/html-ppt-skill/scripts/render.sh#L14-L18)

## 结论

HTML PPT Studio是一个功能强大且设计精良的演示文稿制作技能。其核心优势包括：

1. **设计理念先进**：基于CSS变量的令牌系统，实现了真正的主题可定制性
2. **用户体验优秀**：完整的键盘导航、演示者模式和实时预览
3. **扩展性强**：模块化设计，易于添加新的主题、布局和特效
4. **性能优化**：合理的资源管理和渲染优化

**最新更新亮点**：
- **自包含演示文稿生成**：通过增强的脚本实现真正的自包含演示文稿
- **资产管理和部署能力**：提升了演示文稿的便携性和独立性
- **演示者模式增强**：改进了部署和共享能力

该技能特别适合需要高质量演示文稿的技术团队和内容创作者，能够显著提高演示文稿制作效率和质量。通过其丰富的模板系统和特效库，用户可以快速创建专业级的演示文稿，满足各种场合的需求。