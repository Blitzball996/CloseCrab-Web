let currentSessionId = null;
let ws = null;
let term = null;
let fitAddon = null;

const API_BASE = '';

function getToken() {
  const params = new URLSearchParams(window.location.search);
  return params.get('token') || '';
}

function apiHeaders() {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function fetchSessions() {
  const token = getToken();
  const url = token ? `/api/sessions?token=${token}` : '/api/sessions';
  const res = await fetch(url, { headers: apiHeaders() });
  if (!res.ok) return [];
  return res.json();
}

async function refreshSessionList() {
  const sessions = await fetchSessions();
  const list = document.getElementById('sessions-list');

  if (sessions.length === 0) {
    list.innerHTML = '<div class="empty-state">No active sessions.<br>Tap "+ New" to start CloseCrab.</div>';
    return;
  }

  list.innerHTML = sessions.map(s => `
    <div class="session-card" onclick="openSession('${s.id}')">
      <div class="session-id">${s.id.slice(0, 8)}...</div>
      <div class="session-dir">${s.workingDirectory}</div>
      <div class="session-status ${s.alive ? 'alive' : 'dead'}">
        ${s.alive ? 'Running' : 'Exited'}
      </div>
    </div>
  `).join('');
}

async function createSession() {
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({})
  });

  if (res.ok) {
    const session = await res.json();
    openSession(session.id);
  } else {
    const err = await res.json();
    alert('Failed: ' + (err.error || 'Unknown error'));
  }
}

function openSession(id) {
  currentSessionId = id;
  document.getElementById('sessions-panel').style.display = 'none';
  document.getElementById('header').style.display = 'none';
  document.getElementById('terminal-container').style.display = 'flex';
  document.getElementById('terminal-title').textContent = id.slice(0, 8) + '...';

  initTerminal();
  connectWebSocket(id);
}

function showSessions() {
  document.getElementById('sessions-panel').style.display = 'block';
  document.getElementById('header').style.display = 'flex';
  document.getElementById('terminal-container').style.display = 'none';

  if (ws) { ws.close(); ws = null; }
  if (term) { term.dispose(); term = null; }
  currentSessionId = null;

  refreshSessionList();
}

function initTerminal() {
  const container = document.getElementById('terminal');
  container.innerHTML = '';

  term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    theme: {
      background: '#1a1b26',
      foreground: '#c0caf5',
      cursor: '#c0caf5',
      selectionBackground: '#33467c'
    },
    allowProposedApi: true
  });

  fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(container);
  fitAddon.fit();

  term.onData((data) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data }));
    }
  });

  window.addEventListener('resize', () => {
    if (fitAddon && term) {
      fitAddon.fit();
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    }
  });
}

function connectWebSocket(sessionId) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = getToken();
  let url = `${proto}//${location.host}/?session=${sessionId}`;
  if (token) url += `&token=${token}`;

  ws = new WebSocket(url);

  ws.onopen = () => {
    setStatus(true);
    if (term && fitAddon) {
      fitAddon.fit();
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    }
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'output' && term) {
        term.write(msg.data);
      }
    } catch {}
  };

  ws.onclose = () => setStatus(false);
  ws.onerror = () => setStatus(false);
}

function setStatus(online) {
  const dot = document.getElementById('connection-status');
  const text = document.getElementById('status-text');
  dot.className = 'status-dot ' + (online ? 'online' : 'offline');
  text.textContent = online ? 'Connected' : 'Disconnected';
}

function sendKey(key) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'input', data: key }));
  }
  if (term) term.focus();
}

async function killSession() {
  if (!currentSessionId) return;
  if (!confirm('Kill this session?')) return;

  await fetch(`/api/sessions/${currentSessionId}`, {
    method: 'DELETE',
    headers: apiHeaders()
  });
  showSessions();
}

// Init
refreshSessionList();
checkStatus();

async function checkStatus() {
  try {
    const token = getToken();
    const url = token ? `/api/status?token=${token}` : '/api/status';
    const res = await fetch(url, { headers: apiHeaders() });
    if (res.ok) setStatus(true);
  } catch {
    setStatus(false);
  }
}
