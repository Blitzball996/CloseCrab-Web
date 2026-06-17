// Team Mode - Leaderboard (local + cloud) & Online Members
let teamRefreshInterval = null;
let leaderboardScope = 'local'; // 'local' = this host, 'cloud' = cross-host total

function initTeamView() {
  fetchLeaderboard();
  fetchOnlineMembers();
  if (teamRefreshInterval) clearInterval(teamRefreshInterval);
  teamRefreshInterval = setInterval(() => {
    fetchLeaderboard();
    fetchOnlineMembers();
  }, 10000);
}

function destroyTeamView() {
  if (teamRefreshInterval) {
    clearInterval(teamRefreshInterval);
    teamRefreshInterval = null;
  }
}

function setLeaderboardScope(scope) {
  leaderboardScope = scope;
  document.querySelectorAll('.lb-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.scope === scope);
  });
  fetchLeaderboard();
}

async function fetchLeaderboard() {
  const el = document.getElementById('leaderboard-body');
  if (!el) return;
  try {
    const res = await fetch(apiUrl('/api/leaderboard'), { headers: apiHeaders() });
    if (!res.ok) throw new Error();
    const data = await res.json();
    // Toggle the cloud tab's availability.
    const cloudTab = document.querySelector('.lb-tab[data-scope="cloud"]');
    if (cloudTab) cloudTab.style.display = data.cloudEnabled ? '' : 'none';
    if (!data.cloudEnabled && leaderboardScope === 'cloud') leaderboardScope = 'local';
    const entries = (leaderboardScope === 'cloud' ? data.cloud : data.local) || [];
    renderLeaderboard(entries);
  } catch {
    el.innerHTML = '<tr><td colspan="4" class="team-empty">Failed to load leaderboard</td></tr>';
  }
}

function renderLeaderboard(entries) {
  const el = document.getElementById('leaderboard-body');
  if (!entries.length) {
    el.innerHTML = '<tr><td colspan="4" class="team-empty">No data yet</td></tr>';
    return;
  }
  el.innerHTML = entries.map((entry, i) => {
    const rank = i + 1;
    const medal = rank === 1 ? '&#x1F947;' : rank === 2 ? '&#x1F948;' : rank === 3 ? '&#x1F949;' : rank;
    const isMe = entry.username === myUsername;
    const rowClass = isMe ? 'leaderboard-row leaderboard-me' : 'leaderboard-row';
    return `<tr class="${rowClass}">
      <td class="rank-cell">${medal}</td>
      <td class="name-cell">${escapeHtml(entry.username)}</td>
      <td class="score-cell">${entry.score}</td>
      <td class="badge-cell">${renderBadges(entry.badges)}</td>
    </tr>`;
  }).join('');
}

function renderBadges(badges) {
  if (!badges || !badges.length) return '';
  return badges.map(b => `<span class="achievement-badge" title="${escapeHtml(b)}">${escapeHtml(b)}</span>`).join(' ');
}

async function fetchOnlineMembers() {
  const el = document.getElementById('member-list');
  if (!el) return;
  try {
    const res = await fetch(apiUrl('/api/clients'), { headers: apiHeaders() });
    if (!res.ok) throw new Error();
    const data = await res.json();
    // Merge live local clients with cloud presence, dedup by username.
    const seen = new Set();
    const members = [];
    for (const m of data.local || []) {
      const name = m.username || 'Anonymous';
      if (seen.has(name)) continue;
      seen.add(name);
      members.push({ username: name, here: true });
    }
    for (const m of data.cloud || []) {
      const name = m.username || 'Anonymous';
      if (seen.has(name)) continue;
      seen.add(name);
      members.push({ username: name, here: false });
    }
    renderMembers(members);
  } catch {
    el.innerHTML = '<div class="team-empty">Failed to load members</div>';
  }
}

function renderMembers(members) {
  const el = document.getElementById('member-list');
  const countEl = document.getElementById('online-count');
  if (countEl) countEl.textContent = members.length;
  if (!members.length) {
    el.innerHTML = '<div class="team-empty">No one online</div>';
    return;
  }
  el.innerHTML = members.map(m => {
    const isMe = m.username === myUsername;
    return `<div class="member-item${isMe ? ' member-me' : ''}">
      <span class="member-dot"></span>
      <span class="member-name">${escapeHtml(m.username || 'Anonymous')}</span>
      ${isMe ? '<span class="member-you">(you)</span>' : ''}
      ${m.here ? '' : '<span class="member-remote" title="On another host">☁</span>'}
    </div>`;
  }).join('');
}

// Submit a game score to local + cloud boards (called by games.js on game over).
async function submitScore(score, badges) {
  if (!myUsername) return;
  try {
    await fetch(apiUrl('/api/team/score'), {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ username: myUsername, score: score, badges: badges || [] }),
    });
  } catch {}
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
