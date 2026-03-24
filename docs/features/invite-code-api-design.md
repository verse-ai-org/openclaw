# 邀请码兑换接口 - 客户端开发文档

## 一、接口概述

| 项目 | 说明 |
|------|------|
| 接口名称 | 邀请码兑换 |
| 接口描述 | 客户端输入邀请码，通过 App 签名鉴权后，返回对应的 API Key 配置 |
| 请求方式 | `POST` |
| Content-Type | `application/json` |

---

## 二、接口地址

| 环境 | 地址 |
|------|------|
| 开发环境 | `POST https://{dev-host}/api/v1/app/member/invite-code/redeem` |
| 生产环境 | `POST https://{prod-host}/api/v1/app/member/invite-code/redeem` |

---

## 三、请求头

### 3.1 必填请求头

| Header | 类型 | 说明 | 示例 |
|--------|------|------|------|
| `X-App-Id` | String | 客户端 App 标识（内置于客户端） | `boss-simulator` |
| `X-Timestamp` | String | 请求时间戳（Unix 秒级），防重放攻击，**5 分钟内有效** | `1700000000` |
| `X-Nonce` | String | 随机字符串，防重放攻击 | `a1b2c3d4e5f6` |
| `X-Signature` | String | HMAC-SHA256 签名（见签名算法） | `9f8e7d6c5b4a3210...` |
| `Content-Type` | String | 固定值 | `application/json` |

### 3.2 可选请求头

| Header | 类型 | 说明 | 示例 |
|--------|------|------|------|
| `X-Device-Id` | String | 设备唯一标识，用于日志记录 | `device-uuid-12345` |
| `X-App-Version` | String | 客户端版本号，用于日志记录 | `1.0.0` |

---

## 四、请求体

### 4.1 请求参数

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `code` | String | 是 | 邀请码，格式 `BOSS-XXXX-XXXX` | `BOSS-A1B2-C3D4` |

### 4.2 请求示例

```json
{
  "code": "BOSS-A1B2-C3D4"
}
```

---

## 五、签名算法

### 5.1 签名步骤

1. **构造待签名字符串**
   ```
   app_id={app_id}&timestamp={timestamp}&nonce={nonce}&code={code}
   ```
   
   > **注意**：`code` 为请求体中的邀请码

2. **使用 HMAC-SHA256 计算签名**
   - 密钥：`app-secret`（由服务端分配，内置于客户端）
   - 算法：`HMAC-SHA256`
   - 输出：十六进制字符串

3. **将签名放入请求头 `X-Signature`**

### 5.2 签名示例

**假设参数：**
- `app-id`: `boss-simulator`
- `app-secret`: `your-app-secret`
- `timestamp`: `1700000000`
- `nonce`: `a1b2c3d4e5f6`
- `code`: `BOSS-A1B2-C3D4`

**待签名字符串：**
```
app_id=boss-simulator&timestamp=1700000000&nonce=a1b2c3d4e5f6&code=BOSS-A1B2-C3D4
```

---

## 六、响应体

### 6.1 成功响应

**HTTP Status**: `200 OK`

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "llm_api_key": "sk-xxx",
    "llm_base_url": "https://api.openai.com/v1",
    "tts_api_key": "tts-xxx",
    "other_key": "..."
  }
}
```

> **说明**：`data` 字段中的具体内容由邀请码绑定的 API Key 配置决定，不同邀请码返回的配置可能不同。

### 6.2 失败响应

**HTTP Status**: `200 OK`（业务错误也返回 200）

```json
{
  "code": 400,
  "message": "Invalid invite code"
}
```

### 6.3 常见错误码

| code | message | 说明 |
|------|---------|------|
| `401` | `Missing X-App-Id header` | 缺少必填请求头 |
| `401` | `Unknown app-id` | App ID 不合法 |
| `401` | `Request timestamp expired` | 时间戳超时（超过 5 分钟） |
| `401` | `Invalid signature` | 签名验证失败 |
| `400` | `Invalid invite code` | 邀请码不存在 |
| `400` | `Invite code is disabled` | 邀请码已被禁用 |
| `400` | `Invite code has reached its usage limit` | 邀请码已达使用上限 |
| `500` | `Service error, please try again later` | 服务内部错误 |

---

## 七、TypeScript 实现示例

### 7.1 类型定义

```typescript
// types.ts

/** 邀请码兑换请求 */
export interface InviteCodeRedeemRequest {
  code: string;
}

/** 邀请码兑换响应 */
export interface InviteCodeRedeemResponse {
  code: number;
  message: string;
  data?: ApiKeyConfig;
}

/** API Key 配置 */
export interface ApiKeyConfig {
  llm_api_key?: string;
  llm_base_url?: string;
  tts_api_key?: string;
  [key: string]: string | undefined;
}

/** 客户端配置 */
export interface ClientConfig {
  baseUrl: string;
  appId: string;
  appSecret: string;
  deviceId?: string;
  appVersion?: string;
}
```

### 7.2 签名工具类

```typescript
// signature.ts

import crypto from 'crypto';

/**
 * 生成 HMAC-SHA256 签名
 * @param appSecret App 密钥
 * @param appId App ID
 * @param timestamp 时间戳（秒级）
 * @param nonce 随机字符串
 * @param code 邀请码
 * @returns 十六进制签名字符串
 */
export function generateSignature(
  appSecret: string,
  appId: string,
  timestamp: string,
  nonce: string,
  code: string
): string {
  const signPayload = `app_id=${appId}&timestamp=${timestamp}&nonce=${nonce}&code=${code}`;
  return crypto
    .createHmac('sha256', appSecret)
    .update(signPayload)
    .digest('hex');
}

/**
 * 生成随机 nonce
 * @param length 长度，默认 12
 * @returns 随机字符串
 */
export function generateNonce(length: number = 12): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, length);
}

/**
 * 获取当前时间戳（秒级）
 * @returns 时间戳字符串
 */
export function getTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}
```

### 7.3 API 客户端

```typescript
// inviteCodeClient.ts

import { generateSignature, generateNonce, getTimestamp } from './signature';
import type { 
  ClientConfig, 
  InviteCodeRedeemRequest, 
  InviteCodeRedeemResponse 
} from './types';

/**
 * 邀请码兑换客户端
 */
export class InviteCodeClient {
  private readonly config: ClientConfig;

  constructor(config: ClientConfig) {
    this.config = config;
  }

  /**
   * 兑换邀请码
   * @param code 邀请码
   * @returns API Key 配置
   */
  async redeem(code: string): Promise<InviteCodeRedeemResponse> {
    const timestamp = getTimestamp();
    const nonce = generateNonce();
    const signature = generateSignature(
      this.config.appSecret,
      this.config.appId,
      timestamp,
      nonce,
      code
    );

    const headers: Record<string, string> = {
      'X-App-Id': this.config.appId,
      'X-Timestamp': timestamp,
      'X-Nonce': nonce,
      'X-Signature': signature,
      'Content-Type': 'application/json',
    };

    // 可选请求头
    if (this.config.deviceId) {
      headers['X-Device-Id'] = this.config.deviceId;
    }
    if (this.config.appVersion) {
      headers['X-App-Version'] = this.config.appVersion;
    }

    const url = `${this.config.baseUrl}/api/v1/app/member/invite-code/redeem`;
    const body: InviteCodeRedeemRequest = { code };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    return response.json();
  }
}
```

### 7.4 使用示例

```typescript
// example.ts

import { InviteCodeClient } from './inviteCodeClient';
import type { InviteCodeRedeemResponse } from './types';

async function main() {
  // 初始化客户端
  const client = new InviteCodeClient({
    baseUrl: 'https://api.example.com',
    appId: 'boss-simulator',
    appSecret: 'your-app-secret', // 从安全存储中获取
    deviceId: 'device-uuid-12345', // 可选
    appVersion: '1.0.0', // 可选
  });

  try {
    // 兑换邀请码
    const response: InviteCodeRedeemResponse = await client.redeem('BOSS-A1B2-C3D4');

    if (response.code === 200 && response.data) {
      console.log('兑换成功！');
      console.log('API Key 配置:', response.data);
      
      // 使用返回的配置
      const { llm_api_key, llm_base_url } = response.data;
      // ...
    } else {
      console.error('兑换失败:', response.message);
    }
  } catch (error) {
    console.error('请求异常:', error);
  }
}

main();
```

### 7.5 浏览器环境适配（使用 Web Crypto API）

如果需要在浏览器环境中使用（无 Node.js crypto 模块），可以使用 Web Crypto API：

```typescript
// signature.browser.ts

/**
 * 浏览器环境签名实现（使用 Web Crypto API）
 */
export async function generateSignatureBrowser(
  appSecret: string,
  appId: string,
  timestamp: string,
  nonce: string,
  code: string
): Promise<string> {
  const signPayload = `app_id=${appId}&timestamp=${timestamp}&nonce=${nonce}&code=${code}`;
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(appSecret);
  const messageData = encoder.encode(signPayload);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  
  // 转换为十六进制字符串
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 生成随机 nonce（浏览器环境）
 */
export function generateNonceBrowser(length: number = 12): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
}
```

---

## 八、调用流程图

```
┌─────────────┐                                    ┌─────────────┐
│   Client    │                                    │   Server    │
└──────┬──────┘                                    └──────┬──────┘
       │                                                  │
       │  1. 生成 timestamp, nonce                        │
       │  2. 构造签名字符串                               │
       │  3. 计算 HMAC-SHA256 签名                        │
       │                                                  │
       │  POST /api/v1/app/member/invite-code/redeem     │
       │  Headers: X-App-Id, X-Timestamp, X-Nonce,       │
       │           X-Signature, X-Device-Id, X-App-Version│
       │  Body: { "code": "BOSS-XXXX-XXXX" }             │
       │ ──────────────────────────────────────────────► │
       │                                                  │
       │                                          ┌───────┴───────┐
       │                                          │ 1. 验证 App-Id │
       │                                          │ 2. 验证时间戳  │
       │                                          │ 3. 验证签名    │
       │                                          │ 4. 查询邀请码  │
       │                                          │ 5. 检查状态    │
       │                                          │ 6. 原子递增    │
       │                                          │ 7. 返回配置    │
       │                                          └───────┬───────┘
       │                                                  │
       │  Response: { "code": 200, "data": {...} }       │
       │ ◄────────────────────────────────────────────── │
       │                                                  │
       ▼                                                  ▼
```

---

## 九、注意事项

1. **时间戳有效性**：请求时间戳必须在服务端时间的 **±5 分钟** 内，否则会被拒绝
2. **签名大小写**：签名比较不区分大小写，客户端可输出小写或大写
3. **邀请码格式**：邀请码格式为 `BOSS-XXXX-XXXX`，大小写敏感
4. **HTTPS**：生产环境必须使用 HTTPS
5. **App Secret 安全**：
   - 不要明文硬编码在源码中
   - 建议使用环境变量或安全存储
   - 不要将 secret 提交到版本控制系统

---

## 十、测试环境配置

开发环境测试参数（仅供开发调试）：

| 参数 | 值 |
|------|------|
| `X-App-Id` | `boss-simulator` |
| `app-secret` | `boss-simulator-dev-secret-change-in-prod` |

> **警告**：生产环境的 `app-secret` 会在部署时配置，请向服务端开发者获取。
