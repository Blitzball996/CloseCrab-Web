<div align="center">

[English](README.md) | **中文**

</div>

# CloseCrab-Web

[CloseCrab-Unified](https://github.com/Blitzball996/CloseCrab-Unified) 的手机端 Web 遥控界面。

随时随地用手机控制你的 AI 编程助手 — 通过 Tailscale、ZeroTier 或 Cloudflare Tunnel。

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 特性

- **仪表板控制面板** — 所有会话、系统指标和快捷操作的可视化概览
- **团队模式** — 排行榜、客户端路由、在线成员跟踪（后端启用团队模式时）
- **一键启动器** — `start.bat` / `start.sh` 双击启动 + 自动打开浏览器
- **进程终止** — 通过 `/api/kill` 端点远程终止 CloseCrab
- **9 个随机小游戏** — 等待 CloseCrab 启动时随机加载一个（贪吃蛇、俄罗斯方块、弹球、坦克大战、马里奥、下100层、泡泡堂、赛车、迷你 DOOM）
- **内联思考动画** — 用一条波浪动画条替代手机上重复堆叠的 "Waiting for response..." 文字
- **触屏优化终端** — 滑动操作、快捷键栏、手机友好输入框
- **公司 Logo 品牌化** — 会话列表水印背景、空状态居中 Logo
- **Token 认证** — 安全的远程访问
- **自动重连** — 优雅处理 iOS Safari 后台/前台切换

## 快速开始

```bash
git clone https://github.com/Blitzball996/CloseCrab-Web.git
cd CloseCrab-Web
npm install
node bin/cli.js
```

手机打开 `http://localhost:3000`，点 "New Session" 开始。

## 工作原理

```
手机 (Tailscale/ZeroTier) → CloseCrab-Web :3000 → CloseCrab CLI (PTY)
                                                 → CloseCrab Bridge :9002 (WebSocket)
```

两种通信方式：
- **PTY 模式**：通过 node-pty 提供完整终端体验（交互式）
- **Bridge 模式**：通过 WebSocket 连接 9002 端口发送结构化 JSON 命令（程序化）

## 远程访问

### 方案一：Tailscale（推荐）

1. 电脑和手机都安装 Tailscale
2. 用同一个账号登录
3. 手机访问 `http://<电脑Tailscale-IP>:3000`

### 方案二：ZeroTier（国内更友好）

1. 电脑和手机都安装 ZeroTier
2. 加入同一个网络
3. 手机访问 `http://<电脑ZeroTier-IP>:3000`

### 方案三：Cloudflare Tunnel（内置）

CloseCrab-Unified 启动时会自动开启 cloudflared 隧道，终端会打印隧道 URL — 任何设备直接打开，无需 VPN。

## 使用方法

```bash
# 默认启动（端口 3000，绑定 0.0.0.0）
node bin/cli.js

# 自定义端口
node bin/cli.js --port 8080

# 带认证 Token
node bin/cli.js --token mysecrettoken

# 指定工作目录
node bin/cli.js /path/to/project

# 指定 CloseCrab Bridge 端口
node bin/cli.js --crab-port 9002
```

## API 接口

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/status` | GET | 服务器状态 |
| `/api/sessions` | GET | 列出会话 |
| `/api/sessions` | POST | 创建会话 |
| `/api/sessions/:id` | DELETE | 终止会话 |
| `/api/bridge/command` | POST | 向 CloseCrab Bridge 发送命令 |

## 认证方式

Token 传递方式（任选其一）：
- URL 参数：`?token=xxx`
- 请求头：`Authorization: Bearer xxx`
- 命令行：`--token xxx`
- 环境变量：`CLOSECRAB_TOKEN=xxx`

## 小游戏列表

每次创建会话时，等待 CloseCrab 启动期间会随机加载一个小游戏：

| 游戏 | 操作方式 | 说明 |
|------|----------|------|
| 贪吃蛇 | 方向键 / 滑动 | 经典贪吃蛇 |
| 俄罗斯方块 | 方向键 | 左右移动，上旋转，下硬降 |
| 弹球弹砖块 | 左右 | 挡板 + 球 + 砖块 |
| 坦克大战 | 方向键 + 开火 | 射击下降的敌人 |
| 马里奥跑酷 | 方向键 | 平台跳跃收集金币 |
| 下100层 | 左右 | 向下穿过平台，别碰天花板 |
| 泡泡堂 | 方向键 + 开火 | 放炸弹炸砖块 |
| 公路赛车 | 左右 | 伪3D赛车，躲避车辆 |
| 迷你 DOOM | 方向键 + 开火 | 射线投射 FPS |

## 环境要求

- Node.js >= 18
- CloseCrab-Unified（AI 助手本体）
- Tailscale / ZeroTier / Cloudflare Tunnel（远程访问）

## 许可证

MIT
