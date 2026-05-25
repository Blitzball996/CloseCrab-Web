# CloseCrab-Web User Guide

## What is CloseCrab-Web?

CloseCrab-Web lets you control your computer's AI coding assistant from your phone.

Picture this: your computer is running CloseCrab (an AI coding assistant). You're on the couch, you pull out your phone, open a browser, and start chatting with the AI to write code.

How it works:

```
Your Phone (browser) ──network──> Your Computer (CloseCrab-Web server) ──> CloseCrab-Unified (AI)
```

---

## Installation and Setup

### What You Need

- A computer with Node.js 18 or higher installed
- CloseCrab-Unified already installed on that computer
- A phone (or any device with a browser)

### Step 1: Check Node.js

Open a terminal and type:

```bash
node --version
```

If it shows `v18.0.0` or higher, you're good.

If Node.js is not installed, download it from https://nodejs.org.

### Step 2: Download CloseCrab-Web

```bash
git clone https://github.com/Blitzball996/CloseCrab-Web.git
cd CloseCrab-Web
```

### Step 3: Install Dependencies

```bash
npm install
```

Wait for it to finish.

### Step 4: Start the Server

```bash
node bin/cli.js
```

You will see output like this:

```
  CloseCrab-Web v0.1.0
  ─────────────────────────────────────
  Local:   http://localhost:3000
  LAN:     http://192.168.1.100:3000
  Bridge:  ws://localhost:9002
  ─────────────────────────────────────
```

### Step 5: Open on Your Phone

Take out your phone, open a browser, and enter the LAN address shown above. For example:

```
http://192.168.1.100:3000
```

Note: Your phone and computer must be on the same WiFi network.

---

## Startup Options

You can customize startup parameters:

```bash
# Change port number
node bin/cli.js --port 8080

# Set a password (token authentication)
node bin/cli.js --token my-secret-password

# Specify working directory
node bin/cli.js /path/to/your/project

# Combine all options
node bin/cli.js /my/project --port 8080 --token abc123
```

If you set a token, add it to the URL on your phone:

```
http://192.168.1.100:3000?token=my-secret-password
```

---

## How to Use

### Creating a Session

1. Open your phone browser and go to the CloseCrab-Web page
2. You will see the home page showing "No sessions yet"
3. Tap the **New Session** button at the bottom
4. (Optional) Enter a working directory path, or leave it empty for the default
5. Tap **Start**

### Sending Messages

1. After creating a session, you'll see a loading screen (with a mini-game to play!)
2. Wait for CloseCrab to finish starting, then tap **Enter Terminal**
3. Type in the input box at the bottom
4. Tap the send button (arrow up) or press Enter to send

### Quick Action Bar

Below the terminal, there's a row of shortcut buttons:

| Button | Function | When to Use |
|--------|----------|-------------|
| `^C` | Interrupt | AI is stuck, you want to stop it |
| `Tab` | Auto-complete | Complete a command while typing |
| `Esc` | Cancel | Cancel current input |
| `^Z` | Suspend | Pause current process |
| `/help` | Help | See all available commands |
| `Yes` | Confirm | When AI asks for permission to do something |

### Mini-Games (Play While Waiting)

When CloseCrab is starting up, the loading screen shows a random mini-game:

- **Snake**: Use direction controls to guide the snake to eat food
- **Tetris**: Move left/right, tap up to rotate, down to drop faster

These games are just for fun while you wait. They don't affect CloseCrab.

### Team Leaderboard

1. On the home page, tap the team icon in the top-right corner
2. You can see:
   - **Leaderboard**: Score rankings for all connected users
   - **Online Members**: Who is currently online

The first time you connect, you'll be asked to enter a username. This name appears on the leaderboard.

### Dashboard

The home page shows:

- **Server Status**: Online (green) or Offline (red)
- **Session List**: All running sessions
- **Kill Button** (power icon, top-right): Force-stop the CloseCrab process on your computer

---

## Remote Access Setup

By default, your phone and computer must be on the same WiFi. If you want to control your home computer from outside (like a coffee shop), you need to set up remote access.

### Option 1: Tailscale (Recommended, Easiest)

Tailscale is a free virtual network tool that makes your devices act like they're on the same local network.

**On your computer:**

1. Go to https://tailscale.com and create an account
2. Download and install Tailscale
3. Log in with your account
4. Note your computer's Tailscale IP (looks like `100.x.x.x`)

**On your phone:**

1. Download Tailscale from App Store / Google Play
2. Log in with the same account
3. Open your browser and enter:

```
http://100.x.x.x:3000
```

(Replace `100.x.x.x` with your computer's Tailscale IP)

That's it! No router changes needed, no public IP required.

### Option 2: ZeroTier

ZeroTier is similar to Tailscale and also free.

1. Go to https://zerotier.com and sign up
2. Create a network and note the Network ID
3. Install ZeroTier on both your computer and phone, join the same network
4. Access using the ZeroTier-assigned IP

### Option 3: Cloudflare Tunnel

If you want to use a domain name (like `crab.yourdomain.com`), use Cloudflare Tunnel.

1. Create a Cloudflare account and add your domain
2. Install cloudflared:

```bash
# Windows
winget install cloudflare.cloudflared

# macOS
brew install cloudflared

# Linux
sudo apt install cloudflared
```

3. Log in:

```bash
cloudflared tunnel login
```

4. Create a tunnel:

```bash
cloudflared tunnel create closecrab
```

5. Configure the tunnel to point to CloseCrab-Web:

Create file `~/.cloudflared/config.yml`:

```yaml
tunnel: closecrab
credentials-file: ~/.cloudflared/xxxxx.json

ingress:
  - hostname: crab.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

6. Start the tunnel:

```bash
cloudflared tunnel run closecrab
```

7. Add a CNAME record in Cloudflare DNS pointing to the tunnel

Then open `https://crab.yourdomain.com` on your phone.

---

## Troubleshooting

### Phone Can't Connect

1. **Check WiFi**: Phone and computer must be on the same network
2. **Check IP address**: Make sure you entered the correct LAN IP
3. **Check firewall**:
   - Windows: Open "Windows Security" > "Firewall" > Allow Node.js through
   - macOS: System Preferences > Security > Firewall > Allow incoming connections
4. **Check port**: Make sure port 3000 isn't used by another program

```bash
# Check if port is in use
# Windows
netstat -ano | findstr :3000

# macOS / Linux
lsof -i :3000
```

5. **Try binding to 0.0.0.0**: Make sure the server listens on all interfaces

```bash
node bin/cli.js --host 0.0.0.0
```

### Disconnection and Reconnection

CloseCrab-Web has automatic reconnection:

- If the network drops, it tries to reconnect every 2 seconds
- After locking and unlocking your phone, it reconnects automatically
- Previous output is preserved after reconnection

If auto-reconnect fails:
1. Check that CloseCrab-Web is still running on your computer
2. Refresh the browser page on your phone
3. If it still doesn't work, restart the CloseCrab-Web server

### How to Set a Password

Add the `--token` parameter when starting:

```bash
node bin/cli.js --token my-secret-123
```

Then add `?token=my-secret-123` to the URL on your phone:

```
http://192.168.1.100:3000?token=my-secret-123
```

You can also use an environment variable:

```bash
export CLOSECRAB_TOKEN=my-secret-123
node bin/cli.js
```

### CloseCrab Process is Frozen

Tap the power icon (Kill button) in the top-right corner of the home page on your phone. This force-terminates the CloseCrab process on your computer.

### How to Run Multiple Sessions

1. On the home page, tap **New Session**
2. Each session is independent and can work in different project directories
3. Tap a session card to switch between them

---

## Quick Reference

### Startup Commands

```bash
# Simplest way to start
node bin/cli.js

# With password
node bin/cli.js --token abc123

# Custom port and directory
node bin/cli.js /my/project --port 8080

# Show help
node bin/cli.js --help
```

### Phone Operations

| Action | How |
|--------|-----|
| Create session | Tap New Session |
| Send message | Type text, tap arrow up or press Enter |
| Interrupt AI | Tap ^C in quick bar |
| Confirm action | Tap Yes in quick bar |
| View team | Tap team icon (top-right) |
| Kill process | Tap power icon (top-right) |
| Go back | Tap left arrow (top-left) |

---

## Need More Help?

- GitHub: https://github.com/Blitzball996/CloseCrab-Web
- Issues: https://github.com/Blitzball996/CloseCrab-Web/issues
