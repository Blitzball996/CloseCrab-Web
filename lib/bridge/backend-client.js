// Cloud Team API client. Talks to the website backend's /api/team/* endpoints,
// authenticating each call with the activated {key, device_id} pair the license
// gate resolved. All methods fail soft: on any error they return null/empty so
// the local leaderboard still works when offline.

class BackendClient {
  constructor({ backendUrl, key, deviceId }) {
    this.base = (backendUrl || '').replace(/\/+$/, '');
    this.key = key;
    this.deviceId = deviceId;
    this.enabled = !!(this.base && this.key && this.deviceId);
  }

  async _get(pathname, params) {
    if (!this.enabled) return null;
    const qs = new URLSearchParams({ key: this.key, device_id: this.deviceId, ...params });
    try {
      const res = await fetch(`${this.base}${pathname}?${qs}`, { method: 'GET' });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async _post(pathname, payload) {
    if (!this.enabled) return null;
    try {
      const res = await fetch(`${this.base}${pathname}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: this.key, device_id: this.deviceId, ...payload }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  // Returns [{username, score, badges}] or [] on failure.
  async leaderboard() {
    const data = await this._get('/api/team/leaderboard');
    return (data && data.entries) || [];
  }

  // Returns [{username, last_seen}] or [].
  async online() {
    const data = await this._get('/api/team/online');
    return (data && data.members) || [];
  }

  async pushScore({ username, score, badges }) {
    return this._post('/api/team/score', { username, score, badges: badges || [] });
  }

  async heartbeat({ username }) {
    return this._post('/api/team/heartbeat', { username });
  }
}

module.exports = BackendClient;
