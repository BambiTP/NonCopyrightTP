// host.js - host a peer-to-peer group's games on this PC:
//   npm run host -- <code from the group page> [--name "Your name"] [--port 3000]
// Starts this server, gives it a public https address with a free Cloudflare quick tunnel (no
// account or router setup; cloudflared is downloaded into bin/ the first time), and connects to
// the main site so the group's games are created here. Already have a public address (an open
// port, your own tunnel)? Pass it with --url http://your.address:3000 to skip the tunnel.
const { cloudflared, quickTunnel } = require('./cloudflared');

const DEFAULT_HUB = 'https://152-44-39-10.sslip.io';

function args() {
  const a = process.argv.slice(2), o = { code: null };
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith('--')) o[a[i].slice(2)] = a[++i];
    else if (!o.code) o.code = a[i];
  }
  return o;
}

(async () => {
  const o = args();
  if (!o.code) {
    console.log('Usage: npm run host -- <code> [--name "Your name"] [--port 3000] [--url <public address>]\nThe code is in the Peer to Peer box on your group\'s page.');
    process.exit(1);
  }
  const port = Number(o.port || process.env.PORT || 3000);
  let url = o.url;
  if (url && !/^https:\/\//.test(url)) console.log('Note: the main site only accepts https:// addresses, so players\' game traffic is encrypted.');
  if (!url) {
    console.log('Opening a public address for this PC ...');
    url = await quickTunnel(await cloudflared(), port);
    process.env.HOST = '127.0.0.1'; // only reachable through the tunnel
  }
  Object.assign(process.env, {
    PORT: String(port), P2P_HUB: (o.hub || process.env.P2P_HUB || DEFAULT_HUB).replace(/\/+$/, ''),
    P2P_CODE: o.code, P2P_URL: url.replace(/\/+$/, ''), P2P_NAME: o.name || process.env.P2P_NAME || '', // empty: the main site uses the group leader's name
  });
  console.log('Public address: ' + url);
  require('./index');
})().catch((e) => { console.error('Could not start hosting: ' + e.message); process.exit(1); });
