const { EventEmitter } = require('events');
const pty = require('node-pty');
const os = require('os');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class Session extends EventEmitter {
  constructor({ id, workingDir }) {
    super();
    this.id = id;
    this.workingDir = workingDir;
    this.buffer = '';
    this.ptyProcess = null;
    this.startTime = Date.now();
    this.alive = false;
  }

  start() {
    const isWindows = os.platform() === 'win32';
    const fs = require('fs');

    // Auto-detect CloseCrab exe location
    const candidates = [
      process.env.CLOSECRAB_PATH,
      // Installed via installer
      'C:/Program Files/CloseCrab-Unified/closecrab-unified.exe',
      path.join(process.env.LOCALAPPDATA || '', 'CloseCrab-Unified/closecrab-unified.exe'),
      // Dev build
      'G:/CMakePJ/CloseCrab-Unified/build/Release/closecrab-unified.exe',
    ].filter(Boolean);

    let CRAB_EXE = null;
    for (const p of candidates) {
      if (fs.existsSync(p)) { CRAB_EXE = p; break; }
    }
    if (!CRAB_EXE) {
      throw new Error('CloseCrab not found. Install it or set CLOSECRAB_PATH env var.');
    }

    const CRAB_DIR = path.dirname(CRAB_EXE);
    const shell = CRAB_EXE;
    const args = [];
    const cwd = CRAB_DIR;

    const env = {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '1'
    };

    if (isWindows) {
      const npmBin = path.join(process.env.APPDATA || '', 'npm');
      env.PATH = `${npmBin};${process.env.PATH || ''}`;
    }

    try {
      this.ptyProcess = pty.spawn(shell, args, {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: cwd,
        env
      });

      this.alive = true;

      this.ptyProcess.onData((data) => {
        this.buffer += data;
        if (this.buffer.length > 500000) {
          this.buffer = this.buffer.slice(-250000);
        }
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
    if (this.ptyProcess && this.alive) {
      this.ptyProcess.write(data);
    }
  }

  resize(cols, rows) {
    if (this.ptyProcess && this.alive) {
      this.ptyProcess.resize(cols, rows);
    }
  }

  destroy() {
    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }
    this.alive = false;
    this.removeAllListeners();
  }
}

class SessionManager {
  constructor({ baseDir }) {
    this.baseDir = baseDir || process.cwd();
    this.sessions = new Map();
  }

  create({ workingDirectory } = {}) {
    const id = uuidv4();
    const dir = workingDirectory
      ? path.resolve(this.baseDir, workingDirectory)
      : this.baseDir;

    const session = new Session({ id, workingDir: dir });
    session.start();
    this.sessions.set(id, session);

    session.on('exit', () => {
      // Keep session in list but mark as dead
    });

    return { id, workingDirectory: dir, startTime: session.startTime };
  }

  list() {
    return Array.from(this.sessions.entries()).map(([id, s]) => ({
      id,
      workingDirectory: s.workingDir,
      startTime: s.startTime,
      alive: s.alive
    }));
  }

  get(id) {
    return this.sessions.get(id) || null;
  }

  has(id) {
    return this.sessions.has(id);
  }

  count() {
    return this.sessions.size;
  }

  destroy(id) {
    const session = this.sessions.get(id);
    if (session) {
      session.destroy();
      this.sessions.delete(id);
    }
  }
}

module.exports = SessionManager;
