let currentSessionId = null;
let ws = null;
let reconnectTimer = null;
let termReady = false;
let outputBuffer = '';

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
  document.getElementById('view-sessions').style.display = name === 'sessions' ? 'flex' : 'none';
  document.getElementById('view-new').style.display = name === 'new' ? 'flex' : 'none';
  document.getElementById('view-terminal').style.display = name === 'terminal' ? 'flex' : 'none';
}
function showNewSession() { showView('new'); }
function leaveTerminal() {
  if (ws) { ws.close(); ws = null; }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  currentSessionId = null;
  termReady = false;
  stopSnake();
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
    el.innerHTML = '<div class="empty-state"><div class="icon">🦀</div>No sessions yet.<br>Tap below to start.</div>';
    return;
  }
  el.innerHTML = sessions.map(s => {
    const t = new Date(s.startTime).toLocaleTimeString();
    const d = s.workingDirectory.split(/[/\\]/).slice(-2).join('/');
    return `<div class="session-card" onclick="openSession('${s.id}')"><div class="row"><span>${t}</span><span class="status ${s.alive?'alive':'dead'}">${s.alive?'● Running':'○ Exited'}</span></div><div class="dir">${d}</div></div>`;
  }).join('');
}
function setServerStatus(s) {
  const el = document.getElementById('server-status');
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
function openSession(id) {
  currentSessionId = id;
  termReady = false;
  outputBuffer = '';
  wsConnectedOnce = false;
  showView('terminal');
  document.getElementById('loading-screen').style.display = 'flex';
  document.getElementById('terminal-area').style.display = 'none';
  document.getElementById('btn-enter').style.display = 'none';
  document.getElementById('term-output').innerHTML = '';
  setTermStatus('connecting');
  startSnake();
  // Wait a moment for session to fully start before connecting WebSocket
  setTimeout(() => connectWS(id), 1500);
}

function enterTerminal() {
  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById('terminal-area').style.display = 'flex';
  stopSnake();
  const el = document.getElementById('term-output');
  el.innerHTML = '';
  if (outputBuffer) {
    appendToTerminal(outputBuffer);
    outputBuffer = '';
  }
  termReady = true;
  userScrolling = false;
  initScrollDetection();
  document.getElementById('msg-input').focus();
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
  };
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
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
  const html = ansiToHtml(data);
  if (!html) return;

  el.insertAdjacentHTML('beforeend', html);

  // Trim old content if too long
  if (el.innerHTML.length > 300000) {
    el.innerHTML = el.innerHTML.slice(-150000);
  }

  if (!userScrolling) {
    el.scrollTop = el.scrollHeight;
  }
}

// === Input ===
function sendMessage() {
  const input = document.getElementById('msg-input');
  const text = input.value;
  if (!text) return;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'input', data: text + '\r' }));
  }
  input.value = '';
  input.focus();
}
function sendKey(key) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'input', data: key }));
  }
}
async function killSession() {
  if (!currentSessionId) return;
  if (!confirm('Kill this session?')) return;
  await fetch(`/api/sessions/${currentSessionId}`, { method: 'DELETE', headers: apiHeaders() });
  leaveTerminal();
}

// === Snake Game ===
let snakeInterval = null;
let snake, food, dir, score, gridSize, cellSize;

function startSnake() {
  const canvas = document.getElementById('snake-canvas');
  const rect = canvas.parentElement.getBoundingClientRect();
  const size = Math.min(260, rect.width - 40);
  canvas.width = size; canvas.height = size;
  gridSize = 20; cellSize = size / gridSize;
  snake = [{x:10,y:10}]; dir = {x:1,y:0}; score = 0;
  placeFood();
  if (snakeInterval) clearInterval(snakeInterval);
  snakeInterval = setInterval(updateSnake, 150);
  // Touch controls
  let touchStart = null;
  canvas.ontouchstart = (e) => { touchStart = {x:e.touches[0].clientX, y:e.touches[0].clientY}; e.preventDefault(); };
  canvas.ontouchend = (e) => {
    if (!touchStart) return;
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    if (Math.abs(dx) > Math.abs(dy)) { if (dx > 0 && dir.x !== -1) dir = {x:1,y:0}; else if (dx < 0 && dir.x !== 1) dir = {x:-1,y:0}; }
    else { if (dy > 0 && dir.y !== -1) dir = {x:0,y:1}; else if (dy < 0 && dir.y !== 1) dir = {x:0,y:-1}; }
    touchStart = null;
    e.preventDefault();
  };
}
function stopSnake() { if (snakeInterval) { clearInterval(snakeInterval); snakeInterval = null; } }
function snakeDir(d) {
  if (d==='up' && dir.y!==1) dir={x:0,y:-1};
  else if (d==='down' && dir.y!==-1) dir={x:0,y:1};
  else if (d==='left' && dir.x!==1) dir={x:-1,y:0};
  else if (d==='right' && dir.x!==-1) dir={x:1,y:0};
}
function placeFood() { food = {x:Math.floor(Math.random()*gridSize), y:Math.floor(Math.random()*gridSize)}; }
function updateSnake() {
  const head = {x: (snake[0].x + dir.x + gridSize) % gridSize, y: (snake[0].y + dir.y + gridSize) % gridSize};
  if (snake.some(s => s.x === head.x && s.y === head.y)) { snake = [{x:10,y:10}]; dir={x:1,y:0}; score=0; placeFood(); }
  snake.unshift(head);
  if (head.x === food.x && head.y === food.y) { score++; placeFood(); } else { snake.pop(); }
  drawSnake();
}
function drawSnake() {
  const canvas = document.getElementById('snake-canvas');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1c1c1e'; ctx.fillRect(0,0,canvas.width,canvas.height);
  // Food
  ctx.fillStyle = '#ff453a';
  ctx.beginPath(); ctx.arc((food.x+0.5)*cellSize,(food.y+0.5)*cellSize,cellSize*0.4,0,Math.PI*2); ctx.fill();
  // Snake
  snake.forEach((s,i) => {
    ctx.fillStyle = i===0 ? '#30d158' : '#0a84ff';
    ctx.fillRect(s.x*cellSize+1, s.y*cellSize+1, cellSize-2, cellSize-2);
  });
  // Score
  ctx.fillStyle = '#8e8e93'; ctx.font = '12px -apple-system'; ctx.fillText(`Score: ${score}`, 8, 16);
}

// === Init ===
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('msg-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); sendMessage(); }
  });
  refreshSessions();
});
