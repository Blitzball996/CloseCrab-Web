// Dashboard Controller - CloseCrab Control Panel
let dashboardInterval = null;
let backendStartTime = null;

function initDashboard() {
  refreshBackendStatus();
  refreshLicenseStatus();
  if (dashboardInterval) clearInterval(dashboardInterval);
  dashboardInterval = setInterval(refreshBackendStatus, 3000);
}

async function refreshLicenseStatus() {
  const el = document.getElementById('dash-license-val');
  if (!el) return;
  try {
    const res = await fetch(apiUrl('/api/license-status'), { headers: apiHeaders() });
    if (!res.ok) throw new Error();
    const d = await res.json();
    if (d.licensed) {
      const cloud = d.cloudTeam ? ' · ☁ team' : '';
      el.textContent = `${d.maskedKey} (${d.edition})${cloud}`;
      el.className = 'dash-meta-value lic-ok';
    } else {
      el.textContent = 'unlicensed';
      el.className = 'dash-meta-value lic-bad';
    }
  } catch {
    el.textContent = '—';
    el.className = 'dash-meta-value';
  }
}

function destroyDashboard() {
  if (dashboardInterval) {
    clearInterval(dashboardInterval);
    dashboardInterval = null;
  }
}

async function refreshBackendStatus() {
  try {
    const res = await fetch(apiUrl('/api/backend-status'), { headers: apiHeaders() });
    if (!res.ok) throw new Error();
    const data = await res.json();
    updateStatusUI(data);
  } catch {
    updateStatusUI({ running: false, pid: null, uptime: 0, clients: 0 });
  }
}

function updateStatusUI(data) {
  const dot = document.getElementById('dash-status-dot');
  const label = document.getElementById('dash-status-label');
  const pidEl = document.getElementById('dash-pid');
  const uptimeEl = document.getElementById('dash-uptime');
  const clientsEl = document.getElementById('dash-clients');
  const btnStart = document.getElementById('dash-btn-start');
  const btnStop = document.getElementById('dash-btn-stop');

  if (!dot) return;

  if (data.running) {
    dot.className = 'status-dot status-running';
    label.textContent = 'Running';
    label.className = 'status-label running';
    pidEl.textContent = data.pid ? `PID ${data.pid}` : '';
    uptimeEl.textContent = formatUptime(data.uptime || 0);
    btnStart.disabled = true;
    btnStop.disabled = false;
  } else {
    dot.className = 'status-dot status-stopped';
    label.textContent = 'Stopped';
    label.className = 'status-label stopped';
    pidEl.textContent = '';
    uptimeEl.textContent = '--:--';
    btnStart.disabled = false;
    btnStop.disabled = true;
  }

  clientsEl.textContent = data.clients || 0;
}

function formatUptime(seconds) {
  if (!seconds || seconds < 0) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

async function startBackend() {
  const btn = document.getElementById('dash-btn-start');
  btn.disabled = true;
  btn.textContent = 'Starting...';

  const dot = document.getElementById('dash-status-dot');
  dot.className = 'status-dot status-starting';
  const label = document.getElementById('dash-status-label');
  label.textContent = 'Starting...';
  label.className = 'status-label starting';

  try {
    const res = await fetch('/api/start-backend', {
      method: 'POST',
      headers: apiHeaders()
    });
    const data = await res.json();
    if (data.ok) {
      setTimeout(refreshBackendStatus, 1500);
    } else {
      alert(data.message || 'Failed to start backend');
    }
  } catch {
    alert('Could not reach server');
  }
  btn.textContent = 'Start Backend';
}

async function stopBackend() {
  const btn = document.getElementById('dash-btn-stop');
  btn.disabled = true;
  btn.textContent = 'Stopping...';

  try {
    const res = await fetch('/api/stop-backend', {
      method: 'POST',
      headers: apiHeaders()
    });
    const data = await res.json();
    if (!data.ok) {
      alert(data.message || 'Failed to stop');
    }
    setTimeout(refreshBackendStatus, 1000);
  } catch {
    alert('Could not reach server');
  }
  btn.textContent = 'Stop Backend';
}

async function killAllProcesses() {
  if (!confirm('Disconnect from this PC? Your CloseCrab windows on the computer keep running.')) return;
  try {
    if (typeof ws !== 'undefined' && ws) { ws.close(); ws = null; }
  } catch {}
  if (typeof showView === 'function') showView('sessions');
  alert('Disconnected. PC processes are untouched.');
}
