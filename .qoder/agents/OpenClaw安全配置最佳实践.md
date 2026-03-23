# OpenClaw安全配置最佳实践指南

## 3.1 核心安全配置模板

### 最小权限原则配置

#### 基础安全配置模板

```json
{
  "gateway": {
    "bind": "loopback",
    "auth": {
      "mode": "token",
      "token": "your-secure-generated-token-here"
    },
    "controlUi": {
      "enabled": true,
      "allowedOrigins": ["https://your-domain.com"],
      "dangerouslyDisableDeviceAuth": false
    },
    "trustedProxies": ["127.0.0.1", "::1"]
  },
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "non-main",
        "scope": "session",
        "workspaceAccess": "ro"
      }
    }
  },
  "tools": {
    "profile": "messaging",
    "allow": [],
    "deny": ["group:runtime", "exec", "bash", "process"],
    "sandbox": {
      "tools": {
        "allow": ["read", "memory_search", "message"],
        "deny": ["exec", "bash", "write", "edit"]
      }
    },
    "elevated": {
      "enabled": false
    }
  }
}
```

#### 零信任网络配置

```json
{
  "gateway": {
    "bind": "loopback",
    "auth": {
      "mode": "token"
    },
    "controlUi": {
      "allowedOrigins": ["https://trusted-control-ui.example.com"],
      "dangerouslyAllowHostHeaderOriginFallback": false
    },
    "trustedProxies": [],
    "allowRealIpFallback": false
  },
  "logging": {
    "redactSensitive": "all"
  }
}
```

#### 监控告警配置

```json
{
  "logging": {
    "level": "info",
    "redactSensitive": "all",
    "redactPatterns": [
      "password\\s*=\\s*[\"'][^\"']*[\"']",
      "token\\s*=\\s*[\"'][^\"']*[\"']",
      "secret\\s*=\\s*[\"'][^\"']*[\"']"
    ]
  },
  "security": {
    "auditOnStartup": true,
    "auditIntervalMinutes": 60
  }
}
```

## 3.2 沙箱安全策略

### 工具组策略配置

#### 生产环境标准策略

```json
{
  "tools": {
    "profile": "messaging",
    "sandbox": {
      "tools": {
        "allow": ["group:fs", "group:sessions", "group:memory", "message"],
        "deny": ["group:runtime", "exec", "bash", "process", "gateway"]
      }
    }
  }
}
```

#### 高安全环境策略

```json
{
  "tools": {
    "profile": "minimal",
    "allow": ["message", "memory_search"],
    "deny": [
      "group:runtime",
      "group:fs",
      "group:automation",
      "exec",
      "bash",
      "write",
      "edit",
      "apply_patch",
      "gateway",
      "nodes"
    ],
    "sandbox": {
      "tools": {
        "allow": ["memory_search", "message"],
        "deny": ["group:runtime", "group:fs", "exec", "bash"]
      }
    }
  }
}
```

#### 开发环境宽松策略

```json
{
  "tools": {
    "profile": "development",
    "sandbox": {
      "tools": {
        "allow": ["group:runtime", "group:fs", "group:sessions", "group:memory"]
      }
    },
    "exec": {
      "host": "sandbox",
      "security": "allowlist",
      "ask": "always"
    }
  }
}
```

### 提权机制安全配置

#### 严格禁用提权

```json
{
  "tools": {
    "elevated": {
      "enabled": false
    }
  },
  "agents": {
    "list": [
      {
        "id": "production-agent",
        "tools": {
          "elevated": {
            "enabled": false
          }
        }
      }
    ]
  }
}
```

#### 有条件提权配置

```json
{
  "tools": {
    "elevated": {
      "enabled": true,
      "allowFrom": {
        "whatsapp": ["+1234567890"],
        "telegram": ["@trusted_admin"],
        "discord": ["123456789012345678"]
      }
    }
  }
}
```

### 容器网络安全策略

#### 基础网络隔离

```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "docker": {
          "network": "none",
          "readOnlyRoot": true,
          "user": "1000:1000",
          "ulimits": {
            "nofile": 1024,
            "nproc": 512
          }
        }
      }
    }
  }
}
```

#### 浏览器沙箱网络配置

```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "browser": {
          "network": "openclaw-sandbox-browser",
          "cdpSourceRange": "172.21.0.1/32",
          "allowHostControl": false
        }
      }
    }
  }
}
```

## 3.3 插件安全管理

### 插件白名单机制

```json
{
  "plugins": {
    "enabled": true,
    "allow": ["@openclaw/voice-call", "@openclaw/browser-control", "custom-plugin-id"],
    "deny": ["untrusted-plugin-*", "experimental-*"]
  }
}
```

### 插件权限限制配置

```json
{
  "agents": {
    "list": [
      {
        "id": "secure-agent",
        "plugins": {
          "entries": {
            "voice-call": {
              "enabled": true,
              "permissions": ["microphone", "audio-output"]
            },
            "browser-control": {
              "enabled": true,
              "permissions": ["tabs", "active-tab"]
            }
          }
        }
      }
    ]
  }
}
```

### 插件安全审计配置

```json
{
  "security": {
    "pluginValidation": {
      "requireSignature": true,
      "allowedAuthors": ["openclaw", "verified-partner"],
      "scanDependencies": true
    }
  }
}
```

## 3.4 多租户安全方案

### OS级隔离推荐配置

```bash
# 用户级隔离方案
# 创建专用用户
sudo useradd -m -s /bin/bash openclaw-user1
sudo useradd -m -s /bin/bash openclaw-user2

# 为每个用户配置独立的OpenClaw实例
sudo -u openclaw-user1 openclaw config set gateway.bind loopback
sudo -u openclaw-user2 openclaw config set gateway.bind loopback
```

### VPS分离部署方案

```yaml
# docker-compose.yml for multi-tenant deployment
version: "3.8"
services:
  openclaw-tenant1:
    image: openclaw/openclaw:latest
    volumes:
      - ./tenant1-data:/home/node/.openclaw
    ports:
      - "18789:18789"
    environment:
      - OPENCLAW_GATEWAY_TOKEN=tenant1-token-here

  openclaw-tenant2:
    image: openclaw/openclaw:latest
    volumes:
      - ./tenant2-data:/home/node/.openclaw
    ports:
      - "18790:18789"
    environment:
      - OPENCLAW_GATEWAY_TOKEN=tenant2-token-here
```

### 会话标签安全使用

```json
{
  "agents": {
    "list": [
      {
        "id": "team-alpha",
        "sessionTags": ["team:alpha", "security:high"],
        "tools": {
          "allow": ["read", "memory_search"],
          "deny": ["exec", "write"]
        }
      },
      {
        "id": "team-beta",
        "sessionTags": ["team:beta", "security:standard"],
        "tools": {
          "allow": ["read", "memory_search", "message"],
          "deny": ["exec"]
        }
      }
    ]
  }
}
```

## 场景化安全配置模板

### 企业内部部署

```json
{
  "gateway": {
    "bind": "lan",
    "auth": {
      "mode": "token",
      "token": "enterprise-long-token-here"
    },
    "controlUi": {
      "allowedOrigins": ["https://internal-dashboard.company.com"],
      "dangerouslyDisableDeviceAuth": false
    },
    "trustedProxies": ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]
  },
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "all",
        "scope": "session",
        "workspaceAccess": "ro"
      }
    }
  },
  "tools": {
    "profile": "corporate",
    "sandbox": {
      "tools": {
        "allow": ["group:fs", "group:memory", "message"],
        "deny": ["group:runtime", "exec", "gateway"]
      }
    }
  }
}
```

### 个人开发者环境

```json
{
  "gateway": {
    "bind": "loopback",
    "auth": {
      "mode": "token"
    },
    "controlUi": {
      "enabled": true
    }
  },
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "non-main",
        "scope": "agent",
        "workspaceAccess": "rw"
      }
    }
  },
  "tools": {
    "profile": "development",
    "sandbox": {
      "tools": {
        "allow": ["group:runtime", "group:fs", "group:sessions"]
      }
    },
    "exec": {
      "security": "allowlist",
      "ask": "on-miss"
    }
  }
}
```

### 高安全研究环境

```json
{
  "gateway": {
    "bind": "loopback",
    "auth": {
      "mode": "token"
    },
    "controlUi": {
      "dangerouslyDisableDeviceAuth": false
    }
  },
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "all",
        "scope": "session",
        "workspaceAccess": "none",
        "docker": {
          "network": "none",
          "readOnlyRoot": true,
          "user": "nobody:nogroup"
        }
      }
    }
  },
  "tools": {
    "profile": "minimal",
    "allow": ["memory_search"],
    "deny": ["group:*"],
    "sandbox": {
      "tools": {
        "allow": ["memory_search"],
        "deny": ["*"]
      }
    },
    "elevated": {
      "enabled": false
    }
  }
}
```

## 安全配置验证清单

### 部署前检查

- [ ] 运行 `openclaw security audit --deep`
- [ ] 验证认证模式不是"none"
- [ ] 确认绑定地址不是"0.0.0.0"
- [ ] 检查是否有危险配置选项启用
- [ ] 验证插件白名单配置

### 运行时监控

- [ ] 定期执行安全审计
- [ ] 监控异常工具调用
- [ ] 检查沙箱容器状态
- [ ] 审核访问日志
- [ ] 验证凭证轮换

### 应急响应准备

- [ ] 建立安全事件响应流程
- [ ] 准备快速隔离方案
- [ ] 维护安全配置备份
- [ ] 建立凭证撤销机制
- [ ] 准备系统恢复预案

通过遵循这些安全配置最佳实践，可以显著提升OpenClaw部署的安全性，降低潜在风险。
