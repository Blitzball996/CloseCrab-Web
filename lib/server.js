const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const os = require('os');
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

    if (!sessionId || !sessionManager.has(sessionId)) {
      ws.close(4004, 'Session not found');
      return;
    }

    const session = sessionManager.get(sessionId);

    if (session.buffer.length > 0) {
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
        }
      } catch {}
    });

    ws.on('close', () => {
      session.removeListener('data', onData);
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
