# BambiPro

Capture the flag with balls. Node server, browser client.

```
npm install
npm start                               # http://localhost:3000
npm run tunnel                          # public https address through a Cloudflare quick tunnel
TUNNEL_TOKEN=<token> npm run tunnel     # your own domain through a named Cloudflare tunnel
```

For a named tunnel: Cloudflare dashboard → Zero Trust → Networks → Tunnels, create one, point a
public hostname at `http://localhost:3000`, copy the token.

On an Ubuntu server: `sudo TUNNEL_TOKEN=<token> bash deploy/setup.sh` (or without the token for Caddy
on a public IP).

- `server/` site, groups, queues, replays, accounts
- `engine/` the game (runs on the server; the client loads `box2d.js` and `constants.js` for prediction)
- `public/js/game/` the game client
- `tools/make-flairs.py` builds the flair sheet; `tools/make-admin.js`, `tools/set-password.js`

Texture packs and maps are by their community authors (credited on the settings and maps pages).
Box2DWeb is zlib licensed. Fonts are SIL OFL (`public/fonts`).
