# OpenClaw 官方版本 Chat 附件上传方案分析

## 概述

OpenClaw 官方版本实现了完整的 Chat 对话框文件和图片上传功能。整体架构分为三层：

1. **UI 层（Control UI）** — 负责文件选择、预览、编码为 base64 Data URL
2. **Gateway RPC 层** — 接收 base64 附件，规范化、验证、分类（图片/非图片）
3. **Media Store / Agent 层** — 持久化存储、sandbox staging、注入 agent context

---

## 数据类型定义

### UI 侧类型

```typescript
// ui/src/ui/ui-types.ts
type ChatAttachment = {
  id: string;
  dataUrl?: string;       // base64 Data URL（完整）
  previewUrl?: string;    // 用于缩略图展示的 Object URL
  mimeType: string;
  fileName?: string;
  sizeBytes?: number;
};
```

### Gateway 侧类型

```typescript
// src/gateway/chat-attachments.ts
type ChatAttachment = {
  type?: string;
  mimeType?: string;
  fileName?: string;
  content?: unknown;     // base64 字符串（不含 data: 前缀）
};

type ChatImageContent = {
  type: "image";
  data: string;          // 纯 base64
  mimeType: string;
};

type OffloadedRef = {
  mediaRef: string;      // media://inbound/<id>
  id: string;
  path: string;          // 磁盘绝对路径
  mimeType: string;
  label: string;
  sizeBytes: number;
};
```

---

## 整体流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│  UI Layer (Lit Web Components)                                          │
│                                                                         │
│  1. 用户选择文件 (click / paste / drag-drop)                             │
│  2. FileReader.readAsDataURL → 生成完整 base64 Data URL                  │
│  3. 注册到 attachment-payload-store (previewUrl + dataUrl)               │
│  4. 展示缩略图预览                                                       │
│  5. 发送时调用 buildApiAttachments → 提取 base64 content + mimeType       │
│  6. 通过 WebSocket RPC 调用 chat.send                                    │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ RPC: chat.send({ attachments: [...] })
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Gateway Server (chat.ts)                                               │
│                                                                         │
│  1. normalizeRpcAttachmentsToChatAttachments → 统一格式                   │
│  2. hasImageChatAttachments → 判断是否含图片                              │
│  3. resolveGatewayModelSupportsImages → 检查模型是否支持视觉               │
│  4. resolveImageModelOverridePlan → 决定是否切换为视觉模型                  │
│  5. parseMessageWithAttachments → 核心解析:                              │
│     - 验证 base64、大小限制                                              │
│     - MIME 嗅探 + 优先级决策                                             │
│     - 图片: 小于2MB → inline (ChatImageContent)                          │
│     -        大于2MB 或 text-only 模型 → offload 到磁盘                   │
│     - 非图片: 总是 offload 到磁盘                                         │
│  6. prestageMediaPathOffloads → sandbox staging                         │
│  7. persistChatSendImages → 持久化到 media store                         │
│  8. 注入 MsgContext (MediaPath/MediaPaths/MediaType 等)                  │
│  9. dispatchInboundMessage → 进入 agent auto-reply 流程                  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 详细实现

### 一、UI 层：文件选择与编码

#### 支持的文件类型

```typescript
// ui/src/ui/chat/attachment-support.ts
const CHAT_ATTACHMENT_ACCEPT =
  "image/*,audio/*,application/pdf,text/*,.csv,.json,.md,.txt,.zip," +
  ".doc,.docx,.xls,.xlsx,.ppt,.pptx";
```

不支持视频文件（`.avi`, `.mp4`, `.mov` 等）。

#### 三种输入方式

| 方式 | 处理函数 | 说明 |
|------|----------|------|
| 文件选择按钮 | `handleFileSelect` | `<input type="file">` accept 过滤 |
| 粘贴 | `handlePaste` | 仅拦截 image/* 类型的 clipboard items |
| 拖放 | `handleDrop` | 同文件选择逻辑 |

#### 编码流程

```typescript
// ui/src/ui/views/chat.ts
function chatAttachmentFromFile(file: File, dataUrl: string): ChatAttachment {
  const attachment = {
    id: generateAttachmentId(),          // att-<timestamp>-<random>
    mimeType: file.type || "application/octet-stream",
    fileName: file.name || undefined,
    sizeBytes: file.size,
  };
  return registerChatAttachmentPayload({ attachment, dataUrl, file });
}
```

每个文件通过 `FileReader.readAsDataURL()` 转为完整的 `data:<mime>;base64,<content>` 字符串。

#### Payload Store

`attachment-payload-store.ts` 使用内存 Map 管理 dataUrl 和 previewUrl：
- `previewUrl`: 通过 `URL.createObjectURL(file)` 生成，用于 UI 预览
- `dataUrl`: 完整 base64 编码，发送时使用
- 发送后释放（`releaseChatAttachmentPayloads`）

#### 发送时构建 API 请求

```typescript
// ui/src/ui/controllers/chat.ts
function buildApiAttachments(attachments?: ChatAttachment[]) {
  return attachments?.map((att) => {
    const dataUrl = getChatAttachmentDataUrl(att);
    const parsed = dataUrlToBase64(dataUrl);   // 提取 mimeType + content
    return {
      type: parsed.mimeType.startsWith("image/") ? "image" : "file",
      mimeType: parsed.mimeType,
      fileName: att.fileName,
      content: parsed.content,   // 纯 base64（去掉 data: 前缀）
    };
  }).filter(Boolean);
}
```

---

### 二、Gateway 层：规范化与解析

#### RPC 参数规范化

```typescript
// src/gateway/server-methods/attachment-normalize.ts
function normalizeRpcAttachmentsToChatAttachments(attachments): ChatAttachment[] {
  // 支持两种格式：
  // 1. 直接 content 字段（string / ArrayBuffer / TypedArray）
  // 2. source 对象: { type: "base64", media_type, data }
  // 输出统一为 { type, mimeType, fileName, content: base64String }
}
```

#### 核心解析：`parseMessageWithAttachments`

**关键参数：**
- `maxBytes`: 默认 20MB（`DEFAULT_CHAT_ATTACHMENT_MAX_MB`）
- `supportsImages`: 当前模型是否支持视觉输入
- `acceptNonImage`: chat.send 始终为 true

**处理逻辑：**

```
对每个附件:
  1. normalizeAttachment → 提取 label, mime, base64 (去掉 data: 前缀)
  2. 验证 base64 有效性 & 大小限制
  3. MIME 决策 (优先级: sniffed > provided > label-derived)
  4. 分类处理:
     ├── 图片 + 模型支持视觉 + < 2MB (OFFLOAD_THRESHOLD)
     │   → 保留为 inline ChatImageContent
     ├── 图片 + 模型不支持视觉
     │   → offload 到磁盘, 追加 [media attached: media://inbound/<id>]
     ├── 图片 + > 2MB
     │   → offload 到磁盘 (即使模型支持视觉)
     └── 非图片 (PDF, DOCX, 等)
         → offload 到磁盘
```

**图片特殊限制：**
- 图片不能超过 `MAX_IMAGE_BYTES`（来自 `media/constants.ts`）
- Text-only 模型最多 offload 10 张图片（`TEXT_ONLY_OFFLOAD_LIMIT`）

#### MIME 嗅探与优先级

```typescript
function resolveAttachmentMime({ sniffedMime, providedMime, labelMime }): string {
  // 优先级: specific(sniffed) > specific(provided) > specific(label)
  //         > any(sniffed) > any(provided) > any(label)
  //         > "application/octet-stream"
  // 特殊: OOXML (.docx/.xlsx) sniff 为 application/zip，
  //        此时信任 provided/label 的具体 MIME
}
```

#### 图片模型覆盖策略

当附件含图片但当前会话模型不支持视觉时：

```typescript
const imageModelPlan = await resolveImageModelOverridePlan({
  cfg, agentId,
  hasImageAttachments,
  sessionModelSupportsImages,
  // ...
});
// 三种结果:
// - "inline-session": 当前模型支持，直接 inline
// - "inline-image-model": 切换到支持视觉的模型
// - (默认): offload 为文件路径
```

---

### 三、Media Store：磁盘持久化

#### 存储结构

```
~/.openclaw/media/
├── inbound/           ← 用户上传的附件
│   ├── <uuid>.png
│   └── <uuid>.pdf
└── outgoing/          ← AI 生成的图片
    ├── originals/
    └── records/       ← JSON 元数据
```

#### `saveMediaBuffer`

```typescript
// src/media/store.ts
export async function saveMediaBuffer(
  buffer: Buffer,
  contentType: string,
  subdir: string,       // "inbound" | "outgoing/originals"
  maxBytes?: number,
  originalName?: string,
): Promise<SavedMedia> {
  // 1. 生成 UUID 文件名 + 正确扩展名
  // 2. 写入 ~/.openclaw/media/<subdir>/<uuid>.<ext>
  // 3. 返回 { id, path, size, contentType }
}
```

#### Sandbox Staging

对于有 sandbox 的 agent（Docker 容器）：

```typescript
async function prestageMediaPathOffloads(params) {
  // 1. 获取 agent workspace 目录
  // 2. ensureSandboxWorkspaceForSession
  // 3. 检查文件大小不超过 MEDIA_MAX_BYTES (5MB, sandbox 限制)
  // 4. stageSandboxMedia → 复制文件到 sandbox workspace
  // 5. 返回 sandbox 内相对路径
}
```

没有 sandbox 时直接返回 media store 的绝对路径。

---

### 四、Agent Context 注入

解析完成后，附件信息通过 `MsgContext` 注入 agent 上下文：

```typescript
const ctx: MsgContext = {
  Body: messageForAgent,
  // ...
  MediaPath: mediaPathOffloadPaths[0],      // 第一个文件路径
  MediaPaths: mediaPathOffloadPaths,        // 所有文件路径
  MediaType: mediaPathOffloadTypes[0],      // 第一个 MIME
  MediaTypes: mediaPathOffloadTypes,        // 所有 MIME
  MediaWorkspaceDir: workspaceDir,          // sandbox workspace 根目录
  MediaStaged: true,                        // 标记已 stage，跳过重复 staging
};
```

Inline 图片则通过 `parsedImages` (ChatImageContent[]) 直接作为多模态 content block 发送给模型。

---

### 五、Outgoing（AI 生成图片）展示

AI 回复中的图片通过 `managed-image-attachments.ts` 处理：

1. `createManagedOutgoingImageBlocks` — 将 AI 生成的图片 URL/data URL/本地路径保存到 media store
2. 自动 resize 到限制以内（4096x4096, 20MP, 12MB）
3. 生成 JSON record 和 HTTP serving URL
4. `handleManagedOutgoingImageHttpRequest` — HTTP GET 端点提供图片字节流
5. `attachManagedOutgoingImagesToMessage` — 绑定到 transcript message（持久化保留）
6. `cleanupManagedOutgoingImageRecords` — 清理过期 transient 图片（15分钟 TTL）

---

## 关键配置项

| 配置路径 | 默认值 | 说明 |
|----------|--------|------|
| `agents.defaults.mediaMaxMb` | 20 MB | 附件上传最大体积 |
| `MEDIA_MAX_BYTES` | 5 MB | media store 单文件上限 / sandbox staging 上限 |
| `OFFLOAD_THRESHOLD_BYTES` | 2 MB | 图片 inline vs offload 分界线 |
| `MAX_IMAGE_BYTES` | (constants.ts) | 图片绝对上限（超过直接拒绝） |
| `TEXT_ONLY_OFFLOAD_LIMIT` | 10 | text-only 模型最多接收的 offload 图片数 |
| Managed outgoing limits | 12MB / 4096x4096 / 20MP | AI 生成图片的尺寸限制 |

---

## 错误处理

| 错误类型 | HTTP 码 | 场景 |
|----------|---------|------|
| `UnsupportedAttachmentError("empty-payload")` | 400 | 附件内容为空 |
| `UnsupportedAttachmentError("text-only-image")` | 400 | 模型不接受图片且无 fallback |
| `UnsupportedAttachmentError("unsupported-non-image")` | 400 | 入口不支持非图片附件 |
| `UnsupportedAttachmentError("non-image-too-large-for-sandbox")` | 400 | 非图片超过 sandbox 5MB |
| `MediaOffloadError` | 503 (UNAVAILABLE) | 磁盘写入/staging 失败 |
| base64 无效 / 超过 maxBytes | 400 | 格式校验失败 |

---

## 文件索引

| 文件路径 | 职责 |
|----------|------|
| `ui/src/ui/views/chat.ts` | UI 文件选择、粘贴、拖放、预览渲染 |
| `ui/src/ui/chat/attachment-support.ts` | 支持的 MIME 类型 & accept 属性 |
| `ui/src/ui/chat/attachment-payload-store.ts` | 内存 payload 管理（dataUrl/previewUrl） |
| `ui/src/ui/controllers/chat.ts` | 构建 API 请求、RPC 调用 |
| `ui/src/ui/ui-types.ts` | `ChatAttachment` UI 类型定义 |
| `src/gateway/server-methods/attachment-normalize.ts` | RPC → ChatAttachment 规范化 |
| `src/gateway/chat-attachments.ts` | 核心解析逻辑、MIME 嗅探、offload 决策 |
| `src/gateway/server-methods/chat.ts` | chat.send 主入口、流程编排 |
| `src/gateway/managed-image-attachments.ts` | AI 生成图片管理、HTTP serving、清理 |
| `src/media/store.ts` | 底层文件存储（saveMediaBuffer/Source/Stream） |
| `src/media/sniff-mime-from-base64.ts` | base64 → magic bytes → MIME 嗅探 |
| `src/auto-reply/reply/stage-sandbox-media.ts` | sandbox 文件 staging |
| `src/auto-reply/reply/image-model-override-plan.ts` | 图片模型自动切换策略 |

---

## 总结

OpenClaw 的附件上传采用 **base64 编码通过 WebSocket RPC 传输** 的方案：

- **图片**：优先 inline 作为多模态 content block 直接发送给支持视觉的模型；不支持时 offload 到磁盘并通过 `imageModel` 机制描述
- **文件**：始终 offload 到本地 media store，通过 `MediaPaths` 注入 agent context，agent 可在 sandbox 内直接读取
- **大小控制**：分层限制（20MB RPC → 5MB sandbox staging → 2MB inline 阈值）
- **安全性**：MIME 嗅探防止伪造、base64 严格校验、路径安全检查、sandbox 隔离
