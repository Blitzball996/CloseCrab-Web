#!/usr/bin/env node

const { Command } = require('commander');
const path = require('path');
const crypto = require('crypto');
const pkg = require('../package.json');

const program = new Command();

program
  .name('closecrab-web')
  .description('Mobile-friendly Web interface for CloseCrab remote control')
  .version(pkg.version);

program
  .argument('[directory]', 'Working directory for CloseCrab sessions', '.')
  .option('-p, --port <number>', 'Web server port', '8787')
  .option('--host <address>', 'Bind address (use 0.0.0.0 for LAN/Tailscale)', '0.0.0.0')
  .option('--crab-port <number>', 'CloseCrab Bridge WebSocket port', '9002')
  .option('--token <string>', 'Authentication token (auto-generated if omitted)')
  .option('--no-auth', 'DANGER: disable token auth (only for trusted localhost dev)')
  .option('--backend-url <url>', 'Licensing/Team backend base URL', process.env.CLOSECRAB_BACKEND_URL || 'https://blitzball.lol')
  .option('--no-license', 'DANGER: skip the license gate (dev only)')
  .option('--offline-grace-days <n>', 'Days the license gate tolerates being offline', '7')
  .option('--no-tunnel', 'Disable the automatic cloudflared remote-access tunnel')
  .action(async (directory, options) => {
    const { startServer } = require('../lib/server');

    // Token: explicit > env > auto-generated. With auth enabled we ALWAYS have a
    // token (fail-closed); --no-auth is the only way to run unauthenticated.
    let token = options.token || process.env.CLOSECRAB_TOKEN || '';
    if (options.auth !== false && !token) {
      token = crypto.randomBytes(18).toString('base64url');
    }
    if (options.auth === false) token = '';

    const config = {
      port: parseInt(options.port),
      host: options.host,
      crabPort: parseInt(options.crabPort),
      token,
      authDisabled: options.auth === false,
      baseDir: path.resolve(process.cwd(), directory || '.'),
      backendUrl: options.backendUrl,
      licenseEnabled: options.license !== false,
      offlineGraceDays: parseInt(options.offlineGraceDays) || 7,
      tunnel: options.tunnel !== false,
    };
    await startServer(config);
  });

program.parse();
