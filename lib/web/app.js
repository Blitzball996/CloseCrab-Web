let currentSessionId = null;
let ws = null;
let reconnectTimer = null;
let termReady = false;
let outputBuffer = '';
// Tail buffer for CCSPIN markers split across WebSocket chunks.
let ccspinTail = '';
// Team Mode: unique client ID assigned by server on WebSocket connect
let myClientId = null;
let myUsername = localStorage.getItem('closecrab-username') || '';

function getToken() {
  return new URLSearchParams(window.location.search).get('token') || '';
}
function apiHeaders() {
  const h = { 'Content-Type': 'application/json' };
  const t = getToken();
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}
function apiUrl(path) {
  const t = getToken();
  return t ? `${path}?token=${t}` : path;
}

// === Views ===
function showView(name) {
  document.getElementById('view-dashboard').style.display = name === 'dashboard' ? 'flex' : 'none';
  document.getElementById('view-sessions').style.display = name === 'sessions' ? 'flex' : 'none';
  document.getElementById('view-new').style.display = name === 'new' ? 'flex' : 'none';
  document.getElementById('view-terminal').style.display = name === 'terminal' ? 'flex' : 'none';
  document.getElementById('view-team').style.display = name === 'team' ? 'flex' : 'none';

  // Update nav-tab active states across all views
  document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
  const activeTabName = (name === 'new') ? 'sessions' : name;
  document.querySelectorAll('.nav-tab').forEach(tab => {
    if (tab.textContent.toLowerCase() === activeTabName) tab.classList.add('active');
  });

  if (name === 'dashboard' && typeof initDashboard === 'function') initDashboard();
  if (name !== 'dashboard' && typeof destroyDashboard === 'function') destroyDashboard();
  if (name === 'team' && typeof initTeamView === 'function') initTeamView();
  if (name === 'sessions') refreshSessions();
}
function showNewSession() { showView('new'); }
function leaveTerminal() {
  if (ws) { ws.close(); ws = null; }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  currentSessionId = null;
  termReady = false;
  ccspinTail = '';
  setThinking(false);
  stopCurrentGame();
  showView('sessions');
  refreshSessions();
}

// === Sessions ===
async function refreshSessions() {
  try {
    const res = await fetch(apiUrl('/api/sessions'), { headers: apiHeaders() });
    if (!res.ok) throw new Error();
    const sessions = await res.json();
    renderSessions(sessions);
    setServerStatus('online');
  } catch { setServerStatus('offline'); renderSessions([]); }
}
function renderSessions(sessions) {
  const el = document.getElementById('sessions-list');
  if (!sessions.length) {
    el.innerHTML = '<div class="empty-state"><div class="logo-mark"></div>No sessions yet.<br>Tap below to start.</div>';
    return;
  }
  const watermark = '<div class="logo-watermark" aria-hidden="true"></div>';
  el.innerHTML = watermark + sessions.map(s => {
    const t = new Date(s.startTime).toLocaleTimeString();
    const attached = s.kind === 'attached';
    const label = attached ? (s.workingDirectory || '(running window)')
                           : s.workingDirectory.split(/[/\\]/).slice(-2).join('/');
    const tag = (s.kind === 'control')
      ? '<span class="kind-tag live">CONTROL</span>'
      : (attached ? '<span class="kind-tag mirror">MIRROR</span>' : '<span class="kind-tag live">CONTROL</span>');
    const statusTxt = attached ? (s.alive ? '● Live window' : '○ Saved')
                               : (s.alive ? '● Running' : '○ Exited');
    const meta = (s.messageCount ? `<span class="msg-count">${s.messageCount} msgs</span>` : '');
    return `<div class="session-card ${attached?'attached':''}" onclick="openSession('${s.id}', {kind: '${s.kind || 'spawned'}', alive: ${s.alive || false}})"><div class="row"><span>${t} ${tag}</span><span class="status ${s.alive?'alive':'dead'}">${statusTxt}</span></div><div class="dir">${label} ${meta}</div></div>`;
  }).join('');
}
function setServerStatus(s) {
  const el = document.getElementById('server-status');
  if (!el) return;
  el.textContent = s === 'online' ? 'Online' : 'Offline';
  el.className = 'badge ' + (s === 'online' ? 'badge-online' : 'badge-offline');
}

// === Create ===
async function doCreateSession() {
  const dir = document.getElementById('input-dir').value.trim();
  const body = {};
  if (dir) body.workingDirectory = dir;
  try {
    const res = await fetch('/api/sessions', { method: 'POST', headers: apiHeaders(), body: JSON.stringify(body) });
    if (!res.ok) { const e = await res.json(); alert(e.error || 'Failed'); return; }
    const session = await res.json();
    openSession(session.id);
  } catch { alert('Connection failed'); }
}

// === Terminal ===
let currentSessionReadOnly = false;
function openSession(id, sessionInfo) {
  currentSessionId = id;
  // Only 'attached' (saved transcript without port) is readonly; 'control' can inject.
  const isAttached = (typeof sessionInfo === 'object') ? (sessionInfo.kind === 'attached') : !!sessionInfo;
  currentSessionReadOnly = isAttached;
  termReady = false;
  outputBuffer = '';
  wsConnectedOnce = false;
  showView('terminal');
  document.getElementById('loading-screen').style.display = 'flex';
  document.getElementById('terminal-area').style.display = 'none';
  document.getElementById('btn-enter').style.display = 'none';
  document.getElementById('term-output').innerHTML = '';
  setTermStatus('connecting');
  startRandomGame();
  // Attached (mirror) sessions are already running — connect fast.
  setTimeout(() => connectWS(id), isAttached ? 200 : 1500);
}

function enterTerminal() {
  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById('terminal-area').style.display = 'flex';
  stopCurrentGame();
  const el = document.getElementById('term-output');
  el.innerHTML = '';
  if (outputBuffer) {
    appendToTerminal(outputBuffer);
    outputBuffer = '';
  }
  termReady = true;
  userScrolling = false;
  initScrollDetection();
  applyReadOnlyUI(currentSessionReadOnly);
  if (!currentSessionReadOnly) document.getElementById('msg-input').focus();
}

// Show/hide the input bar depending on whether this session is a read-only
// mirror of an already-running CloseCrab window.
function applyReadOnlyUI(ro) {
  const bar = document.querySelector('.input-bar') || document.getElementById('input-bar');
  if (bar) bar.style.display = ro ? 'none' : '';
  let banner = document.getElementById('mirror-banner');
  if (ro) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'mirror-banner';
      banner.className = 'mirror-banner';
      banner.textContent = '👁 Mirror view — live output from a running CloseCrab window (read-only)';
      const area = document.getElementById('terminal-area');
      if (area) area.insertBefore(banner, area.firstChild);
    }
    banner.style.display = 'block';
  } else if (banner) {
    banner.style.display = 'none';
  }
}

function setTermStatus(state) {
  const el = document.getElementById('term-status');
  const ls = document.getElementById('loading-status');
  if (state === 'connecting') {
    el.textContent = 'Connecting...'; el.className = 'badge badge-connecting';
    if (ls) ls.textContent = 'Launching CloseCrab...';
  } else if (state === 'connected') {
    el.textContent = 'Connected'; el.className = 'badge badge-online';
    if (ls) ls.textContent = 'Connected! CloseCrab is loading...';
  } else {
    el.textContent = 'Disconnected'; el.className = 'badge badge-offline';
    if (ls) ls.textContent = 'Disconnected. Reconnecting...';
  }
}

let wsConnectedOnce = false;

function connectWS(sessionId) {
  if (ws) { ws.close(); ws = null; }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = getToken();
  let url = `${proto}//${location.host}/?session=${sessionId}`;
  if (token) url += `&token=${token}`;
  if (wsConnectedOnce) url += `&reconnect=1`;

  try {
    ws = new WebSocket(url);
  } catch (e) {
    setTermStatus('disconnected');
    if (currentSessionId) reconnectTimer = setTimeout(() => connectWS(currentSessionId), 2000);
    return;
  }

  const connectTimeout = setTimeout(() => {
    if (ws && ws.readyState !== WebSocket.OPEN) {
      ws.close();
      connectWS(sessionId); // retry immediately
    }
  }, 5000);

  ws.onopen = () => {
    clearTimeout(connectTimeout);
    setTermStatus('connected');
    wsConnectedOnce = true;
    // Register with server using username
    if (!myUsername) {
      myUsername = prompt('Enter your username for Team Mode:', 'User-' + Math.random().toString(36).slice(2, 6)) || 'Anonymous';
      localStorage.setItem('closecrab-username', myUsername);
    }
    ws.send(JSON.stringify({ type: 'register', username: myUsername }));
  };
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'connected') {
        // Server assigned us a unique clientId
        myClientId = msg.clientId;
        return;
      }
      if (msg.type === 'output') {
        if (!termReady) {
          outputBuffer += msg.data;
          document.getElementById('btn-enter').style.display = 'block';
          document.getElementById('loading-status').textContent = 'CloseCrab is ready!';
        } else {
          appendToTerminal(msg.data);
        }
      }
    } catch {}
  };
  ws.onclose = () => {
    clearTimeout(connectTimeout);
    setTermStatus('disconnected');
    if (currentSessionId) reconnectTimer = setTimeout(() => connectWS(currentSessionId), 2000);
  };
  ws.onerror = () => { clearTimeout(connectTimeout); };
}

// Handle iOS Safari background/foreground
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && currentSessionId) {
    // Page came back to foreground - reconnect immediately
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      connectWS(currentSessionId);
    }
  }
});

// === ANSI to HTML (lightweight, smooth scrolling) ===
const ANSI_COLORS = {
  30:'#1c1c1e',31:'#ff453a',32:'#30d158',33:'#ffd60a',34:'#0a84ff',35:'#bf5af2',36:'#64d2ff',37:'#ffffff',
  90:'#636366',91:'#ff6961',92:'#4cd964',93:'#ffcc00',94:'#5ac8fa',95:'#da8aff',96:'#70d7ff',97:'#ffffff'
};

function ansiToHtml(text) {
  let html = '';
  let i = 0;
  let currentSpan = false;
  while (i < text.length) {
    if (text[i] === '\x1b' && text[i+1] === '[') {
      let j = i + 2;
      while (j < text.length && text[j] !== 'm' && j - i < 20) j++;
      if (text[j] === 'm') {
        const codes = text.slice(i+2, j).split(';');
        if (currentSpan) { html += '</span>'; currentSpan = false; }
        let fg = null, bold = false;
        for (const c of codes) {
          const n = parseInt(c);
          if (n === 0 || isNaN(n)) { fg = null; bold = false; }
          else if (n === 1) bold = true;
          else if (ANSI_COLORS[n]) fg = ANSI_COLORS[n];
          else if (n >= 40 && n <= 47) {} // bg - skip for simplicity
        }
        if (fg || bold) {
          let style = '';
          if (fg) style += `color:${fg};`;
          if (bold) style += 'font-weight:700;';
          html += `<span style="${style}">`;
          currentSpan = true;
        }
        i = j + 1;
        continue;
      }
    }
    // Strip other escape sequences
    if (text[i] === '\x1b') {
      let j = i + 1;
      while (j < text.length && j - i < 10 && !/[a-zA-Z~]/.test(text[j])) j++;
      i = j + 1;
      continue;
    }
    if (text[i] === '<') html += '&lt;';
    else if (text[i] === '>') html += '&gt;';
    else if (text[i] === '&') html += '&amp;';
    else if (text[i] === '\r') {} // skip CR
    else html += text[i];
    i++;
  }
  if (currentSpan) html += '</span>';
  return html;
}

// === Terminal Output - proven working version ===
let userScrolling = false;
let scrollTimer = null;

function initScrollDetection() {
  const el = document.getElementById('term-output');
  el.addEventListener('scroll', () => {
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (!atBottom) {
      userScrolling = true;
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => { userScrolling = false; }, 5000);
    } else {
      userScrolling = false;
    }
  }, { passive: true });
}

function appendToTerminal(data) {
  const el = document.getElementById('term-output');
  // Pull out CCSPIN markers emitted by CloseCrab when running under
  // CLOSECRAB_WEB=1. They drive the mobile thinking-bar and must NOT
  // be rendered as terminal text (otherwise the phone sees stacks of
  // "Waiting for response..." lines).
  const cleaned = consumeSpinMarkers(data);
  if (!cleaned) return;
  const html = ansiToHtml(cleaned);
  if (!html) return;
  el.insertAdjacentHTML('beforeend', html);
  if (el.innerHTML.length > 300000) {
    el.innerHTML = el.innerHTML.slice(-150000);
  }
  if (!userScrolling) {
    el.scrollTop = el.scrollHeight;
  }
}

// Matches:  <<<CCSPIN:START:Waiting for response...>>>
//           <<<CCSPIN:STOP>>>
// We use a non-greedy capture so the message can contain anything except '>>>'.
const CCSPIN_RE = /<<<CCSPIN:(START:([^]*?)|STOP)>>>\s*\n?/g;

function consumeSpinMarkers(text) {
  let buf = ccspinTail + (text || '');
  ccspinTail = '';
  if (buf.indexOf('<<<CCSPIN:') === -1) return buf;
  // Hold back any unterminated trailing "<<<CCSPIN:..." for the next chunk.
  const lastStart = buf.lastIndexOf('<<<CCSPIN:');
  if (lastStart !== -1 && buf.indexOf('>>>', lastStart) === -1) {
    ccspinTail = buf.slice(lastStart);
    buf = buf.slice(0, lastStart);
  }
  let lastAction = null;       // 'start' | 'stop'
  let lastMessage = '';
  const stripped = buf.replace(CCSPIN_RE, (_full, _g1, msg) => {
    if (msg !== undefined) { lastAction = 'start'; lastMessage = msg.trim(); }
    else                   { lastAction = 'stop'; }
    return '';
  });
  if (lastAction === 'start')      setThinking(true,  lastMessage || 'Thinking');
  else if (lastAction === 'stop')  setThinking(false);
  return stripped;
}

function setThinking(on, label) {
  const bar = document.getElementById('thinking-bar');
  if (!bar) return;
  if (on) {
    const labelEl = document.getElementById('thinking-label');
    if (labelEl) labelEl.textContent = friendlyThinkingLabel(label);
    bar.style.display = 'flex';
  } else {
    bar.style.display = 'none';
  }
}

function friendlyThinkingLabel(raw) {
  if (!raw) return 'Thinking';
  // "Waiting for response..." is verbose on a phone — shorten it.
  if (/waiting for response/i.test(raw)) return 'Thinking';
  // Tool-use messages come in as just the tool name (e.g. "Bash"); show
  // them as "Running <Tool>" to make the bar self-explanatory.
  if (/^[A-Z][A-Za-z]+$/.test(raw)) return 'Running ' + raw;
  return raw;
}

// === Input ===
function sendMessage() {
  if (currentSessionReadOnly) return;
  const input = document.getElementById('msg-input');
  const text = input.value;
  if (!text) return;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'input', data: text + '\r', clientId: myClientId }));
  }
  input.value = '';
  input.focus();
}
function sendKey(key) {
  if (currentSessionReadOnly) return;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'input', data: key, clientId: myClientId }));
  }
}
async function killSession() {
  if (!currentSessionId) return;
  // Mirror sessions belong to a running PC window — phone must NEVER kill them.
  if (currentSessionReadOnly) {
    leaveTerminal();
    return;
  }
  if (!confirm('Close this web session? (Your PC CloseCrab windows are not affected.)')) return;
  await fetch(apiUrl(`/api/sessions/${currentSessionId}`), { method: 'DELETE', headers: apiHeaders() });
  leaveTerminal();
}
async function killCrabProcess() {
  if (!confirm('Kill CloseCrab process on PC?')) return;
  try {
    const res = await fetch('/api/kill-crab', { method: 'POST', headers: apiHeaders() });
    const data = await res.json();
    alert(data.message);
    refreshSessions();
  } catch { alert('Failed to reach server'); }
}

// === Init ===
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('msg-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); sendMessage(); }
  });
  // Start on dashboard
  showView('dashboard');
});
