# CloseCrab-Web 实施计划

## 项目概述

基于 Glad 核心代码，创建独立 Node.js Web 层，让用户从手机通过 Tailscale/ZeroTier 远程控制 CloseCrab。

## 项目结构

```
CloseCrab-Web/
├── package.json
├── bin/
│   └── cli.js                 # 入口命令
├── lib/
│   ├── server.js              # Express + WebSocket 主服务
│   ├── auth/
│   │   └── token-auth.js      # Token 认证中间件
│   ├── bridge/
│   │   └── crab-client.js     # WebSocket 客户端连接 CloseCrab:9002
│   ├── session/
│   │   ├── manager.js         # Session 管理
│   │   ├── pty-manager.js     # PTY 进程管理
│   │   └── buffer.js          # 输出缓冲
│   ├── config/
│   │   └── constants.js       # 配置常量
│   └── web/
│       ├── index.html         # 主页面（移动端优先）
│       ├── terminal.html      # 终端页面
│       ├── app.js             # 前端 JS
│       └── style.css          # 样式
├── config/
│   └── default.yaml           # 默认配置
├── scripts/
│   ├── start.bat              # Windows 一键启动
│   └── start.sh               # Linux/Mac 一键启动
├── README.md
└── .gitignore
```

## Phase 分解

### Phase 1: 核心 PTY 转发（MVP）
- 初始化项目 (package.json, 依赖)
- Express + WebSocket 服务器
- PTY 管理器（启动 CloseCrab CLI）
- Session 管理（创建/列表/销毁）
- 基础 Web 前端（终端 + xterm.js）
- **验收**: 浏览器打开 localhost:3000 能看到 CloseCrab 终端并交互

### Phase 2: Bridge 直连 + 认证
- WebSocket 客户端连接 CloseCrab:9002
- Token 认证中间件
- 配置文件支持
- **验收**: 能通过 API 调用 CloseCrab 命令并获取 JSON 响应

### Phase 3: 移动端优化
- 响应式布局
- 触摸快捷键面板
- 虚拟键盘适配
- **验收**: 手机浏览器体验流畅

### Phase 4: 打包 + 部署
- 一键启动脚本
- README 文档（含 Tailscale/ZeroTier 配置指南）
- npm 打包配置
- **验收**: 新用户按文档 5 分钟内跑起来

## 测试计划

1. 单元测试: Session 管理、Buffer、认证
2. 集成测试: 真实启动 CloseCrab + Web 服务，验证终端交互
3. 网络测试: 通过非 localhost IP 访问验证远程可用性
