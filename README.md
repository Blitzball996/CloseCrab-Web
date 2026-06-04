<div align="center">

**English** | [中文](README.zh-CN.md)

</div>

# CloseCrab-Web

Mobile-friendly Web interface for [CloseCrab-Unified](https://github.com/Blitzball996/CloseCrab-Unified) remote control.

Access your AI coding assistant from your phone, anywhere — via Tailscale, ZeroTier, or Cloudflare Tunnel.

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Features

- **Dashboard Control Panel** — Visual overview of all sessions, system metrics, and quick actions
- **Team Mode** — Leaderboard, per-client routing, online member tracking (when backend Team Mode enabled)
- **One-Click Launcher** — `start.bat` / `start.sh` double-click to launch + auto-open browser
- **Process Termination** — Kill CloseCrab remotely via `/api/kill` endpoint
- **9 Random Mini-Games** while waiting for CloseCrab to load (Snake, Tetris, Breakout, Tank Battle, Mario Run, 100 Floors, Bomberman, Road Racer, Mini DOOM)
- **Inline Thinking Animation** — replaces the duplicated "Waiting for response..." spinner with a clean wave bar
- **Touch-Optimized Terminal** — swipe, quick-key bar, mobile-friendly input
- **Company Logo Branding** — watermark on session list, logo on empty state
- **Token-Based Auth** — secure remote access
- **Auto-Reconnect** — handles iOS Safari background/foreground gracefully

## Quick Start

```bash
git clone https://github.com/Blitzball996/CloseCrab-Web.git
cd CloseCrab-Web
npm install
node bin/cli.js
```

Open `http://localhost:3000` on your phone. Tap "New Session" to start.

## How It Works

```
Phone (Tailscale/ZeroTier) → CloseCrab-Web :3000 → CloseCrab CLI (PTY)
                                                  → CloseCrab Bridge :9002 (WebSocket)
```

Two communication channels:
- **PTY mode**: Full terminal experience via node-pty (interactive)
- **Bridge mode**: Structured JSON commands via WebSocket to port 9002 (programmatic)

## Remote Access

### Option 1: Tailscale (Recommended)

1. Install Tailscale on your PC and phone
2. Log in with the same account
3. Access `http://<PC-Tailscale-IP>:3000` from your phone

### Option 2: ZeroTier (Better for China mainland)

1. Install ZeroTier on PC and phone
2. Join the same network
3. Access `http://<PC-ZeroTier-IP>:3000` from your phone

### Option 3: Cloudflare Tunnel (Built-in)

CloseCrab-Unified auto-starts a cloudflared tunnel on launch. The tunnel URL is printed in the terminal — open it on any device, no VPN needed.

## Usage

```bash
# Start with defaults (port 3000, bind 0.0.0.0)
node bin/cli.js

# Custom port
node bin/cli.js --port 8080

# With authentication token
node bin/cli.js --token mysecrettoken

# Specify working directory
node bin/cli.js /path/to/project

# Specify CloseCrab bridge port
node bin/cli.js --crab-port 9002
```

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Server status |
| `/api/sessions` | GET | List sessions |
| `/api/sessions` | POST | Create session |
| `/api/sessions/:id` | DELETE | Kill session |
| `/api/bridge/command` | POST | Send command to CloseCrab Bridge |

## Authentication

Pass token via:
- Query param: `?token=xxx`
- Header: `Authorization: Bearer xxx`
- CLI flag: `--token xxx`
- Env var: `CLOSECRAB_TOKEN=xxx`

## Mini-Games

Each time you create a session, a random game loads while CloseCrab starts up:

| Game | Controls | Description |
|------|----------|-------------|
| Snake | D-pad / Swipe | Classic snake |
| Tetris | D-pad | L/R move, Up rotate, Down hard-drop |
| Breakout | L/R | Paddle + ball + bricks |
| Tank Battle | D-pad + Fire | Shoot descending enemies |
| Mario Run | D-pad | Platformer with coins |
| 100 Floors | L/R | Fall through platforms, avoid ceiling |
| Bomberman | D-pad + Fire | Place bombs, destroy bricks |
| Road Racer | L/R | Pseudo-3D racing, dodge cars |
| Mini DOOM | D-pad + Fire | Raycaster FPS |

## Requirements

- Node.js >= 18
- CloseCrab-Unified (for the AI assistant)
- Tailscale / ZeroTier / Cloudflare Tunnel (for remote access)

## License

MIT
