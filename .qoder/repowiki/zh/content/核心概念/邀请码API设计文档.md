# 邀请码API设计文档

<cite>
**本文档引用的文件**
- [invite-code-api-design.md](file://docs/features/invite-code-api-design.md)
- [invite-code-client.ts](file://ui/src/ui/invite-code-client.ts)
- [app-invite-code.ts](file://ui/src/ui/app-invite-code.ts)
- [onboarding-validate.ts](file://apps/electron/src/main/onboarding-validate.ts)
- [ElectronWizardAdapter.ts](file://ui-react/src/adapters/ElectronWizardAdapter.ts)
- [index.ts](file://apps/electron/src/main/index.ts)
- [setup.tsx](file://ui-react/src/setup.tsx)
- [invite-code.ts](file://ui-react/src/lib/invite-code.ts)
</cite>

## 更新摘要
**变更内容**
- 新增HMAC-SHA256请求签名机制的详细实现规范
- 新增环境感知的API端点解析机制
- 新增加密随机nonce生成的安全规范
- 更新Electron桥接层的IPC通信协议
- 完善后端验证逻辑的错误处理机制
- 增强跨平台兼容性的实现细节

## 目录
1. [简介](#简介)
2. [系统架构](#系统架构)
3. [核心组件](#核心组件)
4. [HMAC-SHA256签名机制](#hmac-sha256签名机制)
5. [环境感知的API端点解析](#环境感知的api端点解析)
6. [加密随机nonce生成](#加密随机nonce生成)
7. [实现详情](#实现详情)
8. [Electron桥接层](#electron桥接层)
9. [后端验证逻辑](#后端验证逻辑)
10. [前端集成](#前端集成)
11. [错误处理与故障排除](#错误处理与故障排除)
12. [总结](#总结)

## 简介

邀请码验证系统是Boss Simulator项目中的关键功能模块，现已完全实现并投入使用。该系统允许客户端通过输入有效的邀请码来获取相应的API密钥配置，采用基于HMAC-SHA256的签名认证机制，确保请求的安全性和完整性。

系统支持多种平台（Web、Electron、移动应用），通过严格的验证机制防止重放攻击和篡改。完整的功能链路由UI层、Electron桥接层、后端验证逻辑组成，形成了一个安全可靠的身份验证解决方案。

**更新** 新增了环境感知的API端点解析、加密随机nonce生成等安全增强功能，进一步提升了系统的安全性和可靠性。

## 系统架构

邀请码验证系统采用分层架构设计，确保了良好的可维护性和扩展性：

```mermaid
graph TB
subgraph "UI层"
A[invite-code-client.ts<br/>客户端实现]
B[app-invite-code.ts<br/>应用集成]
C[setup.tsx<br/>React应用入口]
D[invite-code.ts<br/>React UI客户端]
end
subgraph "Electron桥接层"
E[ElectronWizardAdapter.ts<br/>适配器]
F[index.ts<br/>IPC处理器]
end
subgraph "后端验证层"
G[onboarding-validate.ts<br/>验证逻辑]
H[外部API<br/>api.boss-simulator.ai]
end
subgraph "安全机制层"
I[HMAC-SHA256签名<br/>时间戳防重放]
J[加密随机nonce<br/>随机性保证]
K[环境感知端点解析<br/>开发/生产环境分离]
end
subgraph "数据库层"
L[邀请码数据库<br/>状态验证]
end
A --> B
B --> C
C --> D
D --> E
E --> F
F --> G
G --> H
G --> I
G --> J
G --> K
G --> L
H --> L
```

**图表来源**
- [ElectronWizardAdapter.ts:132-147](file://ui-react/src/adapters/ElectronWizardAdapter.ts#L132-L147)
- [index.ts:208-220](file://apps/electron/src/main/index.ts#L208-L220)
- [onboarding-validate.ts:323-338](file://apps/electron/src/main/onboarding-validate.ts#L323-L338)

## 核心组件

### API客户端类 (InviteCodeClient)

InviteCodeClient是整个邀请码系统的客户端核心，负责处理所有与后端API的通信。

**主要功能特性：**
- HMAC-SHA256签名生成
- 邀请码格式验证
- 请求头自动构建
- 错误处理和重试机制
- **新增** 环境感知的配置管理

**关键方法：**
- `redeem(code: string)`: 执行邀请码兑换操作
- `validateCodeFormat(code: string)`: 验证邀请码格式
- `generateSignature(...)`: 生成HMAC-SHA256签名
- `getClientConfig(isDev: boolean)`: 获取环境感知的配置

### 应用集成模块 (verifyInviteCode)

该模块提供了高层的应用程序集成接口，简化了邀请码验证流程。

**核心功能：**
- 输入验证和格式检查
- 错误消息映射
- 状态管理和错误处理
- 与主应用状态同步

### Electron适配器 (ElectronWizardAdapter)

Electron平台的专用适配器，负责与主进程通信。

**核心功能：**
- IPC通信封装
- 邀请码验证委托
- 错误处理和日志记录
- 与UI组件的集成

**章节来源**
- [invite-code-client.ts:125-213](file://ui/src/ui/invite-code-client.ts#L125-L213)
- [app-invite-code.ts:31-106](file://ui/src/ui/app-invite-code.ts#L31-L106)
- [ElectronWizardAdapter.ts:132-147](file://ui-react/src/adapters/ElectronWizardAdapter.ts#L132-L147)

## HMAC-SHA256签名机制

系统采用HMAC-SHA256算法确保请求的完整性和真实性，这是邀请码验证的核心安全机制。

### 签名算法实现

```mermaid
flowchart TD
Start([开始签名过程]) --> BuildPayload["构建待签名字符串<br/>app_id=&timestamp=&nonce=&code="]
BuildPayload --> GetSecret["获取App密钥"]
GetSecret --> Hash["计算HMAC-SHA256"]
Hash --> Hex["转换为十六进制字符串"]
Hex --> End([返回签名])
style Start fill:#e1f5fe
style End fill:#e8f5e8
style Hash fill:#fff3e0
```

**图表来源**
- [invite-code-client.ts:73-100](file://ui/src/ui/invite-code-client.ts#L73-L100)

**签名算法特点：**
- 使用Web Crypto API确保跨平台兼容性
- 支持Node.js和浏览器环境
- 时间戳防重放攻击（±5分钟窗口）
- 随机数防止重放攻击

### 签名算法规范

**待签名字符串格式：**
```
app_id={appId}&timestamp={timestamp}&nonce={nonce}&code={code}
```

**签名生成步骤：**
1. 构造待签名字符串
2. 使用HMAC-SHA256算法计算签名
3. 将结果转换为十六进制字符串
4. 将签名放入X-Signature请求头

**章节来源**
- [invite-code-client.ts:73-100](file://ui/src/ui/invite-code-client.ts#L73-L100)
- [invite-code.ts:50-74](file://ui-react/src/lib/invite-code.ts#L50-L74)

## 环境感知的API端点解析

系统实现了智能的环境感知机制，能够根据运行环境自动选择合适的API端点。

### 端点解析策略

```mermaid
flowchart TD
Start([获取API端点]) --> CheckEnv{"检查环境变量<br/>INVITE_CODE_API_BASE_URL"}
CheckEnv --> |存在| UseEnv[使用环境变量配置]
CheckEnv --> |不存在| CheckPackaged{"检查应用打包状态<br/>app.isPackaged"}
CheckPackaged --> |已打包| UseProd[使用生产环境端点]
CheckPackaged --> |开发模式| UseDev[使用开发环境端点]
UseEnv --> End([返回端点])
UseProd --> End
UseDev --> End
```

**图表来源**
- [onboarding-validate.ts:326-338](file://apps/electron/src/main/onboarding-validate.ts#L326-L338)

### 端点配置规范

**开发环境配置：**
- 基础URL：`http://localhost:8080`
- App ID：`boss-simulator`
- App Secret：开发专用密钥

**生产环境配置：**
- 基础URL：`https://verse-ai-service-production-22b8.up.railway.app`
- App ID：`boss-simulator`
- App Secret：生产专用密钥

**章节来源**
- [onboarding-validate.ts:326-338](file://apps/electron/src/main/onboarding-validate.ts#L326-L338)
- [invite-code.ts:19-35](file://ui-react/src/lib/invite-code.ts#L19-L35)

## 加密随机nonce生成

系统实现了加密安全的随机nonce生成机制，确保每次请求的唯一性和安全性。

### Nonce生成算法

```mermaid
flowchart TD
Start([生成Nonce]) --> GenRandom["生成随机字节数组"]
GenRandom --> Convert["转换为十六进制字符串"]
Convert --> ValidateLength{"验证长度<br/>默认12位"}
ValidateLength --> |不足| PadZero["补零填充"]
ValidateLength --> |足够| ReturnNonce[返回Nonce]
PadZero --> ReturnNonce
ReturnNonce --> End([完成])
```

**图表来源**
- [invite-code-client.ts:107-114](file://ui/src/ui/invite-code-client.ts#L107-L114)

### Nonce安全特性

**随机性保证：**
- 使用加密安全的随机数生成器
- 避免可预测的序列模式
- 每次请求生成唯一值

**长度规范：**
- 默认长度：12个字符
- 格式：十六进制字符串
- 验证：确保长度符合要求

**章节来源**
- [invite-code-client.ts:107-114](file://ui/src/ui/invite-code-client.ts#L107-L114)
- [invite-code.ts:77-84](file://ui-react/src/lib/invite-code.ts#L77-L84)

## 实现详情

### 请求头设计

系统定义了严格的安全请求头规范：

| 请求头 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| `X-App-Id` | String | ✓ | 客户端App标识 | `boss-simulator` |
| `X-Timestamp` | String | ✓ | Unix秒级时间戳 | `1700000000` |
| `X-Nonce` | String | ✓ | 随机字符串 | `a1b2c3d4e5f6` |
| `X-Signature` | String | ✓ | HMAC-SHA256签名 | `9f8e7d6c5b4a3210...` |
| `Content-Type` | String | ✓ | 固定值 | `application/json` |

**可选请求头：**
- `X-Device-Id`: 设备唯一标识
- `X-App-Version`: 客户端版本号

**章节来源**
- [invite-code-client.ts:155-169](file://ui/src/ui/invite-code-client.ts#L155-L169)

## Electron桥接层

### IPC处理器实现

Electron主进程通过IPC处理邀请码验证请求：

```mermaid
sequenceDiagram
participant UI as React UI
participant Adapter as ElectronWizardAdapter
participant IPC as IPC层
participant Main as 主进程
participant Backend as 后端API
UI->>Adapter : validateInviteCode(code)
Adapter->>IPC : window.electronBridge.validateInviteCode(code)
IPC->>Main : ipcMain.handle("onboarding : validateInviteCode", code)
Main->>Backend : validateInviteCode(code)
Backend->>Backend : 验证邀请码格式
Backend->>Backend : 调用外部API
Backend-->>Main : 返回验证结果
Main-->>IPC : 返回验证结果
IPC-->>Adapter : 返回验证结果
Adapter-->>UI : 返回验证结果
```

**图表来源**
- [index.ts:208-220](file://apps/electron/src/main/index.ts#L208-L220)
- [ElectronWizardAdapter.ts:132-147](file://ui-react/src/adapters/ElectronWizardAdapter.ts#L132-L147)

**章节来源**
- [index.ts:208-220](file://apps/electron/src/main/index.ts#L208-L220)
- [ElectronWizardAdapter.ts:132-147](file://ui-react/src/adapters/ElectronWizardAdapter.ts#L132-L147)

## 后端验证逻辑

### 邀请码验证流程

后端验证逻辑实现了完整的邀请码验证流程：

```mermaid
flowchart TD
Start([开始验证]) --> Trim["去除空白字符并转大写"]
Trim --> FormatCheck{"格式检查<br/>BOSS-XXXX-XXXX"}
FormatCheck --> |否| InvalidFormat[格式错误]
FormatCheck --> |是| ResolveEndpoint["环境感知端点解析"]
ResolveEndpoint --> FetchAPI["调用外部API验证"]
FetchAPI --> ResponseOK{"响应状态"}
ResponseOK --> |404/410| NotExists[邀请码不存在或已使用]
ResponseOK --> |429| TooMany[请求过于频繁]
ResponseOK --> |其他| ParseResponse[解析响应]
ParseResponse --> ValidateFields{"验证必需字段"}
ValidateFields --> |缺失| InvalidResponse[响应无效]
ValidateFields --> |完整| Success[验证成功]
InvalidFormat --> ErrorReturn[返回错误]
NotExists --> ErrorReturn
TooMany --> ErrorReturn
InvalidResponse --> ErrorReturn
Success --> ReturnResult[返回结果]
```

**图表来源**
- [onboarding-validate.ts:279-341](file://apps/electron/src/main/onboarding-validate.ts#L279-L341)

**验证规则：**
- 邀请码格式：`BOSS-XXXX-XXXX`（字母数字）
- 最大重试次数：15秒超时
- 错误码映射：404/410 → 邀请码不存在，429 → 请求过于频繁

**章节来源**
- [onboarding-validate.ts:279-341](file://apps/electron/src/main/onboarding-validate.ts#L279-L341)

## 前端集成

### React应用集成

UI React应用通过适配器模式集成邀请码验证功能：

**核心功能：**
- 邀请码输入和验证
- 状态管理和错误处理
- 与Electron主进程通信
- 自动配置持久化

**集成流程：**
1. 用户输入邀请码
2. 适配器调用IPC方法
3. 主进程执行后端验证
4. 结果返回并更新UI状态
5. 成功时自动保存配置

**章节来源**
- [setup.tsx:15-45](file://ui-react/src/setup.tsx#L15-L45)
- [ElectronWizardAdapter.ts:132-147](file://ui-react/src/adapters/ElectronWizardAdapter.ts#L132-L147)

## 错误处理与故障排除

### 错误处理机制

系统实现了完整的错误处理和用户友好消息映射：

```mermaid
flowchart TD
Request[请求处理] --> CheckFormat{"邀请码格式正确?"}
CheckFormat --> |否| FormatError[格式错误]
CheckFormat --> |是| SendRequest[发送请求]
SendRequest --> ResponseCode{"响应码"}
ResponseCode --> |200| Success[验证成功]
ResponseCode --> |400| BusinessError[业务错误]
ResponseCode --> |401| AuthError[认证错误]
ResponseCode --> |403| Forbidden[访问被禁止]
ResponseCode --> |429| RateLimit[请求过于频繁]
ResponseCode --> |500| ServerError[服务器错误]
ResponseCode --> |503| ServiceUnavailable[服务不可用]
BusinessError --> MapMessage[映射用户友好消息]
AuthError --> MapMessage
Forbidden --> MapMessage
RateLimit --> MapMessage
ServerError --> MapMessage
ServiceUnavailable --> MapMessage
Success --> SaveConfig[保存配置到应用状态]
MapMessage --> ShowError[显示错误消息]
FormatError --> ShowError
SaveConfig --> Complete[完成]
ShowError --> Complete
```

**图表来源**
- [app-invite-code.ts:58-127](file://ui/src/ui/app-invite-code.ts#L58-L127)

**错误码映射：**
- `400`: 邀请码无效或已使用
- `401`: 认证失败（检查App凭据）
- `403`: 访问被禁止（邀请码禁用或过期）
- `429`: 请求过于频繁
- `500`: 服务器错误
- `503`: 服务暂时不可用

### 故障排除指南

**常见问题诊断：**

**1. 邀请码格式错误**
- 检查邀请码是否符合`BOSS-XXXX-XXXX`格式
- 确认大小写是否正确
- 验证连字符位置

**2. 网络连接问题**
- 检查API端点URL是否正确
- 验证网络连接状态
- 查看防火墙设置

**3. 服务器错误**
- 检查服务器日志
- 验证数据库连接
- 监控服务器资源使用情况

**4. Electron桥接问题**
- 确认IPC通道是否正常
- 检查主进程日志
- 验证渲染进程权限

**章节来源**
- [app-invite-code.ts:99-105](file://ui/src/ui/app-invite-code.ts#L99-L105)

## 总结

邀请码验证系统已完全实现并投入使用，通过严格的签名认证机制、完善的错误处理和灵活的配置管理，为用户提供了一个安全可靠的API密钥获取解决方案。

系统的主要优势包括：

1. **安全性**：采用HMAC-SHA256签名和时间戳防重放机制
2. **可靠性**：完善的错误处理和用户友好消息映射
3. **可维护性**：清晰的代码结构和详细的文档说明
4. **可扩展性**：支持多平台部署和灵活的配置管理
5. **实时性**：通过Electron桥接实现实时的邀请码验证
6. **环境感知**：智能的API端点解析机制
7. **加密安全**：基于加密安全的随机nonce生成

通过遵循本设计文档的规范，开发者可以轻松理解和使用邀请码功能，并根据具体需求进行定制和扩展。系统已经过充分测试，具备生产环境部署的条件。

**更新** 新增的HMAC-SHA256签名机制、环境感知的API端点解析、加密随机nonce生成等功能，进一步增强了系统的安全性和可靠性，为用户提供了更加完善的身份验证解决方案。