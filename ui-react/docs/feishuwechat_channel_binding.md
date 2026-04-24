# 飞书微信渠道绑定方案

## 背景与目标

在 Web Chat 新会话场景下，用户希望直接说“通过我的飞书/微信发送：xxx”即可发送消息，不需要手工提供 `open_id`、`chat_id` 或微信目标 ID。  
本方案目标：

- 自动学习用户在渠道中的可发送目标（recipient）。
- 在发送时自动补全目标，减少手工配置。
- 不依赖“修改系统提示词”来驱动行为，保证可维护与可扩展。

---

## 设计原则

- **渠道无关**：核心流程统一，渠道差异通过 adapter 处理。
- **确定性优先**：优先用结构化数据（`identityLinks` / `session.identityHints`）解析目标，不靠模型猜测。
- **安全兜底**：仅在“唯一可确定目标”时自动补全，歧义时不自动发送。
- **可演进**：新增渠道时只需补 adapter 和少量测试。

---

## 核心改造

## 1) 统一收件人解析层（Recipient Resolver）

新增：`src/infra/outbound/recipient-resolver.ts`

职责：

- 从 `session.identityLinks` 解析收件人（优先）。
- 解析失败时回退到 `session.identityHints.recipientsByChannel`。
- 使用渠道 adapter 处理目标格式差异。

当前已接入 adapter：

- `feishu/lark`：目标格式 `user:ou_xxx`。
- `openclaw-weixin/weixin/wechat/wx`：目标格式 `xxx@im.wechat`。

---

## 2) 会话身份自动学习（Identity Hints）

改造：`src/config/sessions/metadata.ts`、`src/config/sessions/types.ts`

新增通用结构：

- `session.identityHints.recipientsByChannel: Record<string, string>`

学习策略：

- 飞书 direct 消息：学习 `feishu -> user:ou_xxx`（兼容保留 `feishuDirectUserId`）。
- 微信 direct 消息：学习 `openclaw-weixin -> xxx@im.wechat`。

---

## 3) Message 工具自动补全

改造：`src/agents/tools/message-tool.ts`

行为：

- 当 `send` 类动作缺少显式 target 时：
  - 若渠道是飞书或微信，调用统一 resolver 自动补全。
  - 命中唯一目标则自动注入 `channel/target`，否则保持原行为（不盲发）。

---

## 4) 快速发送意图直达（不依赖模型是否调用 message 工具）

新增：`src/infra/outbound/quick-send-intent.ts`  
接入：`src/gateway/server-methods/chat.ts`

场景：

- 用户输入“通过我的飞书发送一条信息：你好”
- 或“通过我的微信发送一条信息：你好”

流程：

1. 识别“我的 + 渠道 + 发送 + 文本”意图；
2. 调用统一 resolver 获取收件人；
3. 直接走 `runMessageAction` 发送；
4. 回写会话消息与 dedupe 状态。

说明：这是后端结构化处理，不是写系统提示词硬编码。

---

## 数据流（简化）

1. 渠道 inbound（飞书/微信）进入网关；
2. `deriveSessionMetaPatch` 自动学习并落盘 `identityHints`；
3. Web Chat 发起“我的飞书/微信发送”请求；
4. 先走 quick-send intent（命中则直发）；
5. 未命中时由模型/工具流程触发 message tool，message tool 再走 resolver 自动补全。

---

## 与旧方案差异

旧方案问题：

- 依赖系统提示词引导模型调用 message 工具；
- 可维护性差，渠道扩展成本高。

新方案改进：

- 发送目标解析下沉到后端结构层；
- 通过 adapter 统一扩展多渠道；
- 模型是否“聪明”不再决定核心功能是否可用。

---

## 已覆盖测试

- `src/infra/outbound/recipient-resolver.test.ts`
- `src/config/sessions/metadata.identity-hints.test.ts`
- `src/infra/outbound/quick-send-intent.test.ts`
- `src/agents/tools/message-tool.test.ts`

验证点包括：

- `identityLinks` 唯一命中；
- 会话 hints 回退；
- 飞书/微信渠道别名；
- 快速发送意图解析；
- message tool 自动补全行为。

---

## 当前限制与后续建议

- 微信目标解析当前按 `@im.wechat` 规则处理，若后续接入新 ID 形态，可在微信 adapter 增加规则。
- quick-send 意图目前覆盖“我的 + 渠道 + 发送”主路径，后续可补更多自然语言变体。
- 若要提升 UI 解释力，建议把渠道状态拆为“接收能力/发送能力”两个维度，避免用户把 `Running` 误解为“完全不可用”。

