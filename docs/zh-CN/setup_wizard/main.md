Setup Wizard (Onboarding) 流程详解
根据代码分析，openclaw onboard 命令的完整配置流程如下：

1. Wizard 的两种模式
   ┌─────────────────────────────────────────────────────────┐
   │ Setup Wizard 流程选择 │
   └─────────────────────────────────────────────────────────┘
   │
   ┌─────────────────┴─────────────────┐
   │ │
   ┌───▼────────┐ ┌──────▼──────┐
   │ QuickStart │ │ Manual │
   │ (推荐) │ │ (高级配置) │
   └────────────┘ └─────────────┘

2. 必须配置的项目 ✅ (REQUIRED)
   配置项 说明 默认值 可跳过
   风险确认 安全警告确认 - ❌ 必须
   AI 模型 选择 LLM 提供商 + API Key - ❌ 必须
   工作区 Agent 工作目录 ~/.openclaw/workspace ✅ 可用默认值
   Gateway 端口 监听端口 18789 ✅ 可用默认值

3. 可选配置的项目 ⭐ (OPTIONAL)
   配置项 说明 默认值 何时需要
   频道配置 WhatsApp/Telegram/Discord 等 跳过 需要多渠道时
   Skills 扩展功能插件 跳过 需要额外功能时
   Gateway 绑定 网络绑定地址 loopback 需要远程访问时
   Tailscale 远程访问隧道 off 需要远程访问时
   守护进程 后台服务安装 true (QuickStart) 需要持久运行时
   认证方式 token 或 password token 需要安全认证时

4. 完整的 Wizard 流程步骤
   1️⃣ 风险确认 (REQUIRED)
   └─ 阅读安全警告 → 确认理解
   2️⃣ 选择模式 (REQUIRED)
   ├─ QuickStart (推荐，快速启动)
   └─ Manual (高级配置)
   3️⃣ 配置处理 (REQUIRED)
   ├─ 检测现有配置
   ├─ 选择: 保留/覆盖/重置
   └─ 应用选择
   4️⃣ AI 模型配置 (REQUIRED)
   ├─ 选择提供商 (OpenAI/Anthropic/等)
   ├─ 输入 API Key
   └─ 验证连接
   5️⃣ 工作区配置 (OPTIONAL)
   ├─ 确认或修改路径
   └─ 创建必要目录
   6️⃣ Gateway 配置 (OPTIONAL - Manual 模式)
   ├─ 端口设置
   ├─ 绑定地址 (loopback/lan/custom/tailnet)
   ├─ 认证方式 (token/password)
   └─ Tailscale 配置
   7️⃣ 频道配置 (OPTIONAL)
   ├─ 列出可用频道
   ├─ 选择要配置的频道
   ├─ 输入频道凭证
   └─ 测试连接
   8️⃣ Skills 配置 (OPTIONAL)
   ├─ 选择 Node 管理器 (npm/pnpm/bun)
   ├─ 安装 Skills
   └─ 配置 Skills
   9️⃣ 守护进程安装 (OPTIONAL)
   ├─ 选择运行时 (Node/Bun)
   ├─ 安装系统服务
   └─ 启动服务
   🔟 完成
   ├─ 显示 Gateway 地址
   ├─ 打开 Control UI
   └─ 启动 TUI (可选)

5. QuickStart vs Manual 对比
   功能 QuickStart Manual
   风险确认 ✅ 必须 ✅ 必须
   AI 模型 ✅ 必须 ✅ 必须
   工作区 ✅ 默认 ✅ 可配置
   Gateway 端口 ✅ 默认 18789 ✅ 可配置
   绑定地址 ✅ loopback ✅ 可选择
   认证方式 ✅ token (自动生成) ✅ token/password
   Tailscale ❌ 不支持 ✅ 可配置
   频道配置 ❌ 跳过 ✅ 可配置
   Skills ❌ 跳过 ✅ 可配置
   守护进程 ✅ 自动安装 ✅ 可选
   远程 Gateway ❌ 不支持 ✅ 支持

6. 必须 vs 可选 - 详细分类
   必须配置 (无法跳过)
   ✅ 风险确认
   └─ 必须同意安全条款
   ✅ AI 模型选择
   ├─ 选择提供商 (OpenAI/Anthropic/等)
   ├─ 输入 API Key
   └─ 验证可用性
   ✅ 工作区路径
   └─ 可用默认值 ~/.openclaw/workspace
   可选配置 (可跳过或使用默认值)
   ⭐ 频道配置 (WhatsApp/Telegram/Discord/等)
   └─ 可完全跳过，后续用 `openclaw configure channels add` 添加
   ⭐ Skills 安装
   └─ 可跳过，后续用 `openclaw configure skills` 安装
   ⭐ Gateway 网络配置
   └─ QuickStart 使用默认值
   └─ Manual 可自定义
   ⭐ 守护进程安装
   └─ QuickStart 自动安装
   └─ Manual 可选择
   ⭐ Tailscale 配置
   └─ 仅 Manual 模式支持
   └─ 需要远程访问时配置

7. 跳过配置的命令

# 跳过频道配置

pnpm openclaw onboard --skip-channels

# 跳过 Skills 配置

pnpm openclaw onboard --skip-skills

# 跳过 UI 检查

pnpm openclaw onboard --skip-ui

# 跳过健康检查

pnpm openclaw onboard --skip-health

# 组合跳过

pnpm openclaw onboard --skip-channels --skip-skills --skip-ui

8. 后续修改配置
   所有可选配置都可以在 Wizard 完成后修改：

# 添加频道

pnpm openclaw configure channels add discord

# 配置 Skills

pnpm openclaw configure skills

# 修改 Gateway 设置

pnpm openclaw configure gateway

# 修改认证

pnpm openclaw configure gateway-auth

# 修改模型

pnpm openclaw configure model

9. 非交互式 Onboarding

# 完全自动化（需要所有必需参数）

pnpm openclaw onboard \
 --non-interactive \
 --accept-risk \
 --auth-choice openai-api-key \
 --openai-api-key "sk-..." \
 --install-daemon

10. 总结表
    配置项 必须 默认值 可跳过 后续修改
    风险确认 ✅ - ❌ -
    AI 模型 ✅ - ❌ ✅
    工作区 ✅ ~/.openclaw/workspace ✅ ✅
    Gateway 端口 ❌ 18789 ✅ ✅
    绑定地址 ❌ loopback ✅ ✅
    认证方式 ❌ token ✅ ✅
    频道 ❌ 无 ✅ ✅
    Skills ❌ 无 ✅ ✅
    守护进程 ❌ true ✅ ✅
    Tailscale ❌ off ✅ ✅
    核心要点： 只有 风险确认 和 AI 模型 是真正必须的，其他所有配置都可以跳过或后续修改。
