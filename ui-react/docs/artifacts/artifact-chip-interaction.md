# Artifact Chip 交互规范与实施计划

> **状态**：可执行 backlog（交互层，不绑定 `PROTOCOL_VERSION` 升级）  
> **受众**：`ui-react`、Electron 主进程、`apps/electron`  
> **前置**：[`artifacts-protocol-design.md`](./artifacts-protocol-design.md) Phase 1–2 已落地（`artifactRefs`、`ArtifactSummary`、`artifacts.download`）  
> **协议实施**：[`artifacts-protocol-implementation-plan.md`](./artifacts-protocol-implementation-plan.md)  
> **执行路线图**（阶段顺序、PR 拆分、逐步清单）：[`artifact-chip-implementation-plan.md`](./artifact-chip-implementation-plan.md)

## 背景与问题

当前 `ArtifactRefChip`（`ui-react/src/components/chat/ArtifactChip.tsx`）的交互仅由 **`renderType` + `download.mode`** 决定（`artifact-renderer-registry.ts`），**不区分**用户上传与助手产出，也不区分 Electron path-ref 与 Web base64。

### 现状摘要

| 场景 | `download.mode` | 当前 UI | 用户预期 |
|------|-----------------|---------|----------|
| 用户图片 | `bytes` | 内联缩略图 → 预览 | ✅ 已对齐 |
| 用户图片（仅 chip） | `bytes` | chip 点击 → 预览 | ✅ 已对齐 |
| 用户文档（Electron path-ref） | `unsupported` | **死 chip**，无任何操作 | 点击 → **在文件夹中显示**原文件 |
| 用户文档（Web base64） | `bytes` | 独立下载按钮；chip 不可点 | 点击 → **预览**（浏览器无「打开目录」语义） |
| 助手图片 | `bytes` | 内联 / chip 预览 | ✅ 已对齐 |
| 助手 PDF / 文本 / 文件 | `bytes` | 独立下载按钮；chip 不可点 | 点击 chip → **预览**；下载为次要操作 |
| 外链产物 | `url` | 外链图标 | ✅ 基本合理 |

### 核心差距

1. **主操作不在 chip 上**：非图片 `bytes` 产物把操作放在独立下载图标，chip 本体不可点。  
2. **Electron path-ref 完全不可用**：`unsupported` 时无按钮、无点击（体验最差）。  
3. **预览能力过窄**：`ArtifactPreviewDialog` 仅支持图片；PDF / 文本 / 音频未覆盖。  
4. **未使用已有协议字段**：`source`、`role`、`ingestChannel` 已在 `ArtifactSummary` 上，但交互 registry 未读取。

### 已知缺口（实施前阅读）

| ID | 缺口 | 影响 | 计划 |
|----|------|------|------|
| G1 | **Web 非图 base64 发送未接通** | `GatewayChatRuntimeProvider` 仅发图 base64；Web 文档 `missingPathFiles` 会 toast 失败；I1「用户 PDF 预览」在 Web 上 **无法端到端验证** | 单独 PR 或 I1 前置；见 §前置条件 |
| G2 | **刷新后 path-ref 无 reveal**（现状） | transcript 未持久化 path；summary 无 `localRevealPath` | **I3**：Gateway 写入 + history 投影 |
| G3 | **I4 前 agent 仍可能写原件** | 用户不知 attach 会触发就地编辑风险 | I1 帮助文案 / 设置项；I4 改默认 |
| G4 | **`LegacyAttachmentChip` 不可点** | 旧 history 无 `artifactRefs` | 协议 Phase 3 弃用；见 §边界 |
| G5 | **Control UI (`ui/`) 未对齐** | 多客户端 chip 行为分裂 | 协议计划 3.5 |

---

## 设计原则

1. **Chip 本体 = 主操作**：用户点文件名区域应触发最自然的下一步（预览 / 在文件夹中显示 / 打开外链）。  
2. **次要操作可收敛**：下载、外链保留为小图标或预览 Dialog 内动作，不抢主点击。  
3. **按来源分支，不按猜测**：用 wire 字段（`source`、`ingestChannel`、`download.mode`）+ 运行环境（Electron / Web）决策，禁止解析正文附录或 title 字符串。  
4. **`artifacts.download` 不代拉本地 path**（见协议设计 §12）；path-ref 的「在文件夹中显示」走 additive 字段 **`localRevealPath`**（transcript 持久化 + history 投影），**不**经 `artifacts.download`。  
5. **Additive 演进**：Phase I1 可零协议改动；path-ref 的 `localRevealPath` 在 **Phase I3（Gateway）** 落地；Web 客户端通过 capability **不接收** 该字段。

---

## 交互类型（目标契约）

在 `artifact-renderer-registry.ts` 中，将 `ArtifactChipInteraction` 扩展为：

```typescript
type ArtifactChipInteraction =
  | "preview-image"      // 图片 Dialog 预览
  | "preview-file"       // 非图片 Dialog / 新标签预览（PDF、文本、音频等）
  | "reveal-in-folder"   // Electron：shell.showItemInFolder
  | "open-url"           // 安全 URL 新标签打开
  | "download-file"      // 仅作次要操作（或 preview 不可用时的回退）
  | "none";              // 不可交互 + 可选 tooltip 说明
```

### 主 / 次操作

| 层级 | 控件 | 职责 |
|------|------|------|
| **主** | `ArtifactChip` 本体（可点击时） | 上表 `ArtifactChipInteraction` 中除 `download-file` / `none` 外的动作 |
| **次** | 小图标按钮（可选） | `download-file`、`open-url`（当主操作已是 preview 时，下载降为次要） |
| **内联** | `InlineInboundImages` | 用户 / 助手图片；点击缩略图 → `preview-image`（保持现状） |

---

## 决策矩阵（目标行为）

解析顺序：**legacy 合成 id → `download.mode` → `source` / `ingestChannel` → 平台 → MIME**。

### 用户消息（`role: input` / `source: user-upload`）

| `ingestChannel` | 环境 | `download.mode` | MIME | 主点击（chip） | 次操作 |
|-----------------|------|-----------------|------|----------------|--------|
| `managed-image` / 内联图 | 任意 | `bytes` | `image/*` | 内联预览（不进 chip 行） | — |
| `inline-base64` | 任意 | `bytes` | `image/*` | `preview-image` | — |
| `inline-base64` | Web | `bytes` | 非图（PDF 等） | `preview-file` | 下载图标 |
| `inline-base64` | Electron | `bytes` | 非图 | `preview-file` | 下载图标 |
| `path-ref` | Electron | `unsupported` | 非图 | `reveal-in-folder`（`summary.localRevealPath`） | 无下载（文件未过 Gateway） |
| `path-ref` | Electron | `unsupported` | 非图，**无 `localRevealPath`**（旧消息 / 换机） | `none` + 弱提示 | — |
| `path-ref` | Web | — | — | **不应出现**（Web 文档走 base64） | — |
| 任意 | 任意 | `url` | 任意 | `open-url` | — |
| 任意 | 任意 | `unsupported`（非 path-ref） | 任意 | `none` | — |

### 助手消息（`role: output` / `source: assistant-output` | `tool-output`）

| `download.mode` | MIME | 主点击（chip） | 次操作 |
|-----------------|------|----------------|--------|
| `bytes` | `image/*` | 内联或 `preview-image` | — |
| `bytes` | 可预览 MIME（见下表） | `preview-file` | 下载图标 |
| `bytes` | 不可预览（Office、二进制等） | `download-file`（chip 也可触发下载，见 UI 规范） | — |
| `url` | 任意 | `open-url` | — |
| `unsupported` | 任意 | `none` | — |

### 可预览 MIME（Phase I1 范围）

| 类别 | MIME / 扩展名 | 预览方式 |
|------|---------------|----------|
| 图片 | `image/*` | 现有 `<img>` |
| PDF | `application/pdf` | `<iframe>` + blob URL |
| 纯文本 | `text/*`、`application/json`、`application/xml` | `<pre>` 或等宽滚动区（UTF-8 解码） |
| Markdown | `text/markdown` | Phase I1：`<pre>`；Phase I2 可选轻量 MD |
| 音频 | `audio/*` | `<audio controls>` |
| **Phase I1 外** | Office、video、archive | 回退 `download-file` |

### 按场景选择预览路径（PDF 重点）

| 场景 | 字节来源 | 推荐主路径 | 不推荐 |
|------|----------|------------|--------|
| 助手 PDF | `artifacts.download` → base64 | Dialog + **blob URL + iframe** | 经 Gateway 再抽文本（`pdf-parse` 仅文本，无版面） |
| Web 用户 PDF（base64） | 同上 | 同上 | — |
| Electron 用户 PDF（path-ref） | **无 bytes**（`unsupported`） | **`shell.openPath`** 或 `showItemInFolder`（I2） | Dialog iframe（拿不到 bytes）；`artifacts.download` |
| 预览失败 / 超大 PDF | — | `saveArtifactBytes` 下载 | 反复重试 iframe |

**仓库现状**：`ui-react` 与 Electron UI **尚无** PDF 预览；`pdf-parse` / `pdfjs-dist` 仅在 Gateway 打包运行时用于 **文本抽取**（`src/gateway/server-methods/profile.ts`），**不**用于聊天预览。

---

## 文件预览实现（PDF / 文本 / 音频）

### 推荐主方案：`artifacts.download` → Blob → Dialog

Web 与 Electron **共用**一条管线（与图片预览一致），不新增 `ui-react` 依赖。

```text
chip 主点击 (preview-file)
  → artifact-cache 命中？复用 base64
  → 否则 artifacts.download RPC
  → base64 → Uint8Array → Blob(mimeType)
  → URL.createObjectURL(blob)
  → ArtifactPreviewDialog 按 mimeType 分支渲染
  → onOpenChange(false) → URL.revokeObjectURL(blobUrl)
```

建议抽出小模块（实施时命名参考）：

| 模块 | 职责 |
|------|------|
| `artifact-preview-bytes.ts` | `base64ToBlob`、`createPreviewObjectUrl`、`revokePreviewObjectUrl` |
| `artifact-preview-mime.ts` | `isPreviewableMime(mime, sizeBytes?)`、`previewKind: image \| pdf \| text \| audio \| none` |
| `artifact-preview-content.tsx` | Dialog 内按 `previewKind` 渲染 |

### PDF：`iframe` + blob URL（Phase I1 默认）

Electron `BrowserWindow` 基于 Chromium，**内置 PDF 插件**；在 Dialog 内嵌 iframe 即可，**无需** Electron 专有 PDF IPC。

```tsx
// 形状参考（非最终实现）
<iframe
  src={blobUrl}
  title={title}
  className="h-[min(80vh,48rem)] w-full rounded-md border-0"
/>
```

**优点**：实现快、与 Web 同码、缩放/滚动由 Chromium PDF 查看器提供。  
**缺点**：大 PDF 占内存；自定义翻页 UI 弱于 pdf.js。

#### Electron CSP 补丁（实施 I1 时必做）

`apps/electron/src/main/window.ts` 的 `configureSession` 当前有 `img-src blob:`，但 **未** 声明 `frame-src`。iframe 加载 `blob:` PDF 可能被 `default-src` 拦截。

在 CSP 拼接中增加（与现有 loopback / `file:` 同源策略一致）：

```text
frame-src 'self' blob: file: http://127.0.0.1:${port} ...
```

| 环境 | CSP | 预期 |
|------|-----|------|
| `pnpm dev`（浏览器） | 无 Electron 注入 | iframe + blob 通常直接可用 |
| Electron 打包 / 静态服务 | 需 `frame-src blob:` | 合入后 Dialog 内 PDF 可显示 |

**验收**：Electron 内助手 PDF chip → Dialog 内可见 PDF 内容（非空白 iframe）。

### 备选方案（非 Phase I1 默认）

| 方案 | 适用 | 说明 |
|------|------|------|
| **pdf.js / react-pdf** | iframe 实测失败；需统一非 Chromium；要强定制 UI | 仓库根依赖有 `pdfjs-dist`（Gateway），`ui-react` **未**引用；bundle 与 worker 成本高 |
| **`shell.openPath`**（Electron） | path-ref 用户 PDF；iframe 失败回退 | `electron.shell.openPath(absolutePath)` → 系统默认应用（macOS「预览」） |
| **`<webview>` / 新 BrowserWindow** | — | 安全面复杂，**不**优先 |
| **Gateway `pdf-parse` 文本** | — | 仅纯文本，**不能**替代版面预览 |

### 大文件与回退（D5）

| 条件 | 行为 |
|------|------|
| `sizeBytes` 未提供 | 先尝试预览；download 失败再 toast |
| `sizeBytes > PREVIEW_MAX_BYTES`（建议 **20MB**，可配置常量） | 跳过预览，主操作回退 `download-file`；toast「文件较大，已改为下载」 |
| iframe `onError` / 加载超时（可选 10s） | toast + 提供 Dialog 内「Download」或自动 `saveArtifactBytes` |
| `download.mode: unsupported` | 不走本管线；见 path-ref / `none` |

### 文本 / 音频（同 Phase I1）

| MIME | 渲染 | 解码 |
|------|------|------|
| `text/*`、`application/json`、`application/xml` | `<pre className="overflow-auto text-xs">` | `TextDecoder` on blob |
| `text/markdown` | Phase I1 同 `<pre>` | 同上 |
| `audio/*` | `<audio controls src={blobUrl} />` | blob URL |

### Electron path-ref：与 Dialog 预览分离

path-ref 用户文档 **不** 调用 `artifacts.download`（Gateway `unsupported` + 安全策略）。

| 主操作 | IPC | 说明 |
|--------|-----|------|
| `reveal-in-folder`（默认，I2） | `shell.showItemInFolder(path)` | 定位原文件，符合「用户上传」心智 |
| `open-with-system`（可选次操作，I2+） | `shell.openPath(path)` | 用系统应用打开 PDF；非 Dialog 内预览 |

path 来自 **`ArtifactSummary.localRevealPath`**（Phase I3：Gateway transcript 持久化 + `chat.history` 投影）；**不**经 `artifacts.download`。

---

## 用户上传：是否复制到 `media://inbound`？要记哪个 path？

用户文档 **并非** 一律复制到 inbound；ingest 通道不同，磁盘上的「真身」也不同。UI 的「在文件夹中显示」必须对准 **用户心智中的那份文件**，通常即 **原始绝对路径**（path-ref），而非 Gateway 内部副本。

### 两条 ingest 路径（Gateway 现状）

| 通道 | 典型入口（ui-react） | Gateway 行为 | 磁盘位置 | `ArtifactSummary` |
|------|----------------------|--------------|----------|-------------------|
| **`path-ref`** | Electron `attachmentRefs`（`buildAttachmentRefsFromMessage` → `getPathForFile`） | **不复制**；path 仅注入 agent prompt（`formatAttachmentRefsForAgent`）；transcript 写结构化 `file` 块 **不含 path** | 用户选择的 **原始路径**（如 `~/Documents/report.pdf`） | `ingestChannel: path-ref`，`download: unsupported`，**无 `mediaRef`** |
| **`inline-base64` + offload** | `chat.send.attachments` base64，经 `parseMessageWithAttachments` 超阈值或非图 | **`saveMediaBuffer(..., "inbound")`** → `media://inbound/<id>`；可能再 `prestageMediaPathOffloads` 进 sandbox | `~/.openclaw/.../media/inbound/...`（OpenClaw 数据目录） | 有 `mediaRef` 时 `download: bytes`；可 `artifacts.download` / 预览 |

**当前桌面 PDF 主路径**：Electron 非图走 **`attachmentRefs`（path-ref）**，**不会**复制到 `media://inbound`。  
复制到 inbound 主要发生在：**base64 `attachments` 经 offload**（大图、或走 attachments 管道的非图）；用户 **图片** 也会 `persistChatSendImages` 落到 inbound 以供 `media://` 预览。

```text
Electron 用户选 PDF
  → attachmentRefs[{ path: "/Users/me/report.pdf", ... }]
  → Gateway：agent 读原 path；transcript 无 path；ack artifact path-ref / unsupported
  → 文件仍在 /Users/me/report.pdf（未 copy）

Web/base64 用户 PDF（若走 attachments + offload）
  → saveMediaBuffer → media://inbound/xxx.pdf
  → 副本在 OpenClaw media store；浏览器侧无稳定「用户目录」path
```

### 「在文件夹中显示」应 reveal 哪个 path？

| 场景 | reveal 目标 | 路径来源 |
|------|---------------|----------|
| **path-ref（Electron PDF，主场景）** | **原始绝对 path** | **`ArtifactSummary.localRevealPath`**（I3：Gateway 在 ingest 时写入 transcript，history 投影） |
| **inbound 副本**（base64 offload / 用户图） | inbound 物理目录 | 可选：Gateway `mediaRef` → `resolveInboundMediaReference`；对用户 PDF 主场景 **不是** 用户桌面上的原文件 |
| **Web** | 不适用 | 无 OS 目录语义 → 主操作用预览（I1），非 reveal |

**结论：path-ref 必须记录原始 path**，且以 **Gateway transcript 为单一真相**（与 `artifactId`、文件名同生命周期）；`chat.history` / send ack 的 `ArtifactSummary` 通过 **`localRevealPath`** 投影给 Electron UI。

### `localRevealPath`（Phase I3，推荐默认）

```typescript
// ArtifactSummary 扩展（仅 ingestChannel === "path-ref"）
{
  ingestChannel: "path-ref",
  download: { mode: "unsupported" },
  localRevealPath?: string;  // 用户选择的原始绝对路径
}
```

**写入（Gateway）**

| 环节 | 行为 |
|------|------|
| `chat.send` + `attachmentRefs` | `buildUserTranscriptContentWithAttachmentRefs` 的 `file` 块增加 `localRevealPath: ref.path`（与 `contentIndex` 对齐） |
| send ack / `collectArtifactsFromMessages` | 从 transcript `file` 块读出 → 填入 `ArtifactSummary.localRevealPath` |
| `chat.history` | 同上投影；**Web 客户端**（未声明 `electron` capability）**省略**该字段 |

**读取（Electron UI，Phase I2）**

```typescript
// ArtifactChip / registry：path-ref + Electron + summary.localRevealPath
electronBridge.showItemInFolder(summary.localRevealPath);
```

| 字段 | 上 wire？ | 用途 |
|------|-----------|------|
| `attachmentRefs[].path`（send 请求） | 仅 RPC 请求体 | agent 当轮 prompt / 工具 |
| `localRevealPath`（summary） | **是**（path-ref；Electron capability 门控） | 刷新后 `reveal-in-folder` |
| `mediaRef`（inbound） | summary 可选 | 预览 / download bytes |

**不推荐**将 `localRevealPath` 的默认持久化放在 `localStorage`（易清、与 transcript 双真相）。`localStorage` / 内存 cache 仅作 **I3 落地前的临时兜底** 或旧 transcript 无字段时的 compat。

### 为何刷新后 path-ref chip 会变 `none`？（现状 vs 目标）

**现状（I3 未落地）**：Gateway 已在 send 时收到 path，但 transcript `file` 块与 `ArtifactSummary` **未投影** `localRevealPath` → 刷新后 UI 只剩文件名，chip 不可点。这是 **实现缺口**，不是「附件没附上」。

```text
【现状】发送（Electron）
  attachmentRefs[{ path: "/Users/me/report.pdf" }]
  → transcript file 块：fileName / mime，无 localRevealPath
  → ack / history：ingestChannel path-ref，无 localRevealPath
  → 刷新 → chip = none

【目标】发送（I3 后）
  attachmentRefs[{ path: "/Users/me/report.pdf" }]
  → transcript file 块：{ ..., localRevealPath: "/Users/me/report.pdf" }
  → ack / history：ArtifactSummary { ..., localRevealPath }
  → 刷新 → chat.history 带回 path → reveal-in-folder ✅
```

**用户心智 vs 实现分层**

| 用户以为 | 实际 wire（现状） | 目标（I3） |
|----------|-------------------|------------|
| 「这条消息绑着桌面上的那份 PDF」 | 只绑 `artifactId` + 文件名 | 再绑 `localRevealPath` |
| 「agent 处理过了，刷新还能点开」 | agent 当轮 OK；UI 链接断 | history 恢复链接 |
| 「Electron 是本地客户端」 | UI 仍走 Gateway 协议拉 history | path 跟 transcript 一起持久化在 `~/.openclaw/...` |

**与 inbound 对比**：inbound 有 `mediaRef` / `artifacts.download`，刷新后可预览；path-ref 在 I3 前缺对等字段，I3 用 **`localRevealPath`** 补齐。

**「常驻弱提示」**（I3 前 / 无 `localRevealPath` 的旧消息）

对 path-ref 且 **无** `localRevealPath` 的 chip，弱提示例如：

> 无法定位原文件（仅本机路径有效）；可重新发送附件。

I3 落地后，同机刷新应 **不再** 需要此文案；仅 **换机、远程 Gateway、旧 transcript、文件已删** 时保留。

| 状态 | chip 主操作 | 建议 UI |
|------|-------------|---------|
| 有 `localRevealPath` | `reveal-in-folder` | 正常可点 |
| path-ref，**无** `localRevealPath` | `none` | 弱提示（I3 前默认） |
| 有 path 但 IPC 失败（文件已移动/删除） | 点击失败 | toast「找不到文件」 |

### 与「复制到 inbound」相关的常见误解

| 误解 | 事实 |
|------|------|
| 用户发的 PDF 都会进 `media://inbound` | **否**；Electron 文档默认 **path-ref，不复制** |
| reveal 应打开 inbound 目录 | path-ref 应打开 **用户原始目录**；inbound reveal 只适用于 offload 副本场景 |
| `ArtifactSummary` 不能有 path | **`localRevealPath` 可以**（path-ref only）；与 `artifacts.download` 分离；Web capability 门控 |
| reveal 只能靠 localStorage | **否**；默认 **transcript + `localRevealPath`**；localStorage 仅过渡 |
| 记 path 后 agent 会改原文件 | **当前 Gateway 默认**（见下节）；与 UI reveal **原件** 相关，不等于产品终态应永远就地写 |
| path-ref 与 inbound 应合并成一种 | **否**；应 **上层统一 chip/协议**，底层保留双 ingest（见下节） |

---

## 为何保留 path-ref 与 inbound（不必合并底层）

两套 ingest 对应 **不同的物理现实**，不是同一能力的重复实现：

| 维度 | path-ref | inbound |
|------|----------|---------|
| 字节来源 | 文件已在用户磁盘，Gateway **不收字节** | Gateway **收到字节**（Web、频道、base64 offload） |
| Agent 默认写入面（现状） | prompt 中的 **原始绝对路径** → 工具就地读写 | `media://inbound/...` / `MediaPaths` → **副本** 或先抽文本 |
| 典型场景 | Electron 桌面文档、office-helper | Web 图、频道媒体、无稳定本地 path 的上传 |
| UI | reveal **原件**；`download: unsupported` | preview / download bytes |

**不建议**为「简化」而：

- **全改 inbound**（path-ref 也 copy）→ 丢失「用户工作区那一份」语义，重复占盘，office 就地流程退化。  
- **全改 path-ref** → Web/频道无本地 path，不可行。

**建议收敛方式**：Wire + `ArtifactSummary` + chip registry **已统一**；差异由 `ingestChannel` / `download.mode` 表达。Phase I1–I3 只做 **体验层统一**，不合并 Gateway 存储管道。

---

## 用户文件如何进入 LLM（摘要）

Chip 交互文档关心「用户点文件做什么」；agent 侧「模型看见什么」是另一条链，但产品决策需对齐：

| 方式 | 何时 | 主模型实际收到 |
|------|------|----------------|
| **Vision 传图** | 模型支持 image input + 用户图片 ≤6MB | API 中的 image/base64 块（大图先 offload，再读盘 **压缩** 后传入） |
| **预处理成文本** | 纯文本模型、PDF/文档 inbound、`tools.media` | Body 中的描述、`[Image]`、PDF 抽取文本、`[media attached: ...]` |
| **路径 + 工具** | path-ref 文档（现状） | prompt 明文路径；模型调 **read / edit / convert** 等工具，**非**整文件 multimodal 塞入 |

**图片硬限**：`MAX_IMAGE_BYTES` = **6MB**（`src/media/constants.ts`）；`chat.send` 更大图会在 Gateway **拒绝**，不存在「20MB 原图直塞模型」的现路径。

**path-ref PDF（现状）**：不 copy inbound；`formatAttachmentRefsForAgent` 注入路径，routing hint 引导 **直接在引用路径上操作**（`src/gateway/server-methods/chat.ts`）。模型是否读到内容，取决于是否 **发起工具调用**，不会自动把 PDF 全文灌进 prompt。

**inbound PDF**：`saveMediaBuffer` 后常经 `applyMediaUnderstanding` / `extractFileContent` 把 **文本块** 写入 Body；工具可读副本路径。

---

## 编辑安全：就地修改 vs 副本编辑（产品）

### 现状（Gateway）

桌面 `attachmentRefs` 上传后，agent 可见：

```text
Uploaded File References:
Use these exact local file paths when invoking file tools (read/write/edit/convert).
- fileId=...; path=/Users/me/report.pdf; ...
```

`classifyAttachmentIntent` 为 `edit-convert` 时，routing hint 进一步要求 **在引用路径上直接操作**。  
即当前产品默认是 **就地编辑（power-user）**：效率高、路径即用户附件，但 **原文件可能被覆盖且难回滚**（仅靠 Time Machine、Office 自动恢复等，非 OpenClaw 保证）。

inbound 上传则天然更接近 **副本编辑**：agent 动的是 OpenClaw 目录或 sandbox 内文件，**用户桌面原件**（若从未 path-ref）不受影响。

### 产品权衡

| | 就地编辑（path-ref 现状） | 副本编辑（copy-first，更安全） |
|--|---------------------------|-------------------------------|
| 用户心智 | 「附上就是要改这份」 | 「先改拷贝，别动我的原件」 |
| 失败成本 | 原文件损坏/覆盖 | 原件保留；最多丢工作副本 |
| 类型风险 | PDF/图片覆盖尤其不可逆 | 可先预览再「应用更改」 |
| 成本 | 实现简单 | 需 staging、回写、确认 UI |

按文件类型的 **产品默认倾向**（建议，非已实现）：

| 类型 | 建议默认 | 说明 |
|------|----------|------|
| Word / Excel / PPT | 副本编辑 + 可选「替换原文件」 | 熟练用户可 opt-in 就地 |
| PDF | **几乎总是副本** | 就地写原 PDF 易坏；多走转换/新文件 |
| 图片 | **另存为 / 工作区副本** | 覆盖原图不可逆 |
| inbound 已有副本 | 继续改副本 | 与 path-ref 策略对齐 |

### 推荐架构（不合并 ingest，统一「编辑管线」）

不必废除 path-ref 或 inbound，而在 **编辑意图** 上增加 staging 层（**未来 Phase，见下**）：

```text
ingest 仍两套（来源标识不变）:
  path-ref  → artifact / cache 记录「用户原件 path」
  inbound   → 系统已有副本

编辑管线（建议默认）:
  1. 检测 edit/convert 意图（可复用 classifyAttachmentIntent）
  2. 默认 copy 到 agent workspace / staging（命名可带 artifactId）
  3. prompt + 工具默认只指向 staging path（非原件）
  4. 完成后 UI：另存为 / 替换原文件（二次确认）/ 在文件夹中显示（原件 vs 副本分开）

高级：设置或单次勾选「允许就地编辑」，并明示风险。
```

### 与 chip 交互的关系

| 概念 | 含义 |
|------|------|
| **原件 path**（path-ref cache） | 用户附的是哪份文件 → `reveal-in-folder` / `openPath` |
| **工作副本 path**（未来 staging） | agent 实际写入目标 → 预览改后版本、diff、「应用更改」 |
| **二者不应混为一个 chip 动作** | reveal 打开原件目录 ≠ agent 正在修改的路径 |

Phase I1–I3 **不实现** staging；仅实现 reveal **原件** 与 inbound 预览。编辑安全策略单独立项（Phase I4 / Gateway）。

---

## UI 组件规范

### 布局

```text
[ 可选次操作图标 7×7 ] [ ArtifactChip 本体 ··· 文件名 ]
```

- **次操作在左、chip 在右**（与当前 `ArtifactChip.tsx` 一致），避免截断文件名。  
- 仅当存在次要操作且与主操作不重复时显示图标（例如 `preview-file` 时显示 Download；`reveal-in-folder` 时不显示 Download）。

### Chip 可点击态

- `interactive={primaryInteraction !== "none"}`  
- Hover：`bg-muted/80`（已有）  
- Loading：标题追加 `…`，禁用重复点击  
- `aria-label` / `title` 与主操作一致，例如：  
  - `Preview report.pdf`  
  - `Show report.pdf in folder`  
  - `Download report.pdf`（仅 download 主操作时）

### `ArtifactPreviewDialog` 扩展（重命名为 `ArtifactPreviewDialog` 或拆 `ArtifactContentPreviewDialog`）

| 字段 | 说明 |
|------|------|
| `title` | 文件名 |
| `mimeType` | 决定渲染分支 |
| `contentSrc` | blob URL 或 data URL（图片 / PDF / 音频） |
| `textContent` | 解码后的文本（文本类） |
| **Dialog 内动作** | 「Download」按钮（调用 `saveArtifactBytes`） |

关闭 Dialog 时 `URL.revokeObjectURL` 释放 blob（PDF / 音频；文本若仅用 `textContent` 无 blob 则无需 revoke）。

**PDF 分支**：`previewKind === "pdf"` 时使用 iframe（见上文 §文件预览实现）；Dialog footer 含 **Download**（`saveArtifactBytes`）与 **Close**。

### Electron `reveal-in-folder`

```text
用户选择 PDF → attachmentRefs[{ path }]
  → Gateway 写入 transcript file.localRevealPath
  → chat.send ack / chat.history：ArtifactSummary.localRevealPath
  → 用户点击 chip
  → electronBridge.showItemInFolder(summary.localRevealPath)
```

- **不**经 `artifacts.download`。  
- path 来源：**Gateway transcript**（与 history 同源）；非 `localStorage` 第二套存储。

### 错误与空态

| 情况 | 行为 |
|------|------|
| Gateway 未连接 | toast: `Gateway not connected` |
| `artifacts.download` 失败 | toast: 按主操作区分 preview / download 文案 |
| legacy 合成 `artifactId` | 不交互（保持现状） |
| path-ref 无 `localRevealPath` | chip 不可点；弱提示（见 §路径生命周期） |
| 预览 MIME 不支持 | 主操作回退为 `download-file`；toast 可选「已改为下载」 |
| PDF iframe 空白（Electron CSP） | 合入 `frame-src blob:`；仍失败则回退下载或 `openPath`（path-ref） |
| PDF 超过 `PREVIEW_MAX_BYTES` | 主操作 `download-file`；toast 说明 |

---

## 与协议字段映射

| UI 决策输入 | Wire 字段 | 备注 |
|-------------|-----------|------|
| 用户 vs 助手 | `ArtifactSummary.source`、`ArtifactRef.role` | 优先 `summary.source`，其次 `ref.role` |
| path-ref | `ingestChannel === "path-ref"` | 与 `download.mode: unsupported` 配对 |
| 能否拉字节 | `download.mode` | `bytes` → `artifacts.download` |
| 图片是否内联 | `mediaRef` + `hasInlineImageForRef` | 已有逻辑，不变 |
| 本地 reveal 路径 | `ArtifactSummary.localRevealPath` | 仅 `path-ref`；Electron capability 门控；见协议设计 §6.1 |

### 协议文档修订（实施时同步）

更新 [`artifacts-protocol-design.md`](./artifacts-protocol-design.md) §7.3 表格为「按 source / ingestChannel 分支」，并链接本文。

---

## 实施计划

> **逐步执行清单、PR 甘特、验证命令**：见 **[`artifact-chip-implementation-plan.md`](./artifact-chip-implementation-plan.md)**。  
> **编号**：Interaction Phase **I1 / I2 / I3**，与协议 Phase 1–3 正交。  
> **建议顺序**：**I1 → I3（Gateway）→ I2（UI reveal）**；I3 与 I2 可同一 PR；I1 无协议依赖。

### 总览

| Phase | 目标 | 建议 PR 数 | 用户可见变化 |
|-------|------|------------|--------------|
| **I1** | 助手产物点击预览 + 扩展 Preview Dialog | 1–2 | 助手 PDF/文本可预览；chip 主点击 |
| **I2** | Electron `reveal-in-folder`（读 `localRevealPath`） | 1–2 | 用户 path-ref chip 可定位原文件 |
| **I3** | Gateway 持久化 `localRevealPath` | 1–2 | 刷新 / history 重载后仍可 reveal |
| **I4**（未来） | 编辑 staging + 安全默认 | 2+ | 默认改副本；可选回写原件 |

---

### 前置条件（I1 范围外但影响验收）

| 项 | 现状 | 建议 |
|----|------|------|
| Web 文档 base64 | Composer 有文件但 send 路径只传图；非图缺 path 即失败（`GatewayChatRuntimeProvider.tsx`） | 打通 `documentBase64` → `chat.send.attachments` 后再测 I1 用户 PDF 预览 |
| 图片 >6MB | Gateway `MAX_IMAGE_BYTES` 拒绝 | Composer 前置校验与文案（可选，非本 doc Phase） |

---

### Phase I1 — 预览与 chip 主点击（无协议改动）

**退出标准**

- [ ] 助手消息 `source: assistant-output`、`download.mode: bytes` 的 PDF / 文本 / 音频：点击 chip → 预览 Dialog。  
- [ ] 同上场景：次操作下载图标可用，且与主点击不冲突。  
- [ ] 用户 Web base64 文档：点击 chip → 预览（非仅下载）。  
- [ ] 图片行为与 Phase 1 一致（内联 + chip 预览）。  
- [ ] `artifact-renderer-registry.test.ts` + Preview Dialog 测试绿。  
- [ ] Electron 内助手 / 用户 base64 PDF：Dialog iframe 非空白（CSP 已补丁）。

| ID | 任务 | 文件 | 依赖 | 验收（AC） |
|----|------|------|------|------------|
| I1.1 | 扩展 `ArtifactChipInteraction` 与 resolver | `artifact-renderer-registry.ts` | — | 入参增加 `source`、`ingestChannel`、`role`；矩阵单测覆盖 |
| I1.2 | 新增 `resolveArtifactPrimaryInteraction()` | 同上 | I1.1 | 与本文决策矩阵一致；导出供 chip 使用 |
| I1.3 | 新增 `resolveArtifactSecondaryInteraction()` | 同上 | I1.1 | `preview-*` → 次操作为 `download-file`；其余为 `none` |
| I1.4a | 预览字节 / MIME 工具 | `artifact-preview-bytes.ts`、`artifact-preview-mime.ts`（新） | — | `isPreviewableMime`；D5 阈值；单测 |
| I1.4b | 扩展 `ArtifactPreviewDialog` | `ArtifactPreviewDialog.tsx`、`artifact-preview-content.tsx`（新） | I1.4a | PDF iframe + blob；文本 pre；音频；footer Download |
| I1.4c | Electron CSP `frame-src blob:` | `apps/electron/src/main/window.ts` | I1.4b | Electron Dialog 内 PDF 可渲染 |
| I1.5 | 重构 `ArtifactRefChip` 主/次点击 | `ArtifactChip.tsx` | I1.2–I1.4b | chip 绑定主操作；图标绑定次操作；blob revoke |
| I1.6 | 助手消息回归 | `AssistantMessage.tsx`（仅验收） | I1.5 | `roleFilter="output"` 的 chip 可预览 |
| I1.7 | 测试 | `artifact-renderer-registry.test.ts`、`artifact-preview-mime.test.ts`、Preview 组件测试 | I1.1–I1.5 | assistant PDF、user web PDF、image 回归；超大小回退 |

**PR 建议标题**：`ui-react(chat): artifact chip primary preview for assistant and file outputs`

**PR 建议拆分**

- **PR-I1-ui**：I1.1–I1.5 + I1.7（Web 可完整验收 PDF/文本）  
- **PR-I1-electron-csp**：I1.4c（可并进 I1-ui 若同 PR 合 Electron）

**验证**

```bash
pnpm test ui-react/src/components/chat/artifacts/artifact-renderer-registry.test.ts
pnpm test ui-react/src/components/chat/artifacts/artifact-gateway-client.test.ts
pnpm test ui-react/src/components/chat/artifacts/artifact-preview-mime.test.ts
# Electron 手动：助手 PDF chip → Dialog 内可见 PDF；>20MB 走下载
```

---

### Phase I2 — Electron 用户文档「在文件夹中显示」

**退出标准**

- [ ] Electron path-ref chip：有 `summary.localRevealPath` 时点击 → Finder/Explorer 定位文件。  
- [ ] **不**依赖 `localStorage` / 客户端 path store 作为主路径（读 summary 字段）。  
- [ ] Web 行为不受负面影响。  
- [ ] `apps/electron` preload + main IPC 有最小单测或手动验收清单。

| ID | 任务 | 文件 | 依赖 | 验收（AC） |
|----|------|------|------|------------|
| I2.1 | IPC `showItemInFolder` + 可选 `openPath` | `apps/electron/src/main/`（新 handler）、`preload/index.ts` | — | 仅接受绝对 path；非法 path 返回 `{ ok: false }` |
| I2.2 | `electron-env.ts` 类型 | `ui-react/src/utils/electron-env.ts` | I2.1 | `showItemInFolder?`、`openPath?` |
| I2.3 | `reveal-in-folder` 主操作 | `ArtifactChip.tsx` + `artifact-renderer-registry.ts` | I1.*, I2.2, **I3.*** | `ingestChannel: path-ref` + `localRevealPath` + Electron → reveal |
| I2.4 | 从 summary 取 path | `artifact-helpers.ts` 或 chip | I3.4 | 不解析正文；优先 `ArtifactSummary.localRevealPath` |
| I2.5 | 无 path / 失效空态 | `ArtifactChip.tsx` | I2.3 | 无 `localRevealPath`：弱提示；IPC 失败：toast「找不到文件」 |
| I2.6 | path-ref 风险提示（I4 前） | chip tooltip 或帮助链接 | — | 明示 agent 可能修改原件（见 §编辑安全） |
| I2.7 | 测试 | `artifact-renderer-registry.test.ts` | I2.3–I2.6 | path-ref + `localRevealPath`；无字段 → none；mock electronBridge |

**PR 建议拆分**

- **PR-I2-electron**：I2.1 + I2.2  
- **PR-I2-ui**：I2.3–I2.7（依赖 I3 gateway 字段，或同 PR）  

**验证**

```bash
pnpm test ui-react/src/components/chat/artifacts/artifact-renderer-registry.test.ts
# Electron：手动 — 发送 PDF → 点击 user chip → 系统文件管理器定位
```

---

### Phase I3 — Gateway 持久化 `localRevealPath`（**推荐默认**）

**退出标准**

- [ ] `chat.send`（`attachmentRefs`）后，transcript `file` 块含 `localRevealPath`（与 `contentIndex` 对齐）。  
- [ ] send ack 与 `chat.history` 的 `ArtifactSummary` 含 `localRevealPath`（path-ref only）。  
- [ ] 刷新页面后 Electron 同机 path-ref chip 仍可 `reveal-in-folder`（文件仍在原路径时）。  
- [ ] Web 客户端（无 `electron` capability）的 history **不**收到 `localRevealPath`。  
- [ ] `artifacts.download` **仍不**接受本地 path；`pnpm protocol:gen` + 测试绿。

| ID | 任务 | 文件 | 依赖 | 验收（AC） |
|----|------|------|------|------------|
| I3.1 | 扩展 `ArtifactSummarySchema` | `src/gateway/protocol/schema/artifacts.ts` | — | 可选 `localRevealPath?: string`；`pnpm protocol:gen` |
| I3.2 | transcript `file` 块写入 path | `src/gateway/chat-send-artifacts.ts` | I3.1 | `buildUserTranscriptContentWithAttachmentRefs` 增加 `localRevealPath`；更新「不含 path」单测为「display 正文不含 path，块字段含 `localRevealPath`」 |
| I3.3 | 投影到 summary | `server-methods/artifacts.ts` `collectArtifactsFromMessage` | I3.2 | list/get/history 可见 `localRevealPath` |
| I3.4 | capability 门控 | `chat-history-artifacts.ts` 或 history handler | I3.3 | Web 握手无 electron → 剥离 `localRevealPath` |
| I3.5 | ui-react 类型 | `ui-react/.../types/artifact.ts` | I3.1 | 与 wire 同形 |
| I3.6 | 测试 | `chat-send-artifacts.test.ts`, `artifacts.test.ts`, `history.test.ts` | I3.2–I3.5 | send → history 往返 `localRevealPath`；Web 投影无字段 |

**备选（非默认）**

| 方案 | 说明 |
|------|------|
| I3-Alt-A `localStorage` | I3 未就绪前的临时兜底；**不**作默认 |
| I3-Alt-B canonical 私有字段 | 与 transcript 双真相，易漂移；仅当拒协议变更时考虑 |

**PR 建议标题**：`gateway(artifacts): persist localRevealPath for path-ref transcript blocks`

---

### Phase I4 — 编辑 staging 与回写（产品/backlog，非 I1–I3 阻塞）

> **目标**：默认 **副本编辑**，降低 path-ref 就地覆盖风险；**不**合并 path-ref / inbound ingest。

**退出标准（草案）**

- [ ] `edit-convert` 意图下，path-ref 附件在首次写工具前 **自动 staging** 到 workspace（或 inbound 命名副本）。  
- [ ] agent prompt 默认引用 **staging path**；原件 path 仅作 `source` 元数据。  
- [ ] 完成后 UI（或 tool-ui）提供：**另存为**、**替换原文件**（确认）、**丢弃副本**。  
- [ ] PDF/图片默认禁止无确认的就地覆盖；Office 可配置。  
- [ ] chip：区分「显示原件位置」与「打开工作副本」（若存在）。

| ID | 任务 | 归属 | 依赖 | 验收（AC） |
|----|------|------|------|------------|
| I4.1 | **DECISION** 默认策略与按 MIME 表 | 本文 §编辑安全 | — | 产品确认 D7/D8 |
| I4.2 | Gateway staging on send 或首工具写前 hook | `chat.ts` / 工具层 | I4.1 | path-ref 编辑不再默认写原件 |
| I4.3 | prompt 改为 staging path + source 原件 | `formatAttachmentRefsForAgent` 演进 | I4.2 | 测试 agent 读副本 |
| I4.4 | 回写 / 另存为 UI 或 tool 契约 | ui-react + tool-ui | I4.2 | 替换原文件需确认 |
| I4.5 | artifact cache 可选 `stagingPath` | 客户端私有或 additive 字段 | I4.2 | chip 可打开副本目录 |

**与 Phase I2/I3 关系**：I3 的 `localRevealPath` 指向 **原件**；I4 可 additive `stagingRevealPath`（或私有）指向工作副本。chip reveal 默认仍打开原件。

---

## 测试矩阵

| 场景 | 环境 | 主点击预期 | 次操作 |
|------|------|------------|--------|
| 助手 PNG | Web | 内联 / 预览 | — |
| 助手 PDF | Web | 预览 Dialog（iframe + blob） | 下载 |
| 助手 PDF | Electron | 预览 Dialog（需 `frame-src blob:`） | 下载 |
| 助手 PDF | 任意，>20MB | 下载（跳过 iframe） | — |
| 助手 `.txt` | Web | 文本预览 | 下载 |
| 助手 `.docx` | Web | 下载 | — |
| 用户 PNG | Web | 内联预览 | — |
| 用户 PDF base64 | Web | 预览 | 下载 |
| 用户 PDF path-ref | Electron | reveal（`localRevealPath`） | — |
| 用户 PDF path-ref | Electron（重载后，I3 后） | reveal（history 带回 `localRevealPath`） | — |
| 用户 PDF path-ref | Electron（I3 前 / 无字段） | none + 弱提示 | — |
| 用户 PDF path-ref | 原件已删除 | toast 找不到文件 | — |
| 用户 MP3 inbound | Web | 音频预览 / 下载 | 下载 |
| inbound 过期 | 任意 | download 失败 toast | — |
| legacy 合成 id | 任意 | none | — |
| `download.mode: url` | 任意 | 新标签 | — |

---

## 边界与未覆盖场景

| 场景 | 行为（目标/现状） | 备注 |
|------|-------------------|------|
| 频道入站文件（Telegram 等） | inbound；chip 走 I1 预览/download | 非 WebChat send；与 `artifactRefs` 投影一致即可 |
| `LegacyAttachmentChip` | 不可点 | history 仅 `attachments` hint；待 strip 退场后减少 |
| 同消息 legacy + `artifactRefs` | `MessageArtifactRefs` 优先 refs | 去重逻辑在 `hasInlineImageForRef` 等；多文档未单独测 |
| inbound **TTL 清理** 后点旧 chip | `artifacts.download` 失败 | 建议 toast「附件已过期」；依赖 Gateway 错误码 |
| 换机 / 远程 Gateway | `localRevealPath` 指向他机路径，reveal 失败 | toast「找不到文件」；弱提示；不伪造 path |
| 旧 transcript（无 `localRevealPath`） | none + 弱提示 | 可选 doctor 迁移或重发附件 |
| 只读意图 vs 编辑意图 | chip 交互 **相同**（I4 前） | 编辑语义见 §编辑安全；不在 chip 上分叉 |

---

## 开放问题（DECISION）

| ID | 问题 | 选项 | 建议 |
|----|------|------|------|
| D1 | history 重载后 Electron reveal | **C `localRevealPath`（transcript）** / Alt-A localStorage / Alt-B canonical 私有 | **已决：C**；Alt 仅过渡 |
| D2 | 用户 base64 文档主操作 | 预览 vs 下载 | **预览**（与助手一致） |
| D3 | `tool-output` 与 `assistant-output` 是否同交互 | 合并 / 区分 | **合并**（同为 output） |
| D4 | Preview Dialog 内 Markdown 渲染 | Phase I1 pre / Phase I2 MD | Phase I1 用 pre |
| D5 | 大文件预览上限 | 例如 >20MB 仅下载 | Phase I1 用 `sizeBytes` 阈值 + toast；常量 `PREVIEW_MAX_BYTES` 放 `artifact-preview-mime.ts` |
| D6 | path-ref 是否提供「用系统打开」 | 仅 reveal / reveal + `openPath` 次操作 | Phase I2 默认仅 reveal；`openPath` 作 I2.1 可选 |
| D7 | 编辑类附件默认策略 | 就地（现状）/ 默认 staging / 按 MIME 分 | **已决（I4）**：`edit-convert` 全类型 staging；`unknown` 下 PDF/图片 staging；`read-extract` 不 staging |
| D8 | 就地编辑是否保留 | 删除 / 高级设置 opt-in / 每消息勾选 | **已决（I4）**：默认 staging；就地编辑 **无 UI opt-in**（后续设置项 backlog） |
| D9 | path-ref 无 `localRevealPath` 时弱提示 | 仅 tooltip / chip 副文案 / 不提示 | **I3 前**常驻；I3 后仅旧消息/换机/远程 |
| D10 | pdf.js 回退 | 永不 / iframe 失败后 / 全平台 | Phase I1 不用；iframe+CSP 失败再评 |

---

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| PDF blob 预览内存占用 | Dialog 关闭 revoke URL；超大文件走 D5 阈值 |
| Electron iframe 被 CSP 拦截 | I1.4c `frame-src blob:`；失败回退下载 |
| pdf.js 诱惑 | Phase I1 坚持 iframe；仅在 iframe 全平台失败时开 **D10** 评估 pdf.js |
| Web 文档 send 未接通 | G1；I1 仅测 Electron 文档或助手 PDF；用户 Web PDF 预览待 G1 修复 |
| 多附件 path 对错绑 | I3.2 `contentIndex` 与 `attachmentRefs[i]` 对齐 + 测试 |
| `localRevealPath` 与文件移动 | reveal / `openPath` 失败 toast；不阻塞发送 |
| transcript 含 path 的暴露面 | 仅 path-ref；Electron capability 门控；`artifacts.download` 不用 path；远程 Gateway 需知情（协议 §12） |
| localStorage 双真相 | **避免**；以 transcript 为准 |
| 交互矩阵与协议 doc 漂移 | 合入 I1 时同步 §7.3；registry 单测为真相 |
| Control UI (`ui/`) 未同步 | Phase 3 协议计划 3.5；或单独 cherry-pick registry 逻辑 |
| path-ref 就地编辑改坏原件 | Phase I4 staging；I1–I3 文档与 UI 明示「当前 agent 可能写原件」；D7/D8 产品决 |

---

## 完成定义（Interaction 计划）

- [ ] Phase I1–I2 退出标准全部勾选  
- [ ] `artifacts-protocol-design.md` §7.3 已更新并链接本文  
- [ ] `ui-react/docs/chat/scenarios.md` 场景 1 / 3 补充 chip 交互一句  
- [ ] Phase I3（`localRevealPath`）按 D1 已决方案实施  
- [ ] D7/D8 有明确决议（可仅记录「维持现状至 I4」）  

---

## 相关文档

- [`artifacts-protocol-design.md`](./artifacts-protocol-design.md) — Wire 契约与 `download.mode` 语义  
- [`artifacts-protocol-implementation-plan.md`](./artifacts-protocol-implementation-plan.md) — Gateway / history 协议落地  
- [`ui-react/docs/chat/scenarios.md`](../chat/scenarios.md) — 历史加载、send ack 与 ingest（`attachments` / `attachmentRefs`）事件流  

---

## 变更记录

| 日期 | 变更 |
|------|------|
| 2026-06-05 | 初版：交互矩阵 + Phase I1–I3 实施计划 |
| 2026-06-05 | 补充 §文件预览实现：PDF blob+iframe、Electron CSP、path-ref 与 pdf.js 备选、I1.4 拆分 |
| 2026-06-05 | 补充 §用户上传 inbound 与原始 path：path-ref 不复制、必须客户端缓存原始 path |
| 2026-06-05 | 补充 §双 ingest 不必合并、§LLM 投递摘要、§编辑安全与 Phase I4 staging backlog |
| 2026-06-05 | 补充 §路径缓存生命周期与刷新后 none、已知缺口 G1–G5、边界场景、D9/D10、I2.6 弱提示 |
| 2026-06-05 | **D1 决议**：默认 **I3 `localRevealPath`**（Gateway transcript）；I2 读 summary；弃 localStorage 作主方案 |
