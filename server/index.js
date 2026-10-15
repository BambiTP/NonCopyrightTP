// BambiPro server: site pages, group/joiner/game sockets, accounts, replays.
const http = require('http');
const path = require('path');
const os = require('os');
const express = require('express');
const { Server } = require('socket.io');
const sessions = require('./sessions');
const pages = require('./pages');
const groups = require('./groups');
const games = require('./games');
const accounts = require('./accounts');
const replays = require('./replays');
const mapstats = require('./mapstats');
const admin = require('./admin');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0'; // the VPS service sets 127.0.0.1 so only Caddy is public
const PUBLIC = path.join(__dirname, '..', 'public');
const music = require(path.join(PUBLIC, 'music.json'));

const app = express();
const server = http.createServer(app);
// Anything that acts for a visitor must come from this site's own pages. Browsers count every
// other *.sslip.io address as the same "site", so SameSite cookies alone don't stop those.
function fromOtherSite(req) {
  const site = req.headers['sec-fetch-site'];
  if (site === 'cross-site' || site === 'same-site') return true;
  const o = req.headers.origin;
  if (!o) return false; // not a browser page
  try { return new URL(o).host !== (req.headers['x-forwarded-host'] || req.headers.host); } catch (e) { return true; }
}
const io = new Server(server, { transports: ['websocket', 'polling'], allowRequest: (req, ok) => ok(null, !fromOtherSite(req)) });

app.use(require('compression')());
app.use(express.urlencoded({ extended: true, limit: '50kb' }));
app.use((req, res, next) => (req.method !== 'GET' && req.method !== 'HEAD' && fromOtherSite(req) ? res.status(403).send('Requests from other sites are not allowed.') : next()));
app.use(sessions.middleware);
// links that change something (log out, leave group): ignored when another site sends the visitor
const ownLink = (req) => !fromOtherSite(req);

// log in / sign up attempts: per address (and per username for log ins), failures only
const attempts = new Map(); // key -> [timestamps]
function limited(key, max, ms) {
  const now = Date.now(), list = (attempts.get(key) || []).filter((t) => now - t < ms);
  attempts.set(key, list);
  return list.length >= max;
}
const note = (key) => attempts.set(key, (attempts.get(key) || []).concat(Date.now()));
setInterval(() => { const now = Date.now(); for (const [k, l] of attempts) if (!l.some((t) => now - t < 3600000)) attempts.delete(k); }, 600000).unref();
// the visitor's address: Caddy or cloudflared (on this machine) passes it in X-Forwarded-For
function clientIp(req) {
  const ip = req.socket.remoteAddress || '';
  if (!/^(::ffff:)?127\.|^::1$/.test(ip)) return ip;
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean);
  return fwd.length ? fwd[fwd.length - 1] : ip;
}

pages.setStatsProvider(() => {
  const live = [...games.games.values()].filter((r) => !r.closed);
  return {
    STATS_PLAYERS: live.reduce((n, r) => n + r.playerCount(), 0),
    STATS_GAMES: live.length,
    STATS_ONLINE: io.engine.clientsCount,
  };
});

const html = (res, s) => res.type('html').send(s);

// texture packs: the picker stores the chosen pack (image URLs) in the "textures" cookie (and
// on the account); game/replay pages get those images. Default: Muscle's Cup Gradients.
const PACKS = require(path.join(__dirname, '..', 'ref-data', 'texture-packs.json'));
const DEFAULT_PACK = PACKS.find((p) => p.name === "Muscle's Cup Gradients") || PACKS[0];
const ASSET_KEYS = ['tiles', 'splats', 'speedpad', 'speedpadRed', 'speedpadBlue', 'portal', 'portalRed', 'portalBlue'];
const okUrl = (u) => typeof u === 'string' && (/^\/textures\/[\w-]+\/[\w-]+\.png$/.test(u) || /^https:\/\/[^"'<>\s]+$/.test(u));
function chosenPack(req) {
  let pack = req.session.account && req.session.account.textures;
  if (!pack) { try { pack = JSON.parse(sessions.parseCookies(req.headers.cookie).textures || 'null'); } catch (e) { pack = null; } }
  return pack && typeof pack === 'object' ? pack : DEFAULT_PACK;
}
function textureUrls(req) {
  const pack = chosenPack(req), out = {};
  for (const k of ASSET_KEYS) out[k] = okUrl(pack[k]) ? pack[k] : DEFAULT_PACK[k];
  return out;
}
// config for the game page script, as JSON that is safe inside <script>
const scriptJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
// every page shows the logged-in name in the header. The request is tracked per request chain
// (AsyncLocalStorage), not in a shared variable: with async handlers (log in) another visitor's
// request could otherwise land in between and their name would be shown.
const _render = pages.render;
const requestStore = new (require('async_hooks').AsyncLocalStorage)();
const origin = (req) => req ? `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.headers.host}` : '';
pages.render = (name, vars = {}) => {
  const req = requestStore.getStore();
  return _render(name, Object.assign({
    USER_NAME: req && req.session.account ? req.session.account.displayName : '',
    ORIGIN: pages.esc(origin(req)),
    THEME: req ? sessions.parseCookies(req.headers.cookie).style : '',
  }, vars));
};
app.use((req, res, next) => requestStore.run(req, next));
// ?style=<name> on any page switches the site style (handy for comparing them)
app.use((req, res, next) => {
  const st = req.query.style;
  if (typeof st === 'string' && pages.THEMES.includes(st)) {
    res.append('Set-Cookie', `style=${st}; Path=/; Max-Age=${60 * 60 * 24 * 365 * 5}; SameSite=Lax`);
    req.headers.cookie = (req.headers.cookie ? req.headers.cookie + '; ' : '') + 'style=' + st;
  }
  next();
});

const card = (title, content, script) => pages.render('card.html', { TITLE: title, CARD: content, PAGE_SCRIPT: script || '' });

// accounts
app.get('/login', (req, res) => req.session.account ? res.redirect('/profile') : html(res, card('Log In - BambiPro', pages.loginCard())));
const TOO_MANY = 'Too many tries. Wait a few minutes and try again.';
app.post('/login', async (req, res) => {
  const ipKey = 'login-ip:' + clientIp(req), userKey = 'login-user:' + String(req.body.username || '').trim().toLowerCase();
  if (limited(ipKey, 10, 600000) || limited(userKey, 10, 600000)) return html(res, card('Log In - BambiPro', pages.loginCard(TOO_MANY)));
  const r = await accounts.login(req.body.username, req.body.password);
  if (r.error) { note(ipKey); note(userKey); return html(res, card('Log In - BambiPro', pages.loginCard(r.error))); }
  accounts.bind(sessions.rotate(req, res), r.account); // new cookie: an id seen before log in is worthless
  res.redirect('/');
});
app.post('/register', async (req, res) => {
  const ipKey = 'register-ip:' + clientIp(req);
  if (limited(ipKey, 5, 3600000)) return html(res, card('Log In - BambiPro', pages.loginCard(TOO_MANY)));
  const r = await accounts.register(req.body.username, req.body.password);
  if (r.error) return html(res, card('Log In - BambiPro', pages.loginCard(r.error)));
  note(ipKey);
  accounts.bind(sessions.rotate(req, res), r.account);
  res.redirect('/profile');
});
app.get('/logout', (req, res) => { if (ownLink(req)) { accounts.unbind(req.session); sessions.rotate(req, res); } res.redirect('/'); });
app.get('/profile', (req, res) => {
  if (!req.session.account) return res.redirect('/login');
  html(res, card('Profile - BambiPro', pages.profileCard(req.session.account, accounts.flairs), '/js/profile.js'));
});
app.post('/profile', (req, res) => {
  const r = accounts.setDisplayName(req.session, req.body.displayedName);
  if (r.error) return res.json(r);
  res.json({ success: true, reservedName: req.session.account.username, displayName: req.session.account.displayName });
});
app.post('/profile/selectedFlair', (req, res) => res.json(accounts.setFlair(req.session, req.body.flair)));

// replays
app.get('/replays', (req, res) => html(res, pages.render('replays.html', { USER_ID: req.session.account ? req.session.account.id : '' })));
app.get('/replays/data', (req, res) => res.json(replays.list(req.query, req.session.account && req.session.account.id)));
app.get('/replays/gameFile', (req, res) => {
  const id = req.query.key ? replays.keyToGameId(req.query.key) : String(req.query.gameId || '');
  const f = replays.file(id);
  if (!f) { res.set('X-Replay-Error', 'Replay not found'); return res.status(404).send('Replay not found'); }
  res.set('X-Replay-Filename', f.name);
  if (!req.query.key) res.attachment(f.name.replace(/[^\w .-]/g, '_') + '.ndjson');
  res.type('text/plain').send(replays.ensureId(require('fs').readFileSync(f.path, 'utf8')));
});

// leaders + public profiles
app.get('/leaders', (req, res) => html(res, card('Leaders - BambiPro', pages.leadersCard(accounts.rankedBoard()))));
app.get('/profile/:id', (req, res) => {
  const a = accounts.byId(req.params.id);
  if (!a) return res.redirect('/');
  html(res, card('Profile - BambiPro', pages.publicProfileCard(a, a.flair ? accounts.flairByKey[a.flair] : null, replays.gamesFor(a.id))));
});

// admin control panel (public game map/settings)
app.get('/admin', (req, res) => {
  if (!admin.isAdmin(req.session)) return req.session.account ? res.status(403).send('Not an admin') : res.redirect('/login');
  const failed = req.query.failed ? String(req.query.failed) : '';
  const invalid = req.query.invalid ? String(req.query.invalid) : '';
  const errors = [failed ? `Couldn't download from Fortunate Maps: ${failed}` : '', invalid ? `Not saved: ${invalid}` : ''].filter(Boolean).join(' ');
  html(res, card('Admin - BambiPro', admin.panel(req.query.saved ? 'Saved. The next public game uses these settings.' : '', errors), '/js/mappreview.js /js/admin.js'));
});
app.post('/admin', async (req, res) => {
  if (!admin.isAdmin(req.session)) return res.status(403).send('Not an admin');
  const { failed, invalid } = await admin.update(req.body, games.fetchFortunateMap, games.mapProblem);
  res.redirect('/admin?saved=1' + (failed.length ? '&failed=' + encodeURIComponent(failed.join(', ')) : '')
    + (invalid.length ? '&invalid=' + encodeURIComponent(invalid.join(' ')) : ''));
});
app.post('/admin/reset', (req, res) => {
  if (!admin.isAdmin(req.session)) return res.status(403).send('Not an admin');
  admin.reset(); res.redirect('/admin?saved=1');
});

// maps page
app.get('/maps', (req, res) => html(res, pages.render('maps.html')));
app.get('/maps.json', (req, res) => res.json(mapstats.allMapData()));
// the installed maps (the group page's map list) and their layout images (previews are drawn from them)
app.get('/maps/list.json', (req, res) => res.json(games.mapList()));
app.get('/maps/png/:key', (req, res) => {
  const key = String(req.params.key).replace(/\.png$/, '');
  if (!games.mapKeys().includes(key) || key.startsWith('upload-')) return res.status(404).send('No such map');
  res.set('Cache-Control', 'public, max-age=3600').sendFile(path.join(__dirname, '..', 'maps', key + '.png'));
});

// texture packs (the choice also goes on the account) and settings (kept in the browser)
app.get('/textures', (req, res) => html(res, pages.render('textures.html', {
  PACKS_JSON: pages.esc(JSON.stringify({ packs: PACKS.map((p) => ({ name: p.name, author: p.author, ...Object.fromEntries(ASSET_KEYS.map((k) => [k, p[k]])) })), chosen: textureUrls(req) })),
})));
app.get('/settings', (req, res) => html(res, pages.render('settings.html')));
app.post('/textures', (req, res) => {
  if (req.session.account) { require('./accounts').setTextures(req.session, req.body); }
  res.json({ success: true });
});

app.get('/', (req, res) => html(res, pages.render('home.html', { GROUP_ID: req.session.groupId || 'null', PACK: pages.esc(JSON.stringify(textureUrls(req))) })));

// what's on right now, for the home page: listed groups and running games anyone can watch
app.get('/live.json', (req, res) => {
  const listed = [...groups.groups.values()].filter((g) => g.settings.discoverable && g.members.size);
  const watchable = (r) => !r.closed && !r.ended && (!r.groupId || listed.some((g) => g.id === r.groupId));
  res.json({
    groups: listed.map((g) => ({ id: g.id, name: g.settings.name, players: g.members.size, playing: !!g.game.gameId })),
    games: [...games.games.values()].filter(watchable).map((r) => ({
      id: r.id, map: r.mapName, red: r.score.r, blue: r.score.b, players: r.playerCount(), ranked: !!r.ranked,
      group: r.groupId ? (groups.groups.get(r.groupId) || {}).settings.name : null,
    })),
    queue: require('./queue').counts(), ranked: require('./ranked').counts(),
  });
});
app.get('/games/watch/:id', (req, res) => {
  const room = games.games.get(req.params.id);
  if (!room || room.closed || room.ended) return res.redirect('/');
  req.session.pendingGame = { id: room.id, team: null, spectate: true };
  res.redirect('/game');
});

app.get(['/groups', '/groups/'], (req, res) => {
  const list = [...groups.groups.values()].filter((g) => g.settings.discoverable && g.members.size).map(pages.groupItem).join('\n');
  html(res, pages.render('groups.html', { GROUPS_LIST: list || '<p class="muted">No open groups. Make one.</p>' }));
});

function createGroup(req, res, opts) {
  groups.leave(req.session);
  const g = new groups.Group(opts);
  if (opts.preset) g.applyPreset(opts.preset);
  res.redirect('/groups/' + g.id);
}
app.post('/groups/create', (req, res) => createGroup(req, res, {
  name: req.body.name, discoverable: req.body.public === 'on', isPrivate: req.body.private === 'on', preset: req.body.preset,
}));
app.get('/groups/create', (req, res) => createGroup(req, res, { name: '', isPrivate: true, discoverable: false, preset: req.query.preset }));
app.get('/groups/leave', (req, res) => { if (ownLink(req)) groups.leave(req.session); res.redirect('/groups'); });

app.get('/groups/:id', (req, res, next) => {
  if (!/^[a-z]{8}$/.test(req.params.id)) return next();
  const g = groups.groups.get(req.params.id);
  if (!g) return res.redirect('/groups');
  if (req.session.groupId && req.session.groupId !== g.id) groups.leave(req.session);
  html(res, pages.render('group.html', { GROUP_ID: g.id, GROUP_NAME: pages.esc(g.settings.name) }));
});

// group map upload (layout png + logic json)
const upload = require('multer')({ storage: require('multer').memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 2, fields: 10, parts: 12 } });
app.post('/groups/testmap', upload.fields([{ name: 'layout', maxCount: 1 }, { name: 'logic', maxCount: 1 }]), (req, res) => {
  const g = req.session.groupId && groups.groups.get(req.session.groupId);
  const m = g && g.members.get(req.session.publicId);
  if (!m || !m.leader) return res.json({ success: false, error: 'Only the group leader can upload a map.' });
  const layout = req.files && req.files.layout && req.files.layout[0], logic = req.files && req.files.logic && req.files.logic[0];
  if (!layout || !logic) return res.json({ success: false, error: 'You must upload both layout and logic files' });
  try {
    const json = JSON.parse(logic.buffer.toString('utf8'));
    games.checkPngSize(layout.buffer); // before decoding: a small file can decode to a huge image
    require('pngjs').PNG.sync.read(require('../engine/mapLoader').trimPng(layout.buffer));
    const key = 'upload-' + g.id + '-' + Date.now();
    require('fs').writeFileSync(path.join(__dirname, '..', 'maps', key + '.png'), layout.buffer);
    require('fs').writeFileSync(path.join(__dirname, '..', 'maps', key + '.json'), JSON.stringify(json));
    const problem = games.mapProblem(key);
    if (problem) {
      for (const ext of ['png', 'json']) require('fs').unlinkSync(path.join(__dirname, '..', 'maps', key + '.' + ext));
      return res.json({ success: false, error: problem });
    }
    g.settings.map = 'upload/' + key; g.broadcastSetting('map');
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e instanceof games.MapError ? e.message : 'Invalid map files' }); }
});

app.get('/games/find', (req, res) => {
  const g = req.session.groupId && groups.groups.get(req.session.groupId);
  // ?type=ranked: the Eggball Ranked queue (logged in only); anything else is casual Play Now
  const type = req.query.type === 'ranked' ? 'ranked' : 'casual';
  if (type === 'ranked' && !g && !req.session.account) return res.redirect('/login');
  req.session.joinType = type;
  const r = req.session.account ? accounts.rankedOf(req.session.account) : null;
  html(res, pages.render('find.html', {
    GROUP_ID: g ? g.id : 'null', PRIVATE_GROUP: g && g.settings.isPrivate ? 'true' : '', JOIN_TYPE: type,
    CASUAL_ACTIVE: type === 'casual' ? 'btn-primary' : 'btn-default', RANKED_ACTIVE: type === 'ranked' ? 'btn-primary' : 'btn-default',
    RANKED_INFO: type === 'ranked' && r ? `Your eggball rating: <b>${r.rating}</b>` : '',
  }));
});

// the game page: one page for live games and replays (/game?replay=<key>); the client is /js/game/*
const gameVersion = () => { try { return Math.floor(require('fs').statSync(path.join(PUBLIC, 'js', 'game')).mtimeMs); } catch (e) { return 0; } };
function gamePage(req, config) {
  return pages.render('game.html', { GAME_CONFIG: scriptJson({ textures: textureUrls(req), ...config }), V: gameVersion() });
}
app.get('/game', (req, res) => {
  if (req.query.replay) return html(res, gamePage(req, { mode: 'replay', replay: String(req.query.replay).slice(0, 80) }));
  const pg = req.session.pendingGame;
  const room = pg && games.games.get(pg.id);
  if (!room || room.closed) return res.redirect('/');
  html(res, gamePage(req, {
    mode: 'live', socket: '/game/' + room.id, gameId: room.id, groupId: room.groupId || null,
    ranked: !!room.ranked, // Eggball Ranked: double-tap Shift votes to keep playing after a teammate leaves
    localTrust: room.localTrust ? room.trustConfig() : null,
  }));
});

// public queue status for the homepage (Play Now)
app.get('/queue/status', (req, res) => res.json(require(req.query.type === 'ranked' ? './ranked' : './queue').counts()));

// music list
app.get('/music', (req, res) => res.jsonp(music));

// the shared game engine: the client predicts physics with the same code as the server
for (const f of ['box2d.js', 'constants.js']) app.get('/engine/' + f, (req, res) => res.set('Cache-Control', 'public, max-age=3600').type('js').sendFile(path.join(__dirname, '..', 'engine', f)));
app.use(express.static(PUBLIC, { index: false, maxAge: '7d' }));

groups.attach(io, { launchGroupGame: (g) => games.launchGroupGame(g).catch((e) => console.error('launch failed', e)), endGame: games.endGame });
games.attachJoiner(io);
mapstats.attach(io, replays.index);
games.attachGames(io);

server.listen(PORT, HOST, () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`BambiPro on http://localhost:${PORT}`);
  if (HOST !== '127.0.0.1') for (const ip of ips) console.log(`  LAN: http://${ip}:${PORT}`);
});
