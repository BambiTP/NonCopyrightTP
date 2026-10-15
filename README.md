# NonCopyrightTP (BambiPro)

A capture-the-flag ball game you play in the browser: a Node server (groups, matchmaking, ranked
eggball, replays, accounts) and its own browser client, with no Koalabeast-owned code or art.

Split from `tagpro-local`, which served the real TagPro client. Everything Koalabeast made is gone:
their client code and page templates, UI art, event art, help images, flair sheet, the stock
"Classic" and "TagPro Next Classic" textures, and the map previews their site rendered. The browser
client here was written from scratch against this server's own protocol.

## Run it

```
npm install
npm start            # http://localhost:3000  (PORT and HOST env vars change it)
```

### On the internet with Cloudflare Tunnel

cloudflared connects out to Cloudflare, so no open ports, router setup or certificate are needed
(it is used from your PATH, or downloaded into `bin/` the first time).

```
npm run tunnel                          # free quick tunnel: prints https://<words>.trycloudflare.com
TUNNEL_TOKEN=<token> npm run tunnel     # your own domain, same address every time
```

For your own domain: Cloudflare dashboard → Zero Trust → Networks → Tunnels → create a tunnel, add a
public hostname (e.g. `play.example.com`) pointing at `http://localhost:3000`, and copy the token.
The quick tunnel's address changes every restart and has no uptime guarantee, so use it for testing.

On an always-on Ubuntu server, `sudo TUNNEL_TOKEN=<token> bash deploy/setup.sh` installs the game and
cloudflared as systemd services and closes the web ports (only SSH stays open). Without
`TUNNEL_TOKEN` it uses Caddy on a public IP instead.

`deploy/fetch-music.sh` downloads the community music tracks on a server (they aren't in the repo).

## What's where

| Path | |
|---|---|
| `server/` | Express + socket.io server: pages, groups (`groups.js`), joiner and game rooms (`games.js`), Play Now queue, Eggball Ranked, replays, accounts, admin panel, peer-to-peer hosting |
| `engine/` | The game itself (`game.js`), Box2D physics, map loader. Runs on the server; the browser client loads `box2d.js` and `constants.js` to predict physics with the same code |
| `server/pages/` | Page templates. Content templates start with a `title/script/nav` header and are wrapped in `layout.html` |
| `public/js/` | Page scripts: `group.js` (group page), `find.js` (joiner), `maps.js`, `replays.js`, `textures.js`, `settings.js`, `profile.js` |
| `public/js/game/` | The game client: `core.js` (state + every server packet), `physics.js` (prediction), `render.js` (canvas), `ui.js` (HUD, chat, scoreboard), `trust.js` (Local Trust), `replay.js` (replay viewer), `main.js` (input, camera, wiring), `walls.js` (wall-piece table) |
| `public/textures/` | Community texture packs (default: Muscle's Cup Gradients) |
| `public/images/flair.png` | Flair icons, drawn by `tools/make-flairs.py` |
| `maps/` | Maps from Fortunate Maps (community-made); `rotation.json` is the Play Now rotation |

## Notes

- `engine/box2d.js` is Box2DWeb (zlib license), the same build the physics was calibrated against.
- `public/js/game/walls.js` says which 20 px piece of a texture pack's wall area draws each quarter of
  a wall tile. It's data about the community texture template's layout, measured by rendering random
  maps and matching every quarter against the sheet.
- Settings are kept in the browser (`localStorage`); the chosen texture pack is a cookie (and saved
  on the account when logged in).
