# Chat 附件上传改造升级方案（最终版）

## 一、设计决策总结

| 决策项 | 结论 |
|--------|------|
| 图片传输方式 | 始终走 base64（模型需要像素数据） |
| 文件大小限制 | 与官方对齐（20MB），UI 提示文案同步更新 |
| MIME 白名单 | 与官方保持一致（image/\*, audio/\*, PDF, text, Office, zip 等） |
| attachmentRefs | 保留，按用途分类路由 |
| 模型自动切换 | 不做自动切换 |

---

## 二、核心方案：按用途分类路由

```
┌──────────────────────────────────────────────────────┐
│  图片（任何大小）  →  始终走 base64 (attachments)      │
│  目的：让模型"看"图片，不需要文件路径                    │
│  Gateway：parseMessageWithAttachments → inline/offload │
├──────────────────────────────────────────────────────┤
│  文件/文档（Electron）→  始终走 attachmentRefs          │
│  目的：让 agent 读/写/转换文件，需要原始路径             │
│  Gateway：formatAttachmentRefsForAgent → 路径注入 prompt│
├──────────────────────────────────────────────────────┤
│  文件/文档（Web）   →  走 base64 (attachments) fallback│
│  目的：无本地路径可用时的降级方案，agent 只读副本         │
│  Gateway：parseMessageWithAttachments → offload        │
└──────────────────────────────────────────────────────┘
```

### 决策依据

- **图片**：模型需要像素数据做视觉理解，base64 inline 是唯一正确方式
- **文档保留 attachmentRefs**：office-helper agent 依赖本地路径做就地读写/转换，丢失路径会导致核心功能退化
- **Web fallback**：浏览器无法获取本地路径，只能传输内容作为降级

---

## 三、当前方案 vs 官方方案对比

### 架构对比

| 维度 | 当前方案 | 官方方案 |
|------|----------|----------|
| UI 框架 | `@assistant-ui/react` + `AttachmentAdapter` | Lit Web Components |
| 图片支持 | **禁用** | 完整（inline + offload） |
| 文件传输 | 路径引用（Electron only） | base64 全平台 |
| 支持 MIME | 文档类 only | 几乎所有非视频 |
| Agent 接收 | 路径文本拼入 prompt | MediaPaths + inline image |

### 改造后目标架构

| 维度 | 改造后 |
|------|--------|
| 图片 | base64 传输 → Gateway inline/offload → 模型多模态 content |
| 文档(Electron) | attachmentRefs（路径引用） → agent 直接操作原文件 |
| 文档(Web) | base64 传输 → Gateway offload → MediaPaths 只读副本 |
| MIME 范围 | 图片 + 音频 + PDF + Office + text + zip（对齐官方） |

---

## 四、详细改动清单

### Phase 1: 支持图片上传

#### 1.1 新增 Image Attachment Adapter

**文件**: `ui-react/src/components/chat/gateway/providers/send/attachment-adapter.ts`

```typescript
const IMAGE_MIME_TYPES = new Set([
  "image/png", "image/jpeg", "image/jpg", "image/gif",
  "image/webp", "image/svg+xml", "image/bmp",
]);

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

class GatewayImageAttachmentAdapter implements AttachmentAdapter {
  accept = "image/*";

  async add(state: { file: File }): Promise<PendingAttachment> {
    const { file } = state;
    if (!file.type.startsWith("image/")) {
      throw new Error("Only images accepted");
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      toast.error(`图片过大，最大支持 ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB`, { duration: 3000 });
      throw new Error("Image too large");
    }
    return {
      id: crypto.randomUUID(),
      type: "image",
      name: file.name,
      contentType: file.type,
      file,
      status: { type: "requires-action", reason: "composer-send" },
    };
  }

  async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    const base64 = await fileToBase64(attachment.file);
    return {
      ...attachment,
      status: { type: "complete" },
      content: [{ type: "image", image: base64 }],
    };
  }

  async remove(): Promise<void> {}
}
```

#### 1.2 组合 Adapter

```typescript
export function createGatewayCompositeAttachmentAdapter(): CompositeAttachmentAdapter {
  return new CompositeAttachmentAdapter([
    new GatewayImageAttachmentAdapter(),     // 新增
    new GatewayBinaryAttachmentAdapter(),    // 现有（文档类）
  ]);
}
```

#### 1.3 `parse-send-payload.ts` — 填充 gatewayAttachments

当前 `gatewayAttachments` 始终返回空数组，需改造为处理 image content：

```typescript
// 处理 thread attachments 中的 image 类型
for (const att of threadAttachments) {
  for (const part of att.content) {
    if (part.type === "image" && part.image) {
      gatewayAttachments.push({
        content: stripDataUrlPrefix(part.image),
        mimeType: att.contentType || "image/png",
        fileName: att.name || `image-${Date.now()}`,
      });
    }
  }
}
```

#### 1.4 `GatewayChatRuntimeProvider.tsx` — 移除图片拦截

```diff
- if (gatewayAttachments.some((att) => att.mimeType.startsWith("image/"))) {
-   toast.error("Image uploads are currently disabled.", { duration: 3000 });
-   return;
- }
```

#### 1.5 Gateway `attachment-normalize.ts` — 解除 image MIME 禁止

```diff
export function validateNormalizedChatAttachments(attachments) {
  for (const att of attachments) {
    const mime = att.mimeType?.trim().toLowerCase() ?? "";
    if (!mime) {
      return { ok: false, error: "attachment mimeType is required" };
    }
-   if (mime.startsWith("image/")) {
-     return { ok: false, error: "image uploads are currently disabled" };
-   }
-   if (!ALLOWED_CHAT_ATTACHMENT_MIME_TYPES.has(mime)) {
-     return { ok: false, error: `unsupported attachment mimeType: ${mime}` };
-   }
+   // 图片和官方支持的文档类型都允许
+   if (!mime.startsWith("image/") && !ALLOWED_CHAT_ATTACHMENT_MIME_TYPES.has(mime)) {
+     return { ok: false, error: `unsupported attachment mimeType: ${mime}` };
+   }
  }
  return { ok: true };
}
```

---

### Phase 2: 路由决策逻辑

#### 2.1 `GatewayChatRuntimeProvider.tsx` 中的发送逻辑

```typescript
const onNew = useCallback(async (message: AppendMessage) => {
  const { text, gatewayAttachments, displayAttachments } = parseGatewaySendPayload(message);

  // 分离：图片走 base64，文档走 attachmentRefs
  const imageAttachments = gatewayAttachments.filter(a => a.mimeType.startsWith("image/"));
  const nonImageAttachments = gatewayAttachments.filter(a => !a.mimeType.startsWith("image/"));

  // 文档类：尝试获取 Electron 路径
  const { refs: attachmentRefs, missingPathFiles } = await buildAttachmentRefsFromMessage(message);

  // Electron 环境：文档走 attachmentRefs
  // Web 环境（missingPathFiles > 0）：文档也走 base64
  const fileAttachmentsForBase64 = missingPathFiles.length > 0 ? nonImageAttachments : [];
  const effectiveRefs = missingPathFiles.length > 0 ? [] : attachmentRefs;

  // 合并发送
  const allBase64Attachments = [...imageAttachments, ...fileAttachmentsForBase64];

  await sendMessage(text, {
    attachments: allBase64Attachments.length > 0 ? allBase64Attachments : undefined,
    attachmentRefs: effectiveRefs.length > 0 ? effectiveRefs : undefined,
    displayAttachments,
  });
}, [sendMessage]);
```

#### 2.2 MIME 白名单扩展（对齐官方）

```typescript
// attachment-adapter.ts — 文档 Adapter
export const ALLOWED_MIME_TYPES = new Set([
  // 现有
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/html",
  "text/csv",
  "application/json",
  "application/xml",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // 新增（对齐官方）
  "application/zip",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/mp4",
  "audio/webm",
]);
```

#### 2.3 大小限制 & UI 提示更新

```typescript
// 图片：10MB
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

// 文档（base64 模式 / Web）：20MB（对齐官方）
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

// 文档（attachmentRefs / Electron）：100MB（保留现有）
export const MAX_FILE_SIZE_BYTES_REFERENCE_MODE = 100 * 1024 * 1024;
```

UI 提示文案更新：
- 附件按钮 tooltip: `"添加附件，图片最大 10MB，文件最大 20MB（桌面端 100MB）"`
- 超限 toast: `"图片过大，最大支持 10MB"` / `"文件过大，最大支持 20MB"`

---

### Phase 3: 粘贴与拖放支持

#### 3.1 Composer 粘贴图片

在 `Composer.tsx` 中监听 paste 事件，拦截 image 类型：

```typescript
const handlePaste = (e: React.ClipboardEvent) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) {
        // 通过 assistant-ui adapter 的 add 方法注入
        composerRuntime.addAttachment(file);
      }
    }
  }
};
```

#### 3.2 拖放文件

利用 `@assistant-ui/react` 内置的 `ComposerPrimitive.AttachmentDropzone`（已在 Composer 中），确认其 accept 范围覆盖 `image/*`。

---

## 五、Gateway 侧改动汇总

| 文件 | 改动 |
|------|------|
| `src/gateway/server-methods/attachment-normalize.ts` | 解除 `image/*` MIME 禁止 |
| `src/gateway/chat-attachments.ts` | 无改动（已支持图片处理） |
| `src/gateway/server-methods/chat.ts` | 无改动（已支持 attachments + attachmentRefs 并存） |

Gateway 现有代码已经：
- `parseMessageWithAttachments` 支持图片 inline/offload
- `formatAttachmentRefsForAgent` 支持路径注入
- 两者可以在同一个 `chat.send` 请求中并存

**唯一需要改的是 `attachment-normalize.ts` 中的验证函数。**

---

## 六、数据流总图

```
用户操作                    UI 层                         Gateway                       Agent
─────────               ──────                        ─────────                     ────────
粘贴/选择图片  ──→  ImageAdapter.add()
                     ImageAdapter.send()
                       → base64 编码           ──→  chat.send({ attachments: [{
                                                      mimeType: "image/png",
                                                      content: "<base64>" }] })
                                                         │
                                                         ▼
                                                    validateNormalizedChatAttachments ✓
                                                    parseMessageWithAttachments
                                                      ├── < 2MB → inline ChatImageContent ──→ 多模态 content block
                                                      └── > 2MB → offload → MediaPaths   ──→ agent 读取路径

选择文档(Electron) ──→  BinaryAdapter.add()
                        buildAttachmentRefs()
                          → 本地路径 + SHA256  ──→  chat.send({ attachmentRefs: [{
                                                      path: "/Users/.../doc.xlsx",
                                                      ... }] })
                                                         │
                                                         ▼
                                                    validateAttachmentRefs ✓
                                                    formatAttachmentRefsForAgent
                                                    buildAttachmentRoutingHint    ──→  agent 直接读写原文件

选择文档(Web)     ──→  BinaryAdapter.add()
                       BinaryAdapter.send()
                         → base64 编码         ──→  chat.send({ attachments: [{
                                                      mimeType: "application/pdf",
                                                      content: "<base64>" }] })
                                                         │
                                                         ▼
                                                    parseMessageWithAttachments
                                                      → offload → MediaPaths         ──→  agent 读取副本
```

---

## 七、实施优先级

| 阶段 | 内容 | 影响范围 |
|------|------|----------|
| **Phase 1** | 图片上传支持 | UI adapter + Gateway 验证 |
| **Phase 2** | 路由决策 + Web fallback | GatewayChatRuntimeProvider |
| **Phase 3** | 粘贴/拖放 + 体验优化 | Composer 组件 |

Phase 1 完成后即可使用图片上传功能，Phase 2/3 为增强体验。

---

## 八、不影响的现有功能

| 功能 | 说明 |
|------|------|
| office-helper 文件处理 | Electron 下文档继续走 attachmentRefs，路径、routing hint 完全不变 |
| 意图分类 (classifyAttachmentIntent) | 保留现有逻辑 |
| 文件内容注入 (buildAttachmentRefsAppendix) | 保留现有逻辑 |
| 历史消息附件显示 (history-attachment-strip) | 保留现有逻辑 |
| AI 生成图片展示 (managed-image-attachments) | 不涉及，保持原样 |

---

## 九、需要新增的工具函数

```typescript
// utils/file-to-base64.ts
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // 去掉 data:xxx;base64, 前缀
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function stripDataUrlPrefix(dataUrl: string): string {
  const match = /^data:[^;]+;base64,(.*)$/.exec(dataUrl);
  return match?.[1] ?? dataUrl;
}
```
