const { WebSocket } = require('ws');

class CrabClient {
  constructor({ host = 'localhost', port = 9002 }) {
    this.url = `ws://${host}:${port}`;
    this.ws = null;
    this.connected = false;
    this.reconnectTimer = null;
    this.pendingRequests = new Map();
    this.requestId = 0;
  }

  connect() {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        this.connected = true;
        console.log(`  Bridge:  Connected to CloseCrab at ${this.url}`);
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          if (msg.requestId && this.pendingRequests.has(msg.requestId)) {
            const { resolve } = this.pendingRequests.get(msg.requestId);
            this.pendingRequests.delete(msg.requestId);
            resolve(msg);
          }
        } catch {}
      });

      this.ws.on('close', () => {
        this.connected = false;
        this.scheduleReconnect();
      });

      this.ws.on('error', () => {
        this.connected = false;
        this.scheduleReconnect();
      });
    } catch {
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  isConnected() {
    return this.connected;
  }

  async sendCommand(action, payload = {}) {
    if (!this.connected) {
      throw new Error('Not connected to CloseCrab Bridge');
    }

    const requestId = ++this.requestId;
    const message = JSON.stringify({ action, payload, requestId });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Bridge command timeout'));
      }, 30000);

      this.pendingRequests.set(requestId, {
        resolve: (msg) => {
          clearTimeout(timeout);
          resolve(msg);
        }
      });

      this.ws.send(message);
    });
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}

module.exports = CrabClient;
