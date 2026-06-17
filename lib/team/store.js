// Local leaderboard persistence. Survives restarts without adding a native
// dependency: scores live in a JSON file next to the working dir. This is the
// "one GPU host serves the whole team" board — the phones connected to THIS
// machine. The cloud board (BackendClient) is the cross-host total; the Team
// view merges both.

const fs = require('fs');
const path = require('path');
const os = require('os');

class LocalStore {
  constructor({ baseDir } = {}) {
    this.file = path.join(baseDir || os.homedir() || '.', '.closecrab-web-scores.json');
    this.scores = new Map(); // username -> { username, score, badges, updatedAt }
    this._load();
  }

  _load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const e of data.scores || []) {
        if (e && e.username) this.scores.set(e.username, e);
      }
    } catch {
      // no file yet / corrupt → start empty
    }
  }

  _save() {
    try {
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ scores: [...this.scores.values()] }), 'utf8');
      fs.renameSync(tmp, this.file); // atomic-ish
    } catch {}
  }

  // Upsert; keeps the max score so reconnects never lower a standing.
  recordScore(username, score, badges) {
    if (!username) return;
    const s = Math.max(0, Number(score) || 0);
    const prev = this.scores.get(username);
    this.scores.set(username, {
      username,
      score: prev ? Math.max(prev.score, s) : s,
      badges: badges || (prev && prev.badges) || [],
      updatedAt: new Date().toISOString(),
    });
    this._save();
  }

  // Top-N sorted entries [{username, score, badges}].
  leaderboard(limit = 100) {
    return [...this.scores.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((e) => ({ username: e.username, score: e.score, badges: e.badges || [] }));
  }
}

module.exports = LocalStore;
