# CloseCrab-Web

Mobile-friendly Web interface for [CloseCrab-Unified](https://github.com/Blitzball996/CloseCrab-Unified) remote control.

Access your AI coding assistant from your phone, anywhere — via Tailscale or ZeroTier.

## Quick Start

```bash
git clone https://github.com/Blitzball996/CloseCrab-Web.git
cd CloseCrab-Web
npm install
node bin/cli.js
```

Open `http://localhost:3000` in your browser. Click "+ New" to start a CloseCrab session.

## How It Works

```
Phone (Tailscale/ZeroTier) → CloseCrab-Web :3000 → CloseCrab CLI (PTY)
                                                  → CloseCrab Bridge :9002 (WebSocket)
```

Two communication channels:
- **PTY mode**: Full terminal experience via node-pty (interactive)
- **Bridge mode**: Structured JSON commands via WebSocket to port 9002 (programmatic)

## Remote Access (Phone from anywhere)

### Option 1: Tailscale (Recommended)

1. Install Tailscale on your PC: https://tailscale.com/download
2. Install Tailscale on your phone (App Store / Play Store)
3. Log in with the same account on both devices
4. Access `http://<PC-Tailscale-IP>:3000` from your phone browser

### Option 2: ZeroTier (Better for China mainland)

1. Install ZeroTier on PC: https://www.zerotier.com/download
2. Create a network at https://my.zerotier.com
3. Join the same network on both PC and phone
4. Authorize devices in the ZeroTier dashboard
5. Access `http://<PC-ZeroTier-IP>:3000` from your phone browser

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

## Requirements

- Node.js >= 18
- CloseCrab-Unified (for the AI assistant)
- Tailscale or ZeroTier (for remote access)

## License

MIT
