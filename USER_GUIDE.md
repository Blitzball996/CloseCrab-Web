# CloseCrab-Web 用户指南

## 什么是 CloseCrab-Web？

CloseCrab-Web 让你用手机控制电脑上的 AI 编程助手。

想象一下：你的电脑在跑 CloseCrab（AI 编程助手），你躺在沙发上，拿出手机，打开浏览器，就能跟 AI 对话、让它写代码。

它的工作方式：

```
你的手机 (浏览器) ──网络──> 你的电脑 (CloseCrab-Web 服务) ──> CloseCrab-Unified (AI)
```

---

## 安装和启动

### 你需要什么

- 一台装了 Node.js 18 或更高版本的电脑
- 电脑上已经安装了 CloseCrab-Unified
- 一部手机（或任何有浏览器的设备）

### 第一步：检查 Node.js

打开终端，输入：

```bash
node --version
```

如果显示 `v18.0.0` 或更高的版本号，就可以了。

如果没有安装 Node.js，去 https://nodejs.org 下载安装。

### 第二步：下载 CloseCrab-Web

```bash
git clone https://github.com/Blitzball996/CloseCrab-Web.git
cd CloseCrab-Web
```

### 第三步：安装依赖

```bash
npm install
```

等它跑完就行。

### 第四步：启动服务

```bash
node bin/cli.js
```

你会看到类似这样的输出：

```
  CloseCrab-Web v0.1.0
  ─────────────────────────────────────
  Local:   http://localhost:3000
  LAN:     http://192.168.1.100:3000
  Bridge:  ws://localhost:9002
  ─────────────────────────────────────
```

### 第五步：手机打开网址

拿出手机，打开浏览器，输入上面显示的 LAN 地址。比如：

```
http://192.168.1.100:3000
```

注意：手机和电脑必须在同一个 WiFi 网络下。

---

## 启动选项

你可以自定义启动参数：

```bash
# 改端口号
node bin/cli.js --port 8080

# 设置密码（Token 认证）
node bin/cli.js --token my-secret-password

# 指定工作目录
node bin/cli.js /path/to/your/project

# 全部组合
node bin/cli.js /my/project --port 8080 --token abc123
```

如果设置了 token，手机访问时需要在网址后面加上：

```
http://192.168.1.100:3000?token=my-secret-password
```

---

## 使用方法

### 创建 Session

1. 打开手机浏览器，进入 CloseCrab-Web 页面
2. 你会看到主页面，显示「No sessions yet」
3. 点击底部的 **New Session** 按钮
4. （可选）输入工作目录路径，或者留空使用默认目录
5. 点击 **Start**

### 发送消息

1. 创建 Session 后，会进入加载页面（有小游戏可以玩！）
2. 等 CloseCrab 启动完成，点击 **Enter Terminal** 按钮
3. 在底部输入框里打字
4. 点击发送按钮（↑）或按回车键发送

### 快捷键栏

终端下方有一排快捷按钮：

| 按钮 | 功能 | 什么时候用 |
|------|------|-----------|
| `^C` | 中断操作 | AI 卡住了，想停下来 |
| `Tab` | 自动补全 | 输入命令时补全 |
| `Esc` | 取消 | 取消当前输入 |
| `^Z` | 暂停 | 暂停当前进程 |
| `/help` | 帮助 | 查看所有命令 |
| `Yes` | 确认 | AI 问你是否允许操作时 |

### 小游戏（等待时玩）

当 CloseCrab 正在启动时，加载页面会显示一个随机小游戏：

- **贪吃蛇 (Snake)**：用方向键控制蛇吃食物
- **俄罗斯方块 (Tetris)**：左右移动，上键旋转，下键加速

这些游戏只是让你等待时不无聊，不影响 CloseCrab 的运行。

### Team 排行榜

1. 在主页面点击右上角的团队图标
2. 可以看到：
   - **排行榜**：所有连接用户的分数排名
   - **在线成员**：当前谁在线

第一次连接时会让你输入用户名，这个名字会显示在排行榜上。

### Dashboard 控制面板

主页面显示：

- **服务器状态**：Online（绿色）或 Offline（红色）
- **Session 列表**：所有正在运行的会话
- **Kill 按钮**（右上角电源图标）：强制关闭电脑上的 CloseCrab 进程

---

## 远程访问设置

默认情况下，手机和电脑必须在同一个 WiFi 下。如果你想在外面（比如咖啡店）用手机控制家里的电脑，需要设置远程访问。

### 方法一：Tailscale（推荐，最简单）

Tailscale 是一个免费的虚拟网络工具，让你的设备像在同一个局域网一样。

**电脑上：**

1. 去 https://tailscale.com 注册账号
2. 下载并安装 Tailscale
3. 登录你的账号
4. 记下你电脑的 Tailscale IP（类似 `100.x.x.x`）

**手机上：**

1. 在 App Store / Google Play 下载 Tailscale
2. 用同一个账号登录
3. 打开浏览器，输入：

```
http://100.x.x.x:3000
```

（把 `100.x.x.x` 换成你电脑的 Tailscale IP）

就这么简单！不需要改路由器设置，不需要公网 IP。

### 方法二：ZeroTier

ZeroTier 和 Tailscale 类似，也是免费的。

1. 去 https://zerotier.com 注册
2. 创建一个网络，记下 Network ID
3. 电脑和手机都安装 ZeroTier，加入同一个网络
4. 用 ZeroTier 分配的 IP 访问

### 方法三：Cloudflare Tunnel

如果你想用域名访问（比如 `crab.yourdomain.com`），可以用 Cloudflare Tunnel。

1. 注册 Cloudflare 账号，添加你的域名
2. 安装 cloudflared：

```bash
# Windows
winget install cloudflare.cloudflared

# macOS
brew install cloudflared

# Linux
sudo apt install cloudflared
```

3. 登录：

```bash
cloudflared tunnel login
```

4. 创建隧道：

```bash
cloudflared tunnel create closecrab
```

5. 配置隧道指向 CloseCrab-Web：

创建文件 `~/.cloudflared/config.yml`：

```yaml
tunnel: closecrab
credentials-file: ~/.cloudflared/xxxxx.json

ingress:
  - hostname: crab.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

6. 启动隧道：

```bash
cloudflared tunnel run closecrab
```

7. 在 Cloudflare DNS 里添加 CNAME 记录指向隧道

然后手机打开 `https://crab.yourdomain.com` 就能用了。

---

## 常见问题

### 手机连不上怎么办

1. **检查是否在同一个 WiFi**：手机和电脑必须连同一个网络
2. **检查 IP 地址**：确认你输入的是正确的 LAN IP
3. **检查防火墙**：
   - Windows：打开「Windows 安全中心」→「防火墙」→ 允许 Node.js 通过
   - macOS：系统偏好设置 → 安全性 → 防火墙 → 允许传入连接
4. **检查端口**：确认 3000 端口没有被其他程序占用

```bash
# 检查端口是否被占用
# Windows
netstat -ano | findstr :3000

# macOS / Linux
lsof -i :3000
```

5. **试试用 0.0.0.0**：启动时确保绑定到所有网卡

```bash
node bin/cli.js --host 0.0.0.0
```

### 断线重连

CloseCrab-Web 有自动重连功能：

- 如果网络断开，它会每 2 秒尝试重新连接
- 手机锁屏再解锁后，也会自动重连
- 重连后不会丢失之前的输出内容

如果自动重连失败：
1. 检查电脑上的 CloseCrab-Web 是否还在运行
2. 刷新手机浏览器页面
3. 如果还是不行，重启 CloseCrab-Web 服务

### 怎么设置密码

启动时加上 `--token` 参数：

```bash
node bin/cli.js --token my-secret-123
```

然后手机访问时在网址后面加 `?token=my-secret-123`：

```
http://192.168.1.100:3000?token=my-secret-123
```

你也可以用环境变量设置：

```bash
export CLOSECRAB_TOKEN=my-secret-123
node bin/cli.js
```

### CloseCrab 进程卡死怎么办

在手机上点击主页面右上角的电源图标（Kill 按钮），可以强制终止电脑上的 CloseCrab 进程。

### 怎么同时开多个 Session

1. 在主页面点击 **New Session**
2. 每个 Session 是独立的，可以在不同的项目目录工作
3. 点击 Session 卡片可以切换

---

## 快速参考

### 启动命令

```bash
# 最简单的启动方式
node bin/cli.js

# 带密码
node bin/cli.js --token abc123

# 指定端口和目录
node bin/cli.js /my/project --port 8080

# 查看帮助
node bin/cli.js --help
```

### 手机上的操作

| 操作 | 怎么做 |
|------|--------|
| 创建会话 | 点 New Session |
| 发送消息 | 输入文字，点 ↑ 或按回车 |
| 中断 AI | 点快捷栏的 ^C |
| 确认操作 | 点快捷栏的 Yes |
| 查看团队 | 点右上角团队图标 |
| 杀进程 | 点右上角电源图标 |
| 返回列表 | 点左上角 ← |

---

## 需要更多帮助？

- GitHub: https://github.com/Blitzball996/CloseCrab-Web
- Issues: https://github.com/Blitzball996/CloseCrab-Web/issues
