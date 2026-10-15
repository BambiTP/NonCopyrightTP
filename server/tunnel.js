// tunnel.js - run the whole site on this PC behind a Cloudflare Tunnel:
//   npm run tunnel                        a free quick tunnel: https://<random words>.trycloudflare.com
//                                         (no account; the address changes every time it starts)
//   TUNNEL_TOKEN=<token> npm run tunnel   a named tunnel from the Cloudflare dashboard: your own domain,
//                                         same address every time (point its public hostname at
//                                         http://localhost:3000)
// The server only listens on 127.0.0.1, so the tunnel is the only way in.
const { cloudflared, quickTunnel, namedTunnel } = require('./cloudflared');

(async () => {
  const port = Number(process.env.PORT || 3000);
  process.env.PORT = String(port);
  process.env.HOST = '127.0.0.1';
  const token = process.env.TUNNEL_TOKEN || process.argv[2];
  const exe = await cloudflared();
  require('./index');
  if (token) {
    namedTunnel(exe, token);
    console.log('Cloudflare named tunnel started: the site is on the hostname set for it in the Cloudflare dashboard');
  } else {
    console.log('Opening a quick tunnel ...');
    console.log('Public address: ' + await quickTunnel(exe, port));
  }
})().catch((e) => { console.error('Could not start the tunnel: ' + e.message); process.exit(1); });
