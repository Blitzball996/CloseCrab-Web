const { EventEmitter } = require('events');
const { WebSocket } = require('ws');
const pty = require('node-pty');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');

// CloseCrab desktop binary name(s). Older builds shipped 'closecrab-unified.exe';
// current builds ship 'closecrab.exe'. We probe both everywhere.
const EXE_NAMES = ['closecrab.exe', 'closecrab-unified.exe'];

// Resolve the CloseCrab install dir + exe once, shared by spawning AND by
// discovery (so transcripts are read from the same install the windows use).
function resolveCrabExe() {
  const DIRS = [
    'C:/Program Files/CloseCrab-Unified',
    path.join(process.env.LOCALAPPDATA || '', 'CloseCrab-Unified'),
    'G:/CMakePJ/CloseCrab-Unified/build/Release',
  ];
  const candidates = [process.env.CLOSECRAB_PATH];
  for (const d of DIRS) {
    if (!d) continue;
    for (const n of EXE_NAMES) candidates.push(path.join(d, n));
  }
  for (const p of candidates.filter(Boolean)) {
    if (fs.existsSync(p)) return { exe: p, dir: path.dirname(p) };
  }
  return { exe: null, dir: null };
}

class Session extends EventEmitter {
  constructor({ id, workingDir }) {
    super();
    this.id = id;
    this.workingDir = workingDir;
    this.buffer = '';
    this.ptyProcess = null;
    this.startTime = Date.now();
    this.alive = false;
    this.kind = 'spawned'; // 'spawned' (full control) | 'attached' (read-only mirror)
  }

  start() {
    const { exe: CRAB_EXE, dir: CRAB_DIR } = resolveCrabExe();
    if (!CRAB_EXE) {
      throw new Error('CloseCrab not found. Install it or set CLOSECRAB_PATH env var.');
    }
    const isWindows = os.platform() === 'win32';
    const shell = CRAB_EXE;
    const args = [];
    const cwd = CRAB_DIR;

    const env = {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '1',
      CLOSECRAB_WEB: '1'
    };
    if (isWindows) {
      const npmBin = path.join(process.env.APPDATA || '', 'npm');
      env.PATH = `${npmBin};${process.env.PATH || ''}`;
    }

    try {
      this.ptyProcess = pty.spawn(shell, args, {
        name: 'xterm-256color', cols: 120, rows: 30, cwd, env
      });
      this.alive = true;
      this.ptyProcess.onData((data) => {
        this.buffer += data;
        if (this.buffer.length > 500000) this.buffer = this.buffer.slice(-250000);
        this.emit('data', data);
      });
      this.ptyProcess.onExit(({ exitCode }) => {
        this.alive = false;
        this.emit('exit', exitCode);
      });
    } catch (e) {
      this.alive = false;
      throw new Error(`Failed to start CloseCrab: ${e.message}`);
    }
  }

  write(data) {
    if (this.ptyProcess && this.alive) this.ptyProcess.write(data);
  }
  resize(cols, rows) {
    if (this.ptyProcess && this.alive) this.ptyProcess.resize(cols, rows);
  }
  destroy() {
    if (this.ptyProcess) { this.ptyProcess.kill(); this.ptyProcess = null; }
    if (this._tail) { this._tail.stop(); this._tail = null; }
    this.alive = false;
    this.removeAllListeners();
  }
}

// AttachedSession: a READ-ONLY mirror of an already-running CloseCrab window.
// We can't inject keystrokes into another process's console on Windows, but
// CloseCrab appends every turn to data/transcripts/<id>.jsonl in real time.
// We replay the file as terminal output and tail it for live updates.
class AttachedSession extends EventEmitter {
  constructor({ id, jsonlPath, preview, port }) {
    super();
    this.id = id;
    this.workingDir = preview || '(running CloseCrab window)';
    this.buffer = '';
    this.startTime = Date.now();
    this.alive = true;
    this.kind = 'attached';
    this.jsonlPath = jsonlPath;
    this.port = port || null;
    this._offset = 0;
    this._watcher = null;
    this._injWs = null;
    this._injReady = false;
    this._injQueue = [];
    this._remoteClientId = null;
  }

  // Render one transcript entry into colored terminal text.
  _renderEntry(line) {
    let text = '';
    try {
      const m = JSON.parse(line);
      const role = m.role || 'user';
      const body = (m.text || '').trim();
      if (!body) return '';
      if (role === 'user') {
        text = `\r\n\x1b[36m\u203a You:\x1b[0m ${body}\r\n`;
      } else if (role === 'assistant') {
        text = `\r\n\x1b[32mCloseCrab:\x1b[0m ${body.replace(/\n/g, '\r\n')}\r\n`;
      } else {
        text = `\x1b[2m${body}\x1b[0m\r\n`;
      }
    } catch { return ''; }
    return text;
  }

  _drain() {
    let raw;
    try {
      const stat = fs.statSync(this.jsonlPath);
      if (stat.size <= this._offset) return;
      const fd = fs.openSync(this.jsonlPath, 'r');
      const len = stat.size - this._offset;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, this._offset);
      fs.closeSync(fd);
      this._offset = stat.size;
      raw = buf.toString('utf8');
    } catch { return; }

    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      const rendered = this._renderEntry(line);
      if (!rendered) continue;
      this.buffer += rendered;
      if (this.buffer.length > 500000) this.buffer = this.buffer.slice(-250000);
      this.emit('data', rendered);
    }
  }

  start() {
    // Replay the whole transcript into the buffer first.
    this._drain();
    // Then watch for appended lines (live mirror of the running window).
    try {
      this._watcher = fs.watch(this.jsonlPath, { persistent: false }, () => this._drain());
    } catch {}
    // fs.watch can miss events on some FS; poll as a safety net.
    this._poll = setInterval(() => this._drain(), 1500);
  }

  write(data) {
    if (!this.port) return;
    const text = (typeof data === 'string') ? data.replace(/\r$/g, '').replace(/\r/g, '') : '';
    if (!text.trim()) return;
    if (!this._injWs || this._injWs.readyState > 1) {
      this._injReady = false;
      this._injQueue.push(text);
      this._connectInj();
      return;
    }
    if (!this._injReady) { this._injQueue.push(text); return; }
    this._sendInj(text);
  }

  _connectInj() {
    if (this._injWs && this._injWs.readyState <= 1) return;
    this._injWs = new WebSocket(`ws://localhost:${this.port}`);
    this._injWs.on('open', () => {
      this._injWs.send(JSON.stringify({ type: 'register', username: 'web-inject' }));
    });
    this._injWs.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'connected') {
          this._remoteClientId = msg.clientId;
          this._injReady = true;
          for (const t of this._injQueue) this._sendInj(t);
          this._injQueue = [];
        }
        if (msg.type === 'text' && msg.content) {
          const rendered = `\r\n\x1b[32mCloseCrab:\x1b[0m ${msg.content.replace(/\n/g, '\r\n')}\r\n`;
          this.buffer += rendered;
          this.emit('data', rendered);
        } else if (msg.type === 'tool_use') {
          const rendered = `\r\n\x1b[33m[Tool: ${msg.tool}]\x1b[0m\r\n`;
          this.buffer += rendered;
          this.emit('data', rendered);
        } else if (msg.type === 'complete') {
          this.emit('data', '\r\n\x1b[2m(done)\x1b[0m\r\n');
        } else if (msg.type === 'error') {
          const rendered = `\r\n\x1b[31mError: ${msg.content}\x1b[0m\r\n`;
          this.buffer += rendered;
          this.emit('data', rendered);
        }
      } catch {}
    });
    this._injWs.on('close', () => { this._injReady = false; this._remoteClientId = null; });
    this._injWs.on('error', () => { this._injReady = false; });
  }

  _sendInj(text) {
    if (!this._injWs || this._injWs.readyState !== 1) return;
    this._injWs.send(JSON.stringify({ type: 'inject_main', message: text }));
    const echo = `\r\n\x1b[36m\u203a You:\x1b[0m ${text}\r\n`;
    this.buffer += echo;
    this.emit('data', echo);
  }

  resize() { /* no-op */ }

  destroy() {
    if (this._watcher) { try { this._watcher.close(); } catch {} this._watcher = null; }
    if (this._poll) { clearInterval(this._poll); this._poll = null; }
    if (this._injWs) { try { this._injWs.close(); } catch {} this._injWs = null; }
    this._injQueue = [];
    this.alive = false;
    this.removeAllListeners();
  }
}

// Discover running CloseCrab windows. Each window writes a port discovery file
// (data/mobile-ws-port-<PID>.json) containing {"pid":<N>,"port":<N>}.
// Returns array of {pid, port} for live windows, plus stale PIDs (tasklist).
function listRunningCrabWindows() {
  const { dir } = resolveCrabExe();
  const windows = []; // {pid, port}
  const pidsWithPort = new Set();

  // 1) Read port discovery files (written by each CloseCrab process)
  if (dir) {
    const dataDir = path.join(dir, 'data');
    try {
      for (const f of fs.readdirSync(dataDir)) {
        if (!f.startsWith('mobile-ws-port-') || !f.endsWith('.json')) continue;
        try {
          const info = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
          if (info.pid && info.port) {
            windows.push({ pid: info.pid, port: info.port });
            pidsWithPort.add(info.pid);
          }
        } catch {}
      }
    } catch {}
  }

  // 2) Also check tasklist for CloseCrab processes without port files (old builds)
  if (os.platform() === 'win32') {
    for (const name of EXE_NAMES) {
      try {
        const raw = execSync(`tasklist /FI "IMAGENAME eq ${name}" /FO CSV /NH`, {
          encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
        });
        for (const line of raw.split('\n')) {
          const m = line.match(/^"[^"]+","(\d+)"/);
          if (m) {
            const pid = parseInt(m[1], 10);
            if (!pidsWithPort.has(pid)) windows.push({ pid, port: null });
          }
        }
      } catch {}
    }
  }

  // Clean up stale port files (PID no longer running)
  if (dir) {
    const dataDir = path.join(dir, 'data');
    const livePids = new Set(windows.map(w => w.pid));
    try {
      for (const f of fs.readdirSync(dataDir)) {
        if (!f.startsWith('mobile-ws-port-') || !f.endsWith('.json')) continue;
        const pidMatch = f.match(/(\d+)\.json$/);
        if (pidMatch && !livePids.has(parseInt(pidMatch[1], 10))) {
          try { fs.unlinkSync(path.join(dataDir, f)); } catch {}
        }
      }
    } catch {}
  }

  return windows;
}

// Backward-compat wrapper
function listRunningCrabPids() {
  return listRunningCrabWindows().map(w => w.pid);
}

// Scan data/transcripts for existing sessions (newest first).
function listTranscripts() {
  const { dir } = resolveCrabExe();
  if (!dir) return { dir: null, items: [] };
  const tdir = path.join(dir, 'data', 'transcripts');
  let files;
  try { files = fs.readdirSync(tdir); } catch { return { dir, items: [] }; }
  const items = [];
  for (const f of files) {
    if (!f.endsWith('.jsonl')) continue;
    const full = path.join(tdir, f);
    let stat, preview = '', count = 0, mtime = 0;
    try { stat = fs.statSync(full); } catch { continue; }
    try {
      const text = fs.readFileSync(full, 'utf8');
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        count++;
        try {
          const m = JSON.parse(line);
          if (m.timestamp) { const ts = Math.floor(m.timestamp / 1000); if (ts > mtime) mtime = ts; }
          if (!preview && m.role === 'user' && m.text) {
            preview = m.text.length > 50 ? m.text.slice(0, 50) + '...' : m.text;
          }
        } catch {}
      }
    } catch {}
    if (count === 0) continue;
    items.push({ sessionId: f.replace(/\.jsonl$/, ''), jsonlPath: full, preview, messageCount: count, mtime: mtime || Math.floor(stat.mtimeMs / 1000) });
  }
  items.sort((a, b) => b.mtime - a.mtime);
  return { dir, items };
}

class SessionManager {
  constructor({ baseDir }) {
    this.baseDir = baseDir || process.cwd();
    this.sessions = new Map();
    this.attached = new Map(); // sessionId -> AttachedSession (lazy)
  }

  create({ workingDirectory } = {}) {
    const id = uuidv4();
    const dir = workingDirectory ? path.resolve(this.baseDir, workingDirectory) : this.baseDir;
    const session = new Session({ id, workingDir: dir });
    session.start();
    this.sessions.set(id, session);
    session.on('exit', () => { /* keep in list, marked dead */ });
    return { id, workingDirectory: dir, startTime: session.startTime, kind: 'spawned' };
  }

  // Lazily attach (read-only mirror) to an existing transcript.
  attach(sessionId) {
    if (this.attached.has(sessionId)) return this.attached.get(sessionId);
    const { items } = listTranscripts();
    const info = items.find((i) => i.sessionId === sessionId);
    if (!info) return null;
    const wins = listRunningCrabWindows();
    const transcripts = listTranscripts();
    const tIdx = transcripts.items.findIndex((i) => i.sessionId === sessionId);
    const win = (tIdx >= 0 && tIdx < wins.length) ? wins[tIdx] : null;
    const att = new AttachedSession({ id: sessionId, jsonlPath: info.jsonlPath, preview: info.preview, port: win ? win.port : null });
    att.start();
    this.attached.set(sessionId, att);
    return att;
  }

  list() {
    // 1) Web-spawned sessions (full control).
    const spawned = Array.from(this.sessions.entries()).map(([id, s]) => ({
      id, workingDirectory: s.workingDir, startTime: s.startTime, alive: s.alive, kind: 'spawned',
    }));
    // 2) Existing CloseCrab windows / saved sessions (read-only mirror).
    const runningWindows = listRunningCrabWindows();
    const runningCount = runningWindows.length;
    const { items } = listTranscripts();
    const existing = items.map((i, idx) => {
      const win = (idx < runningCount && runningWindows[idx]) ? runningWindows[idx] : null;
      const port = win ? win.port : null;
      return {
        id: i.sessionId,
        workingDirectory: i.preview || `(session ${i.sessionId})`,
        startTime: i.mtime * 1000,
        alive: idx < runningCount,
        kind: (idx < runningCount && port) ? 'control' : 'attached',
        messageCount: i.messageCount,
        port,
      };
    });
    // Spawned first, then existing (dedup by id).
    const seen = new Set(spawned.map((s) => s.id));
    return [...spawned, ...existing.filter((e) => !seen.has(e.id))];
  }

  // Count of live CloseCrab windows on this machine (for the header badge).
  runningWindows() { return listRunningCrabPids().length; }

  get(id) {
    if (this.sessions.has(id)) return this.sessions.get(id);
    if (this.attached.has(id)) return this.attached.get(id);
    return this.attach(id); // auto-attach existing transcript on demand
  }

  has(id) {
    return this.sessions.has(id) || this.attached.has(id) ||
      !!listTranscripts().items.find((i) => i.sessionId === id);
  }

  count() { return this.sessions.size; }

  destroy(id) {
    const s = this.sessions.get(id);
    if (s) { s.destroy(); this.sessions.delete(id); return; }
    const a = this.attached.get(id);
    if (a) { a.destroy(); this.attached.delete(id); }
  }
}

module.exports = SessionManager;
module.exports.listRunningCrabWindows = listRunningCrabWindows;

