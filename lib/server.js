const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const SessionManager = require('./session/manager');
const { tokenAuth } = require('./auth/token-auth');
const CrabClient = require('./bridge/crab-client');

async function startServer(config) {
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
      crabConnected: crabClient.isConnected(),
      hostname: os.hostname(),
      platform: os.platform(),
      uptime: process.uptime()
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
    const { execSync } = require('child_process');
    try {
      execSync('taskkill /F /IM closecrab-unified.exe', { stdio: 'pipe' });
      res.json({ ok: true, message: 'closecrab-unified.exe terminated' });
    } catch (e) {
      res.json({ ok: false, message: 'Process not running or already stopped' });
    }
  });

  // Team Mode: Leaderboard (mock data for now, will be proxied to CloseCrab backend later)
  app.get('/api/leaderboard', (req, res) => {
    // Build leaderboard from connected clients with mock scores
    const entries = [];
    for (const [clientId, client] of connectedClients) {
      entries.push({
        clientId,
        username: client.username || 'Anonymous',
        score: client.score || Math.floor(Math.random() * 1000),
        badges: client.badges || []
      });
    }
    // Add some mock entries if no real clients
    if (entries.length === 0) {
      entries.push(
        { clientId: 'mock-1', username: 'CrabMaster', score: 2450, badges: ['Early Adopter', 'Speed Run'] },
        { clientId: 'mock-2', username: 'ShellHacker', score: 1820, badges: ['Bug Hunter'] },
        { clientId: 'mock-3', username: 'TerminalKing', score: 1540, badges: [] }
      );
    }
    entries.sort((a, b) => b.score - a.score);
    res.json(entries);
  });

  // Team Mode: Connected clients list
  app.get('/api/clients', (req, res) => {
    const clients = [];
    for (const [clientId, client] of connectedClients) {
      clients.push({
        clientId,
        username: client.username || 'Anonymous',
        connectedAt: client.connectedAt
      });
    }
    res.json(clients);
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
    }
    console.log(`  Bridge:  ws://localhost:${config.crabPort}`);
    console.log(`  ─────────────────────────────────────\n`);
  });

  crabClient.connect();
}

module.exports = { startServer };
