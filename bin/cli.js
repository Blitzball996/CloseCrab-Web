#!/usr/bin/env node

const { Command } = require('commander');
const path = require('path');
const pkg = require('../package.json');

const program = new Command();

program
  .name('closecrab-web')
  .description('Mobile-friendly Web interface for CloseCrab remote control')
  .version(pkg.version);

program
  .argument('[directory]', 'Working directory for CloseCrab sessions', '.')
  .option('-p, --port <number>', 'Web server port', '3000')
  .option('--host <address>', 'Bind address (use 0.0.0.0 for LAN/Tailscale)', '0.0.0.0')
  .option('--crab-port <number>', 'CloseCrab Bridge WebSocket port', '9002')
  .option('--token <string>', 'Authentication token (optional)')
  .action(async (directory, options) => {
    const { startServer } = require('../lib/server');
    const config = {
      port: parseInt(options.port),
      host: options.host,
      crabPort: parseInt(options.crabPort),
      token: options.token || process.env.CLOSECRAB_TOKEN || '',
      baseDir: path.resolve(process.cwd(), directory || '.')
    };
    await startServer(config);
  });

program.parse();
