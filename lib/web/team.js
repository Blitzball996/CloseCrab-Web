// Team Mode - Leaderboard & Online Members
let teamRefreshInterval = null;

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

async function fetchLeaderboard() {
  const el = document.getElementById('leaderboard-body');
  if (!el) return;
  try {
    const res = await fetch(apiUrl('/api/leaderboard'), { headers: apiHeaders() });
    if (!res.ok) throw new Error();
    const data = await res.json();
    renderLeaderboard(data);
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
    const isMe = entry.clientId === myClientId || entry.username === myUsername;
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
  return badges.map(b => `<span class="achievement-badge" title="${escapeHtml(b)}">${b}</span>`).join(' ');
}

async function fetchOnlineMembers() {
  const el = document.getElementById('member-list');
  if (!el) return;
  try {
    const res = await fetch(apiUrl('/api/clients'), { headers: apiHeaders() });
    if (!res.ok) throw new Error();
    const data = await res.json();
    renderMembers(data);
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
    const isMe = m.clientId === myClientId;
    return `<div class="member-item${isMe ? ' member-me' : ''}">
      <span class="member-dot"></span>
      <span class="member-name">${escapeHtml(m.username || 'Anonymous')}</span>
      ${isMe ? '<span class="member-you">(you)</span>' : ''}
    </div>`;
  }).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
