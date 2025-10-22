[根目录](../../CLAUDE.md) > **VCPDistributedServer**

# VCPDistributedServer 分布式服务器模块

## 变更记录 (Changelog)

- 2025-09-30 19:47:17: 初始化模块文档

## 模块职责

VCPDistributedServer 是 VCPChat 的分布式网络组件，使客户端能够作为 VCP 分布式网络的节点参与协作。它提供了插件系统、工具注册、跨节点通信等功能，是 VCP 生态系统的重要组成部分。

## 模块结构

### 核心服务器
- **VCPDistributedServer.js** - 分布式服务器主类，管理连接、插件和工具注册

### 插件系统
- **Plugin.js** - 插件管理器，负责插件的加载、初始化和生命周期管理

### 插件目录
- **Plugin/** - 各种功能插件
  - **VCPEverything/** - 全局文件搜索插件，基于 Everything API
  - **MusicController/** - 音乐控制插件，提供音乐播放控制功能
  - **DeepMemo/** - 深度记忆插件，提供长期记忆存储
  - **VCPSuperDice/** - 超级骰子插件，3D物理骰子功能
  - **TableLampRemote/** - 台灯遥控插件，智能家居控制示例
  - **WaitingForUrReply/** - 等待回复插件，智能提醒功能
  - **DistImageServer/** - 分布式图片服务器插件
  - **MediaShot/** - 媒体截图插件
  - **FileOperator/** - 文件操作插件
  - **ChatRoomViewer/** - 聊天室查看器插件

## 核心功能特性

### 分布式连接管理
- WebSocket 连接到主 VCP 服务器
- 自动重连机制和心跳检测
- IP 地址自动报告和注册
- 负载均衡和故障转移

### 插件系统
- 动态插件加载和卸载
- 插件依赖管理
- 插件配置和环境变量支持
- 插件生命周期管理

### 工具注册与调用
- 插件工具自动注册到主服务器
- 跨节点工具调用支持
- 参数验证和结果处理
- 异步任务执行支持

### 文件API集成
- 分布式文件访问支持
- Base64 数据传输
- 文件路径解析和转换
- 跨平台兼容性

## 插件开发指南

### 插件结构
每个插件目录应包含：
- **plugin-manifest.json** - 插件清单文件，定义插件元数据
- **主程序文件** - .js 或 .py 文件，实现插件功能
- **config.env** - 配置文件（可选）
- **README.md** - 说明文档（可选）

### 插件清单示例
```json
{
  "name": "示例插件",
  "version": "1.0.0",
  "description": "插件功能描述",
  "main": "plugin.js",
  "type": "tool",
  "dependencies": [],
  "permissions": ["file_read", "network"]
}
```

### 插件API
插件需要实现以下接口：
- `initialize(config)` - 插件初始化
- `getTools()` - 返回工具列表
- `executeTool(toolName, params)` - 执行工具调用
- `cleanup()` - 插件清理

## 配置管理

### 服务器配置
- **config.env** - 分布式服务器配置
  - `DIST_SERVER_PORT` - 服务器端口
  - `DEBUG_MODE` - 调试模式开关
  - `SERVER_NAME` - 服务器名称

### 插件配置
每个插件可以有自己的配置文件，支持环境变量和JSON格式配置。

## 通信协议

### 与主服务器通信
- WebSocket 连接: `ws://main-server:port/vcp-distributed-server/VCP_Key={key}`
- 心跳包: 定期发送保持连接
- 工具调用: JSON-RPC 格式的工具调用协议
- 文件传输: Base64 编码的文件数据

### 插件间通信
- 通过主服务器路由消息
- 支持直接节点间通信（如果配置允许）
- 事件广播和订阅机制

## 安全机制

### 认证授权
- VCP_Key 认证机制
- 插件权限控制
- 访问日志记录

### 数据安全
- 传输加密（可选）
- 敏感信息脱敏
- 插件沙箱隔离

## 性能优化

### 连接管理
- 连接池复用
- 自动重连和指数退避
- 连接健康检查

### 资源管理
- 插件资源限制
- 内存使用监控
- 垃圾回收优化

## 常见问题 (FAQ)

### Q: 如何开发新插件？
A: 参考现有插件目录结构，创建 plugin-manifest.json 和主程序文件，实现必要的接口方法。

### Q: 插件如何访问本地文件？
A: 通过插件权限系统和 FileOperator 插件提供的文件API，需要在 manifest 中声明相应权限。

### Q: 如何调试插件？
A: 启用 DEBUG_MODE，查看控制台日志，使用插件开发工具进行调试。

### Q: 分布式节点如何发现彼此？
A: 通过主服务器的节点注册和发现机制，节点可以向主服务器报告自己的存在和服务能力。

## 相关文件清单

### 核心文件
- VCPDistributedServer.js - 分布式服务器主类
- Plugin.js - 插件管理器
- config.env - 服务器配置文件

### 插件示例
- Plugin/VCPEverything/ - 文件搜索插件
- Plugin/MusicController/ - 音乐控制插件
- Plugin/DeepMemo/ - 深度记忆插件

### 工具脚本
- README.md - 插件开发指南
- plugin-manifest.json.* - 插件清单模板

---

*本文档由 AI 自动生成，最后更新时间: 2025-09-30 19:47:17*