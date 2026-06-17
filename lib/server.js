const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const SessionManager = require('./session/manager');
const { tokenAuth } = require('./auth/token-auth');
const CrabClient = require('./bridge/crab-client');
const licenseGate = require('./license/gate');
const BackendClient = require('./bridge/backend-client');
const LocalStore = require('./team/store');

// CloseCrab desktop binary name(s). Older builds: closecrab-unified.exe;
// current builds: closecrab.exe. We probe both so process control works.
const EXE_NAMES = ['closecrab.exe', 'closecrab-unified.exe'];

// Holds the cloudflared tunnel child process so it can be killed on exit.
let tunnelProcess = null;

async function startServer(config) {
  // ── License gate (fail-closed) ──────────────────────────────────────────
  // CloseCrab-Web exposes a full PTY + process-control API; it must not run
  // unless this machine holds an active CloseCrab license with remote enabled.
  let license = { ok: false, reason: 'DISABLED' };
  if (config.licenseEnabled) {
    license = await licenseGate.check({
      backendUrl: config.backendUrl,
      offlineGraceDays: config.offlineGraceDays,
      baseDir: config.baseDir,
    });
    if (!license.ok) {
      console.error(`\n  ✗ CloseCrab-Web blocked — ${license.reason}`);
      console.error(`    ${license.detail || ''}\n`);
      process.exitCode = 1;
      return;
    }
    console.log(`\n  ✓ License OK (${licenseGate.maskKey(license.key)} · ${license.edition} · ${license.source})`);
  } else {
    console.warn('\n  ⚠ License gate DISABLED (--no-license) — do not expose this to a network.');
  }

  // ── Auth posture ────────────────────────────────────────────────────────
  if (config.authDisabled) {
    console.warn('  ⚠ Token auth DISABLED (--no-auth) — anyone who can reach this port gets a shell.');
  }

  const app = express();
  app.use(express.json());

  if (config.token) {
    app.use('/api', tokenAuth(config.token));
  }

  app.use(express.static(path.join(__dirname, 'web')));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  const sessionManager = new SessionManager({ baseDir: config.baseDir });
  const crabClient = new CrabClient({
    host: 'localhost',
    port: config.crabPort
  });

  // Team Mode: local persistent board + cloud (cross-host) board.
  const localStore = new LocalStore({ baseDir: config.baseDir });
  const backend = new BackendClient({
    backendUrl: config.backendUrl,
    key: license.ok ? license.key : null,
    deviceId: license.ok ? license.deviceId : null,
  });

  // Connected clients registry for Team Mode
  const connectedClients = new Map(); // clientId -> { clientId, username, connectedAt, ws }

  // REST API
  app.get('/api/sessions', (req, res) => {
    res.json(sessionManager.list());
  });

  app.post('/api/sessions', (req, res) => {
    try {
      const { workingDirectory } = req.body;
      const session = sessionManager.create({ workingDirectory });
      res.json(session);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/sessions/:id', (req, res) => {
    sessionManager.destroy(req.params.id);
    res.json({ ok: true });
  });

  app.get('/api/status', (req, res) => {
    res.json({
      version: require('../package.json').version,
      sessions: sessionManager.count(),
      runningWindows: sessionManager.runningWindows(),
      crabConnected: crabClient.isConnected(),
      hostname: os.hostname(),
      platform: os.platform(),
      uptime: process.uptime()
    });
  });

  // License/remote status for the mobile UI (no secrets — masked key only).
  app.get('/api/license-status', (req, res) => {
    res.json({
      licensed: !!license.ok,
      edition: license.ok ? license.edition : null,
      maskedKey: license.ok ? licenseGate.maskKey(license.key) : null,
      cloudTeam: backend.enabled,
      source: license.ok ? license.source : null,
    });
  });

  app.post('/api/bridge/command', async (req, res) => {
    const { action, payload } = req.body;
    try {
      const result = await crabClient.sendCommand(action, payload);
      res.json(result);
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  // Kill the CloseCrab-Unified process from mobile
  app.post('/api/kill-crab', (req, res) => {
    let killed = [];
    for (const name of EXE_NAMES) {
      try { execSync(`taskkill /F /IM ${name}`, { stdio: 'pipe' }); killed.push(name); } catch {}
    }
    res.json(killed.length
      ? { ok: true, message: `${killed.join(', ')} terminated` }
      : { ok: false, message: 'Process not running or already stopped' });
  });

  // === Dashboard API ===
  let backendProcess = null;
  let backendStartedAt = null;

  function isBackendRunning() {
    try {
      if (os.platform() === 'win32') {
        for (const name of EXE_NAMES) {
          const out = execSync(`tasklist /FI "IMAGENAME eq ${name}" /NH`, { stdio: 'pipe', encoding: 'utf8' });
          if (out.toLowerCase().includes(name.toLowerCase())) return true;
        }
        return false;
      } else {
        execSync('pgrep -f closecrab', { stdio: 'pipe' });
        return true;
      }
    } catch {
      return false;
    }
  }

  function getBackendPid() {
    try {
      if (os.platform() === 'win32') {
        for (const name of EXE_NAMES) {
          const out = execSync(`tasklist /FI "IMAGENAME eq ${name}" /FO CSV /NH`, { stdio: 'pipe', encoding: 'utf8' });
          const re = new RegExp('"' + name.replace('.', '\\.') + '","(\\d+)"', 'i');
          const match = out.match(re);
          if (match) return parseInt(match[1]);
        }
        return null;
      } else {
        const out = execSync('pgrep -f closecrab', { stdio: 'pipe', encoding: 'utf8' });
        return parseInt(out.trim().split('\n')[0]) || null;
      }
    } catch {
      return null;
    }
  }

  app.get('/api/backend-status', (req, res) => {
    const running = isBackendRunning();
    const pid = running ? getBackendPid() : null;
    let uptime = 0;
    if (running && backendStartedAt) {
      uptime = Math.floor((Date.now() - backendStartedAt) / 1000);
    }
    res.json({
      running,
      pid,
      uptime,
      clients: connectedClients.size
    });
  });

  app.post('/api/start-backend', (req, res) => {
    if (isBackendRunning()) {
      return res.json({ ok: true, message: 'Already running' });
    }
    try {
      let exeName = EXE_NAMES[0];
      for (const n of EXE_NAMES) { if (fs.existsSync(path.resolve(config.baseDir || '.', n))) { exeName = n; break; } }
      const exePath = path.resolve(config.baseDir || '.', exeName);
      backendProcess = spawn(exePath, [], {
        detached: true,
        stdio: 'ignore',
        cwd: config.baseDir || process.cwd()
      });
      backendProcess.unref();
      backendStartedAt = Date.now();
      res.json({ ok: true, message: 'Backend started', pid: backendProcess.pid });
    } catch (e) {
      res.json({ ok: false, message: 'Failed to start: ' + e.message });
    }
  });

  app.post('/api/stop-backend', (req, res) => {
    try {
      if (os.platform() === 'win32') {
        for (const name of EXE_NAMES) { try { execSync(`taskkill /F /IM ${name}`, { stdio: 'pipe' }); } catch {} }
      } else {
        execSync('pkill -f closecrab', { stdio: 'pipe' });
      }
      backendProcess = null;
      backendStartedAt = null;
      res.json({ ok: true, message: 'Backend stopped' });
    } catch {
      res.json({ ok: false, message: 'Process not running or already stopped' });
    }
  });

  app.post('/api/kill-all', (req, res) => {
    let killed = [];
    try {
      if (os.platform() === 'win32') {
        try { execSync('taskkill /F /IM closecrab-unified.exe', { stdio: 'pipe' }); killed.push('closecrab-unified.exe'); } catch {}
        try { execSync('taskkill /F /IM closecrab.exe', { stdio: 'pipe' }); killed.push('closecrab.exe'); } catch {}
        try { execSync('taskkill /F /IM closecrab-web.exe', { stdio: 'pipe' }); killed.push('closecrab-web.exe'); } catch {}
      } else {
        try { execSync('pkill -f closecrab', { stdio: 'pipe' }); killed.push('closecrab*'); } catch {}
      }
      backendProcess = null;
      backendStartedAt = null;
      res.json({ ok: true, message: killed.length ? `Killed: ${killed.join(', ')}` : 'No processes found', killed });
    } catch (e) {
      res.json({ ok: false, message: 'Error: ' + e.message });
    }
  });

  // Team Mode: Leaderboard. Returns BOTH the local (this-host) board and the
  // cloud (cross-host total) board so the phone can show two tabs.
  app.get('/api/leaderboard', async (req, res) => {
    const local = localStore.leaderboard(100);
    let cloud = [];
    if (backend.enabled) {
      cloud = await backend.leaderboard();
    }
    res.json({ local, cloud, cloudEnabled: backend.enabled });
  });

  // Team Mode: submit a game score. Persists locally and pushes to the cloud
  // board (fire-and-forget; cloud failure never blocks the local record).
  app.post('/api/team/score', async (req, res) => {
    const { username, score, badges } = req.body || {};
    const name = (username && String(username).trim()) || 'Anonymous';
    localStore.recordScore(name, score, badges);
    if (backend.enabled) {
      backend.pushScore({ username: name, score, badges }).catch(() => {});
    }
    res.json({ ok: true });
  });

  // Team Mode: Connected clients list (live, in-memory) + cloud online members.
  app.get('/api/clients', async (req, res) => {
    const local = [];
    for (const [clientId, client] of connectedClients) {
      local.push({
        clientId,
        username: client.username || 'Anonymous',
        connectedAt: client.connectedAt
      });
    }
    let cloud = [];
    if (backend.enabled) {
      cloud = await backend.online();
    }
    res.json({ local, cloud, cloudEnabled: backend.enabled });
  });

  // WebSocket keepalive
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 15000);
  wss.on('close', () => clearInterval(interval));

  // WebSocket: terminal I/O
  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    const url = new URL(req.url, `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('session');

    if (config.token) {
      const authToken = url.searchParams.get('token');
      if (authToken !== config.token) {
        ws.close(4001, 'Unauthorized');
        return;
      }
    }

    // Assign a unique clientId for Team Mode
    const clientId = crypto.randomUUID();
    ws.clientId = clientId;
    connectedClients.set(clientId, {
      clientId,
      username: 'Anonymous',
      connectedAt: new Date().toISOString(),
      score: 0,
      badges: [],
      ws
    });

    // Send the clientId to the client
    ws.send(JSON.stringify({ type: 'connected', clientId }));

    if (!sessionId || !sessionManager.has(sessionId)) {
      ws.close(4004, 'Session not found');
      return;
    }

    const session = sessionManager.get(sessionId);

    // Only send buffer on first connection (not reconnects)
    const isReconnect = url.searchParams.get('reconnect') === '1';
    if (!isReconnect && session.buffer.length > 0) {
      ws.send(JSON.stringify({ type: 'output', data: session.buffer }));
    }

    const onData = (data) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'output', data }));
      }
    };
    session.on('data', onData);

    ws.on('message', (msg) => {
      try {
        const parsed = JSON.parse(msg);
        if (parsed.type === 'input') {
          session.write(parsed.data);
        } else if (parsed.type === 'resize') {
          session.resize(parsed.cols, parsed.rows);
        } else if (parsed.type === 'register') {
          // Update username for this client
          const client = connectedClients.get(clientId);
          if (client && parsed.username) {
            client.username = parsed.username;
            // Announce presence to the cloud team board (fire-and-forget).
            if (backend.enabled) {
              backend.heartbeat({ username: parsed.username }).catch(() => {});
            }
          }
        }
      } catch {}
    });

    ws.on('close', () => {
      session.removeListener('data', onData);
      connectedClients.delete(clientId);
    });
  });

  server.listen(config.port, config.host, () => {
    const interfaces = os.networkInterfaces();
    console.log(`\n  CloseCrab-Web v${require('../package.json').version}`);
    console.log(`  ─────────────────────────────────────`);
    console.log(`  Local:   http://localhost:${config.port}`);

    for (const [name, addrs] of Object.entries(interfaces)) {
      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal) {
          console.log(`  LAN:     http://${addr.address}:${config.port}`);
        }
      }
    }

    if (config.token) {
      console.log(`  Auth:    Token required`);
      console.log(`  Token:   ${config.token}`);
      console.log(`  URL:     http://localhost:${config.port}/?token=${config.token}`);
    }
    console.log(`  Bridge:  ws://localhost:${config.crabPort}`);
    console.log(`  ─────────────────────────────────────\n`);

    // Auto-start a cloudflared tunnel so the phone can connect from any
    // network (different WiFi / mobile data) without a VPN or same-LAN.
    if (config.tunnel !== false) {
      startTunnel(config);
    }
  });

  crabClient.connect();
}

// startTunnel finds cloudflared and exposes the local web server publicly,
// printing the public URL (with token) the moment cloudflared reports it.
function startTunnel(config) {
  const candidates = [
    process.env.CLOUDFLARED_PATH,
    path.join(config.baseDir || '.', 'cloudflared.exe'),
    'G:/CMakePJ/CloseCrab-Unified/build/Release/cloudflared.exe',
    'G:/CMakePJ/CloseCrab-Unified/extensions/mobile-web/cloudflared.exe',
    'C:/Program Files/CloseCrab-Unified/cloudflared.exe',
  ].filter(Boolean);

  let cfPath = null;
  for (const p of candidates) { try { if (fs.existsSync(p)) { cfPath = p; break; } } catch {} }

  if (!cfPath) {
    console.log('  Tunnel:  cloudflared not found — local/LAN access only.');
    console.log('           (place cloudflared.exe next to the web app for remote access)\n');
    return;
  }

  try {
    tunnelProcess = spawn(cfPath, ['tunnel', '--url', `http://localhost:${config.port}`], {
      windowsHide: true,
    });
    let printed = false;
    const onChunk = (buf) => {
      const text = buf.toString();
      const m = text.match(/https:\/\/[^\s]+\.trycloudflare\.com/);
      if (m && !printed) {
        printed = true;
        const sep = config.token ? `/?token=${config.token}` : '';
        console.log(`\n  ✓ Remote access ready (works from any network):`);
        console.log(`    ${m[0]}${sep}\n`);
      }
    };
    tunnelProcess.stdout && tunnelProcess.stdout.on('data', onChunk);
    tunnelProcess.stderr && tunnelProcess.stderr.on('data', onChunk);
    tunnelProcess.on('error', (e) => console.log(`  Tunnel:  failed to start cloudflared (${e.message})`));
  } catch (e) {
    console.log(`  Tunnel:  failed to start cloudflared (${e.message})`);
  }
}

// Kill the tunnel child process when the web server exits.
function killTunnel() {
  if (tunnelProcess) {
    try { tunnelProcess.kill(); } catch {}
    tunnelProcess = null;
  }
}
process.on('exit', killTunnel);
process.on('SIGINT', () => { killTunnel(); process.exit(0); });
process.on('SIGTERM', () => { killTunnel(); process.exit(0); });

module.exports = { startServer };
