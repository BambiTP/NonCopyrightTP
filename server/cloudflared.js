// cloudflared.js - Cloudflare Tunnel helpers shared by `npm run host` and `npm run tunnel`.
// cloudflared is Cloudflare's tunnel program: it connects out to Cloudflare, so this PC needs no open
// ports, router setup or certificate. Found on the PATH or in bin/, else downloaded into bin/.
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const BIN = path.join(__dirname, '..', 'bin');
const ASSETS = {
  'linux-x64': 'cloudflared-linux-amd64', 'linux-arm64': 'cloudflared-linux-arm64', 'linux-arm': 'cloudflared-linux-arm',
  'win32-x64': 'cloudflared-windows-amd64.exe', 'win32-ia32': 'cloudflared-windows-386.exe', 'win32-arm64': 'cloudflared-windows-amd64.exe',
  'darwin-x64': 'cloudflared-darwin-amd64.tgz', 'darwin-arm64': 'cloudflared-darwin-arm64.tgz',
};

async function cloudflared() {
  const exe = path.join(BIN, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  if (fs.existsSync(exe)) return exe;
  try { execFileSync('cloudflared', ['--version'], { stdio: 'ignore' }); return 'cloudflared'; } catch (e) { /* not installed */ }
  const asset = ASSETS[`${process.platform}-${process.arch}`];
  if (!asset) throw new Error(`no cloudflared download for ${process.platform}-${process.arch}; install it yourself or pass --url`);
  console.log('Downloading cloudflared (Cloudflare\'s tunnel program, one time only) ...');
  const r = await fetch('https://github.com/cloudflare/cloudflared/releases/latest/download/' + asset);
  if (!r.ok) throw new Error('cloudflared download failed: HTTP ' + r.status);
  fs.mkdirSync(BIN, { recursive: true });
  const file = path.join(BIN, asset);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  if (asset.endsWith('.tgz')) { execFileSync('tar', ['-xzf', file, '-C', BIN]); fs.unlinkSync(file); } else fs.renameSync(file, exe);
  fs.chmodSync(exe, 0o755);
  return exe;
}

// a quick tunnel prints its https://<words>.trycloudflare.com address once it is up
function quickTunnel(exe, port) {
  return new Promise((resolve, reject) => {
    const p = spawn(exe, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    const timer = setTimeout(() => reject(new Error('the tunnel did not start within 60 seconds:\n' + log.slice(-2000))), 60000);
    const read = (b) => {
      log += b;
      const m = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) { clearTimeout(timer); resolve(m[0]); }
    };
    p.stdout.on('data', read); p.stderr.on('data', read);
    p.on('exit', (c) => { clearTimeout(timer); reject(new Error('cloudflared exited (' + c + '):\n' + log.slice(-2000))); });
    process.on('exit', () => p.kill());
    for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0));
  });
}

// a named tunnel (set up in the Cloudflare dashboard with a token): a fixed address on your own domain
function namedTunnel(exe, token) {
  const p = spawn(exe, ['tunnel', '--no-autoupdate', 'run', '--token', token], { stdio: ['ignore', 'inherit', 'inherit'] });
  p.on('exit', (c) => { console.error('cloudflared exited (' + c + ')'); process.exit(1); });
  process.on('exit', () => p.kill());
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0));
  return p;
}

module.exports = { cloudflared, quickTunnel, namedTunnel };
