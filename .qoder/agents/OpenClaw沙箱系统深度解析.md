# OpenClaw沙箱系统深度解析

## 2.1 沙箱设计架构

### 三层控制机制

OpenClaw采用三层控制机制来管理工具执行环境：

#### 1. 沙箱运行时（Sandbox Runtime）

决定工具在何处执行：

- **Docker容器**：隔离环境中执行
- **宿主机**：直接在Gateway主机上执行
- **节点**：通过Bridge在远程节点执行

配置位置：`agents.defaults.sandbox.*` / `agents.list[].sandbox.*`

#### 2. 工具策略（Tool Policy）

决定哪些工具可用/被允许：

- 全局工具策略：`tools.*`
- 沙箱特定工具策略：`tools.sandbox.tools.*`
- 代理级别工具策略：`agents.list[].tools.*`

#### 3. 提权机制（Elevated Mode）

exec-only的逃逸舱口，允许在沙箱化时在主机上执行：

- 仅影响`exec`工具
- 不授予额外工具权限
- 需要明确启用和发送方白名单

配置位置：`tools.elevated.*` / `agents.list[].tools.elevated.*`

### 配置优先级层次

```
代理级别配置 > 全局配置 > 默认值
agents.list[].sandbox.* > agents.defaults.sandbox.* > 系统默认
```

### 运行时决策流程

当工具被调用时，OpenClaw按以下顺序做出决策：

1. **确定执行主机**：根据`tools.exec.host`配置决定运行环境
2. **应用工具策略**：检查工具是否在允许列表中且不在拒绝列表中
3. **检查沙箱状态**：如果启用了沙箱，应用沙箱特定的工具策略
4. **处理提权请求**：如果有提权标志，检查提权配置
5. **最终执行**：在确定的环境中执行工具

## 2.2 沙箱模式详解

### off模式（完全禁用）

```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "off"
      }
    }
  }
}
```

**特点：**

- 所有工具直接在宿主机上执行
- 性能最优，无容器开销
- 安全风险最高

**适用场景：**

- 受信任的内部开发环境
- 需要高性能的计算密集型任务
- 开发和调试阶段

**安全风险：**

- 工具可以直接访问完整的主机文件系统
- 可能执行破坏性操作
- 缺乏进程隔离

### non-main模式（非主会话沙箱化）

```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "non-main"
      }
    }
  }
}
```

**特点：**

- 主会话（main session）在宿主机执行
- 非主会话（群组/频道会话）在沙箱中执行
- 平衡了安全性和便利性

**适用场景：**

- 生产环境的标准配置
- 需要区分个人使用和团队协作的场景
- 对外提供服务但希望保护核心环境

**实际效果：**

- 个人聊天保持高性能
- 团队协作获得安全隔离
- 需要注意主会话的权限管理

### all模式（全会话沙箱化）

```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "all"
      }
    }
  }
}
```

**特点：**

- 所有会话都在沙箱中执行
- 最大安全性，最大隔离
- 性能开销相对较高

**适用场景：**

- 高安全要求的生产环境
- 处理敏感数据的场景
- 多用户共享环境

**性能考虑：**

- 容器启动时间延迟
- 资源消耗增加
- 文件系统I/O性能下降

## 2.3 作用域控制分析

### session级别（每会话独立容器）

```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "scope": "session"
      }
    }
  }
}
```

**安全优势：**

- 最强的会话隔离
- 会话间完全独立
- 容器生命周期与会话绑定

**资源影响：**

- 内存和CPU开销较大
- 容器创建/销毁频繁
- 适合短生命周期会话

### agent级别（代理共享容器）

```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "scope": "agent"
      }
    }
  }
}
```

**优化效果：**

- 同一代理的会话共享容器
- 减少容器创建开销
- 保持合理的隔离性

**安全考量：**

- 同代理会话间数据可能交叉
- 需要合理设计代理边界
- 适合长期运行的代理

### shared级别（全局共享容器）

```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "scope": "shared"
      }
    }
  }
}
```

**便利性：**

- 所有沙箱化会话共享一个容器
- 资源利用效率最高
- 启动速度最快

**安全风险：**

- 隔离性最弱
- 会话间数据完全共享
- 不同代理间也可能交叉污染

## 2.4 工作区访问控制

### none模式（沙箱专用工作区）

```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "workspaceAccess": "none"
      }
    }
  }
}
```

**安全特性：**

- 工具只能访问沙箱内专用工作区
- 位于`~/.openclaw/sandboxes`下
- 与主机文件系统完全隔离

**实用限制：**

- 无法访问主机上的项目文件
- 需要显式文件传输机制
- 技能文件需要镜像到沙箱

### ro模式（只读挂载）

```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "workspaceAccess": "ro"
      }
    }
  }
}
```

**平衡方案：**

- 将代理工作区以只读方式挂载到`/agent`
- 可以读取主机文件但不能修改
- 禁用`write`/`edit`/`apply_patch`工具

**适用场景：**

- 需要访问现有代码库的分析任务
- 代码审查和静态分析场景
- 数据处理但不需要修改源文件

### rw模式（读写挂载）

```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "workspaceAccess": "rw"
      }
    }
  }
}
```

**最大便利性：**

- 将工作区以读写方式挂载到`/workspace`
- 可以直接修改主机文件
- 功能最完整但风险最高

**安全风险：**

- 沙箱内工具可以修改主机文件
- 可能造成意外的数据损坏
- 需要严格的工具策略配合

## 沙箱配置最佳实践

### 生产环境推荐配置

```json
{
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
    "sandbox": {
      "tools": {
        "allow": ["group:runtime", "group:fs", "group:sessions"],
        "deny": ["exec", "bash"]
      }
    }
  }
}
```

### 高安全环境配置

```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "all",
        "scope": "session",
        "workspaceAccess": "none"
      }
    }
  },
  "tools": {
    "sandbox": {
      "tools": {
        "allow": ["read", "memory_search"],
        "deny": ["group:runtime", "group:fs", "exec", "bash", "write", "edit"]
      }
    }
  }
}
```

### 开发调试配置

```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "off"
      }
    }
  },
  "tools": {
    "exec": {
      "host": "gateway",
      "security": "allowlist",
      "ask": "always"
    }
  }
}
```

## 沙箱与工具策略交互

### 决策优先级

1. **工具策略检查**（最先）
   - 工具是否在全局允许列表中？
   - 工具是否在代理允许列表中？
   - 工具是否在拒绝列表中？

2. **沙箱策略检查**（其次）
   - 如果会话被沙箱化，应用沙箱工具策略
   - 沙箱策略可以进一步限制已允许的工具

3. **提权检查**（最后）
   - 如果请求提权执行，检查提权配置
   - 提权不改变工具策略，只改变执行环境

### 常见配置错误及解决方案

#### 错误1：工具被双重拒绝

```json
// 错误配置
{
  "tools": {
    "deny": ["exec"]
  },
  "tools": {
    "sandbox": {
      "tools": {
        "allow": ["exec"] // 无效，已被全局拒绝
      }
    }
  }
}
```

**解决方案：** 移除全局拒绝或调整策略优先级

#### 错误2：沙箱模式与工具主机配置冲突

```json
// 问题配置
{
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "off"
      }
    }
  },
  "tools": {
    "exec": {
      "host": "sandbox" // 矛盾：禁用沙箱但要求沙箱执行
    }
  }
}
```

**解决方案：** 统一沙箱模式和工具主机配置

#### 错误3：过度宽松的工作区访问

```json
// 风险配置
{
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "all",
        "workspaceAccess": "rw" // 高风险组合
      }
    }
  }
}
```

**解决方案：** 在全沙箱模式下使用`ro`或`none`工作区访问

## 监控和调试

### 沙箱状态检查命令

```bash
# 查看沙箱解释信息
openclaw sandbox explain
openclaw sandbox explain --session agent:main:main
openclaw sandbox explain --agent work
openclaw sandbox explain --json
```

### 输出信息解读

命令会显示：

- 生效的沙箱模式/作用域/工作区访问
- 当前会话是否被沙箱化
- 生效的沙箱工具允许/拒绝策略
- 提权门控和修复键路径

通过这些信息可以准确诊断沙箱相关的问题并进行针对性调整。
