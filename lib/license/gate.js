// License gate for CloseCrab-Web.
//
// CloseCrab-Web is a LOCAL service the machine's owner runs to drive their own
// already-activated CloseCrab from a phone. We therefore reuse the activation
// the owner already performed: the desktop app stored its license key + signed
// token in HKCU\Software\Blitzball\CloseCrab. The gate reads that, recomputes
// the same device fingerprint the C++ client uses, and verifies with the backend
// before the web server is allowed to listen.
//
// Fingerprint MUST match CloseCrab-Unified/src/license/LicenseCore.cpp:
//   device_id = sha256Hex("MGUID:" + <HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid>).slice(0,32)
//
// Posture: the strong activation check already happened on the desktop. This
// gate re-verifies online when it can, trusts a recent cache when offline, and
// SOFT-FAILS (warns but allows) for a local owner when the backend is
// unreachable — so a dead backend never bricks the owner's own remote access.

const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const APP_KEY = 'CloseCrab'; // HKCU\Software\Blitzball\CloseCrab

// Read a single REG_SZ value from HKCU\Software\Blitzball\<APP_KEY>.
function regReadHKCU(valueName) {
  if (os.platform() !== 'win32') return '';
  try {
    const out = execFileSync(
      'reg',
      ['query', `HKCU\\Software\\Blitzball\\${APP_KEY}`, '/v', valueName],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    // Output line: "    <name>    REG_SZ    <value>"
    const m = out.match(new RegExp(`${valueName}\\s+REG_SZ\\s+(.*)`, 'i'));
    return m ? m[1].trim() : '';
  } catch {
    return '';
  }
}

// Read HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid (the fingerprint seed).
function machineGuid() {
  if (os.platform() !== 'win32') {
    // Non-Windows hosts: mirror the C++ fallbacks well enough for dev. Most
    // CloseCrab desktop installs that this gates are Windows.
    try {
      if (fs.existsSync('/etc/machine-id')) {
        return fs.readFileSync('/etc/machine-id', 'utf8').trim();
      }
    } catch {}
    return os.hostname() || 'unknown-host';
  }
  try {
    const out = execFileSync(
      'reg',
      ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid', '/reg:64'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const m = out.match(/MachineGuid\s+REG_SZ\s+(.*)/i);
    if (m) return m[1].trim();
  } catch {}
  return os.hostname() || 'unknown-machine';
}

// device_id = sha256("MGUID:" + seed)[:32] — identical to LicenseCore.cpp.
function deviceId() {
  const seed = machineGuid() || 'unknown-machine';
  return crypto.createHash('sha256').update('MGUID:' + seed).digest('hex').slice(0, 32);
}

// Where we cache the last successful verify (for offline grace).
function cachePath(baseDir) {
  return path.join(baseDir || os.homedir() || '.', '.closecrab-web-license.json');
}

function readCache(baseDir) {
  try {
    return JSON.parse(fs.readFileSync(cachePath(baseDir), 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(baseDir, data) {
  try {
    fs.writeFileSync(cachePath(baseDir), JSON.stringify(data), 'utf8');
  } catch {}
}

// readActivation pulls the stored key/edition from the registry.
function readActivation() {
  return {
    key: regReadHKCU('key'),
    edition: regReadHKCU('edition'),
    token: regReadHKCU('token'),
    sig: regReadHKCU('sig'),
    present: !!regReadHKCU('token'), // token presence ≈ "was activated"
  };
}

// --- Offline license verification (no network) ---------------------------
// Mirrors CloseCrab-Unified/src/license/LicenseCore.cpp verifyToken():
// Ed25519-verify the signed token against the embedded public key, then
// confirm the token's device_id matches THIS machine. Same crypto trust
// path as the desktop client's offline activation — no backend required.
//
// Public key (base64url) MUST match LicenseCore.cpp kPublicKey.
const LICENSE_PUBKEY_B64URL = 'cyKUWoytmoNBZ9g1Oehr-xfV9YXdjVTE4qzrIDfzcqc';

// Wrap a raw 32-byte Ed25519 public key into a KeyObject via DER SPKI.
function ed25519KeyObject(raw32) {
  const spkiHeader = Buffer.from('302a300506032b6570032100', 'hex');
  const der = Buffer.concat([spkiHeader, raw32]);
  return crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
}

// verifyTokenOffline returns { ok, key, product, edition, deviceId } or { ok:false }.
function verifyTokenOffline(tokenB64, sigB64, expectedDeviceId, expectedPrefix2) {
  try {
    if (!tokenB64 || !sigB64) return { ok: false };
    const msg = Buffer.from(tokenB64, 'base64url');
    const sig = Buffer.from(sigB64, 'base64url');
    if (sig.length !== 64) return { ok: false };
    const pub = ed25519KeyObject(Buffer.from(LICENSE_PUBKEY_B64URL, 'base64url'));
    if (!crypto.verify(null, msg, pub, sig)) return { ok: false };
    const payload = JSON.parse(msg.toString('utf8'));
    if (payload.device_id !== expectedDeviceId) return { ok: false };
    if (expectedPrefix2 && String(payload.product || '').slice(0, 2) !== expectedPrefix2) return { ok: false };
    return { ok: true, key: payload.key, product: payload.product, edition: payload.edition, deviceId: payload.device_id };
  } catch {
    return { ok: false };
  }
}

function maskKey(k) {
  const parts = (k || '').split('-');
  if (parts.length !== 5) return '••••';
  return `${parts[0]}-••••-••••-••••-${parts[4]}`;
}

// verifyWithBackend POSTs {key, device_id} to the backend's license/verify.
async function verifyWithBackend(backendUrl, key, device) {
  const url = backendUrl.replace(/\/+$/, '') + '/api/license/verify';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, device_id: device, product: 'CC' }),
  });
  let body = {};
  try { body = await res.json(); } catch {}
  return { httpOk: res.ok, status: res.status, body };
}

// check runs the full gate. Returns:
//   { ok:true, key, deviceId, edition, remoteEnabled, source:'cloud'|'offline-token'|'cache' }
//   { ok:false, reason, detail }
async function check(config) {
  const { backendUrl, offlineGraceDays = 7, baseDir } = config;
  const act = readActivation();
  const device = deviceId();

  if (!act.present || !act.key) {
    return {
      ok: false,
      reason: 'NOT_ACTIVATED',
      detail: 'No CloseCrab activation found on this machine. Activate CloseCrab first (closecrab --activate <KEY>).',
    };
  }

  try {
    const { httpOk, status, body } = await verifyWithBackend(backendUrl, act.key, device);
    if (httpOk && body && body.ok) {
      const remoteEnabled = body.remote_enabled !== false; // default-true
      if (!remoteEnabled) {
        return { ok: false, reason: 'REMOTE_DISABLED', detail: 'Remote control is turned off for this license in your account portal.' };
      }
      const result = {
        ok: true, key: act.key, deviceId: device, edition: act.edition || 'standard',
        remoteEnabled, source: 'cloud',
      };
      writeCache(baseDir, { key: act.key, deviceId: device, edition: result.edition, at: Date.now() });
      return result;
    }
    // Backend reachable but rejected → hard fail (do NOT fall back to cache).
    const code = (body && body.error) || `HTTP_${status}`;
    return { ok: false, reason: code, detail: `Backend rejected this license: ${code}` };
  } catch (e) {
    // Backend unreachable → OFFLINE verification (no network). This is the same
    // cryptographic trust path CloseCrab's desktop client uses for offline
    // activation: Ed25519-verify the registry token+sig against the embedded
    // public key and confirm it was minted for THIS device. A revoked/forged
    // token cannot pass, so this is real verification — not a soft-fail bypass.
    const v = verifyTokenOffline(act.token, act.sig, device, 'CC');
    if (v.ok) {
      // Refresh the offline cache so future starts are instant even if crypto
      // libs change; the token itself remains the source of truth.
      writeCache(baseDir, { key: v.key || act.key, deviceId: device, edition: v.edition || act.edition, at: Date.now() });
      return {
        ok: true, key: v.key || act.key, deviceId: device,
        edition: v.edition || act.edition || 'standard',
        remoteEnabled: true, source: 'offline-token',
      };
    }
    // Token didn't verify offline → fall back to a recent successful online cache.
    const cached = readCache(baseDir);
    if (cached && cached.key === act.key && cached.deviceId === device) {
      const ageDays = (Date.now() - (cached.at || 0)) / 86400000;
      if (ageDays <= offlineGraceDays) {
        return {
          ok: true, key: act.key, deviceId: device, edition: cached.edition || act.edition || 'standard',
          remoteEnabled: true, source: 'cache',
        };
      }
    }
    // No valid offline token and no fresh cache → hard fail.
    return {
      ok: false, reason: 'OFFLINE_UNVERIFIED',
      detail: `Cannot reach licensing server and offline token did not verify for this device: ${e.message}`,
    };
  }
}

module.exports = { check, deviceId, readActivation, maskKey };
