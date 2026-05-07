# Channel Logo 实现说明

## 概述

为 OpenClaw 的 Channel 卡片组件添加了品牌 Logo 显示功能，让用户能够更直观地识别不同的消息通道平台。

## 实现内容

### 1. 新增文件

#### `ui-react/src/components/channels/channel-logos.ts`
- 提供了各渠道平台的品牌 Logo URL 映射
- 飞书使用本地 SVG 资源 (`@/assets/feishu.svg`)
- 其他渠道使用 jsDelivr CDN 托管的 Simple Icons SVG 图标
- 支持以下渠道的 Logo：
  - 飞书 (feishu) - **本地资源**
  - 微信 (openclaw-weixin)
  - WhatsApp
  - Telegram
  - Discord
  - Google Chat
  - Slack
  - Signal
  - iMessage
  - LINE
  - Nostr
  - Microsoft Teams
  - Matrix
  - Zalo

### 2. 修改的组件

#### `ChannelCard.tsx`
- 在卡片左上角显示渠道 Logo（32x32px）
- 如果没有 Logo，则回退到原来的彩色圆点状态指示器
- Logo 使用懒加载（`loading="lazy"`）以优化性能
- 保持了原有的状态指示功能（运行/错误/空闲/禁用）

#### `CatalogCard.tsx`
- 同样在卡片左上角显示渠道 Logo（32x32px）
- 没有 Logo 时显示灰色圆点
- 保持与 ChannelCard 一致的视觉风格

## 技术细节

### Logo 尺寸
- 统一使用 `size-8`（32x32px）
- 通过 `object-contain` 确保 Logo 不变形

### 回退机制
- **ChannelCard**: 根据状态显示不同颜色的圆点
  - 运行中：绿色 (emerald-500)
  - 错误：红色 (red-500)
  - 空闲：琥珀色 (amber-400)
  - 禁用：灰色 (#D1D5DB)
- **CatalogCard**: 始终显示灰色圆点 (#D1D5DB)

### 性能优化
- 使用 `loading="lazy"` 延迟加载图片
- 使用 CDN 加速（jsDelivr）
- SVG 格式确保清晰度且文件小

## 扩展新渠道

### 使用本地资源（推荐用于重要渠道）
1. 将 SVG 文件放入 `ui-react/src/assets/` 目录
2. 在 `channel-logos.ts` 中导入：
```typescript
import feishuLogo from "@/assets/feishu.svg";
```
3. 添加到映射：
```typescript
export const CHANNEL_LOGO_URLS: Record<string, string> = {
  feishu: feishuLogo,
  // ...
};
```

### 使用外部 CDN
```typescript
export const CHANNEL_LOGO_URLS: Record<string, string> = {
  newchannel: "https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/newchannel.svg",
};
```

可以在 [Simple Icons](https://simpleicons.org/) 查找更多品牌图标。

## 视觉效果

### 示例布局
```
┌─────────────────────────────────────┐
│ [Logo]  Channel Name                │
│         Channel Detail              │
│                                     │
│ [状态图标] running/configured 等     │
│                                     │
│ [配置提示/操作按钮]                  │
└─────────────────────────────────────┘
```

## 相关文件

- `ui-react/src/components/channels/channel-logos.ts` - Logo 映射和工具函数
- `ui-react/src/components/channels/ChannelCard.tsx` - 渠道卡片组件
- `ui-react/src/components/channels/CatalogCard.tsx` - 渠道目录卡片组件
- `ui-react/src/components/channels/constants.ts` - 渠道默认顺序

## 注意事项

1. 飞书 Logo 使用本地 SVG 资源，确保文件存在于 `@/assets/feishu.svg`
2. 其他 Logo 均来自 Simple Icons 库，通过 jsDelivr CDN 加载
3. 如果网络无法访问 CDN，Logo 将无法显示，会自动回退到彩色圆点
4. 对于重要的品牌 Logo，建议使用本地资源以提高可靠性和加载速度
