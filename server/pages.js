// Page templates (server/pages/). Templates that aren't a full document start with a
// title/script/nav/class header and get wrapped in layout.html.
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'pages');
const cache = {};
function tpl(name) {
  // re-read in dev so template rebuilds show up without a restart
  const file = path.join(dir, name);
  const mtime = fs.statSync(file).mtimeMs;
  if (!cache[name] || cache[name].mtime !== mtime) cache[name] = { mtime, text: fs.readFileSync(file, 'utf8') };
  return cache[name].text;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let statsProvider = () => ({});
function setStatsProvider(fn) { statsProvider = fn; }

// site styles (public/css/site.css), picked on the settings page
const THEMES = ['slate', 'light', 'midnight', 'black', 'forest', 'sand', 'grape', 'teams', 'steel'];
const NAV = [['/', 'Play'], ['/groups', 'Groups'], ['/replays', 'Replays'], ['/maps', 'Maps'], ['/leaders', 'Leaders']];

// "<!--\ntitle: X\nscript: /js/a.js /js/b.js\nclass: card-page\n-->" at the top of a template
function splitHeader(text) {
  const m = text.match(/^<!--\n([\s\S]*?)\n-->\n?/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split('\n')) { const i = line.indexOf(':'); if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  return { meta, body: text.slice(m[0].length) };
}

function layout(meta, body, vars) {
  const path = meta.nav || '';
  const nav = NAV.map(([href, label]) => `<a href="${href}"${href === path ? ' class="active"' : ''}>${label}</a>`).join('');
  const who = `<a class="gear${path === '/settings' ? ' active' : ''}" href="/settings" title="Settings">Settings</a>`
    + (vars.USER_NAME ? `<a id="login-btn" class="btn btn-small" href="/profile">${esc(vars.USER_NAME)}</a>`
      : '<a id="login-btn" class="btn btn-small" href="/login">Log in</a>');
  const scripts = (meta.script || '').split(/\s+/).filter(Boolean).map((s) => `<script src="${esc(s)}"></script>`).join('\n');
  const parts = {
    TITLE: meta.title || 'BambiPro', // already escaped where it came from a variable
    NAV: nav, WHO: who, PAGE_CLASS: esc(meta.class || ''), SCRIPTS: scripts,
    ORIGIN: vars.ORIGIN || '',
    THEME: THEMES.includes(vars.THEME) ? vars.THEME : 'slate',
  };
  return tpl('layout.html').replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k === 'BODY' ? m : Object.hasOwn(parts, k) ? parts[k] : m))
    .replace('{{BODY}}', () => body);
}

function render(name, vars = {}) {
  vars = Object.assign({}, statsProvider(), vars);
  let html = tpl(name).replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (Object.hasOwn(vars, k) ? vars[k] : m));
  if (!/^\s*<!doctype/i.test(html)) { const { meta, body } = splitHeader(html); html = layout(meta, body, vars); }
  return html;
}

// public-game stats (Play Now) + degree progress, shown on profiles
function statsTable(account) {
  const A = require('./accounts');
  const st = Object.assign(A.emptyStats(), account.stats || {});
  const deg = A.degreeFor(st.wins), next = A.winsForDegree(deg + 1);
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0) + '%';
  const hms = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  const per = (n) => (st.games ? (n / st.games).toFixed(2) : '0.00');
  const rows = [
    ['Degree', `${deg}&deg;`, deg < 360 ? `${next - st.wins} more ${next - st.wins === 1 ? 'win' : 'wins'} to ${deg + 1}&deg;` : ''],
    ['Games', st.games, ''], ['Wins', st.wins, pct(st.wins, st.games)], ['Losses', st.losses, ''], ['Ties', st.ties, ''],
    ['Time Played', hms(st.timePlayed), ''],
    ['Captures', st.captures, per(st.captures) + ' / game'], ['Grabs', st.grabs, per(st.grabs) + ' / game'],
    ['Hold', hms(st.hold * 1000), ''], ['Tags', st.tags, per(st.tags) + ' / game'], ['Pops', st.pops, per(st.pops) + ' / game'],
    ['Returns', st.returns, per(st.returns) + ' / game'], ['Prevent', hms(st.prevent * 1000), ''],
    ['Support', st.support, ''], ['Powerups', st.powerups, per(st.powerups) + ' / game'],
  ];
  return `<h3>Casual stats</h3>
    <table class="table table-condensed"><tbody>${rows.map(([k, v, x]) => `<tr><td>${k}</td><td class="text-right"><b>${v}</b></td><td class="text-right" style="opacity:.7">${x}</td></tr>`).join('')}</tbody></table>${rankedTable(account)}`;
}

// Eggball Ranked (server/ranked.js), shown once the account has played a ranked game
function rankedTable(account) {
  const r = require('./accounts').rankedOf(account);
  if (!r.games) return '';
  const rows = [['Rating', r.rating], ['Games', r.games], ['Wins', r.wins], ['Losses', r.losses], ['Ties', r.ties], ['Games left early', r.leaves]];
  return `<h3>Ranked eggball</h3>
    <table class="table table-condensed"><tbody>${rows.map(([k, v]) => `<tr><td>${k}</td><td class="text-right"><b>${v}</b></td></tr>`).join('')}</tbody></table>`;
}

function leadersCard(board) {
  const rows = board.map((r, i) => `<tr><td>${i + 1}</td><td><a href="/profile/${esc(r.account.id)}">${esc(r.account.displayName)}</a></td><td class="text-right"><b>${r.rating}</b></td><td class="text-right">${r.wins}-${r.losses}-${r.ties}</td><td class="text-right">${r.games}</td></tr>`).join('');
  return `<h1>Leaders</h1><p class="muted">Ranked eggball. Everyone starts at 1500.</p>
    <table class="table table-condensed"><thead><tr><th>#</th><th>Player</th><th class="text-right">Rating</th><th class="text-right">W-L-T</th><th class="text-right">Games</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5" style="opacity:.7">No ranked games yet.</td></tr>'}</tbody></table>`;
}

function loginCard(error, tab) {
  const field = (label, name, type, extra = '') => `
                            <div class="form-group">
                                <label class="col-sm-4 control-label" for="${name}">${label}</label>
                                <div class="col-sm-8"><input class="form-control" id="${name}" name="${name}" type="${type}" ${extra}></div>
                            </div>`;
  return `
                        <h1>Log In</h1>
                        ${error ? `<div class="alert alert-danger">${esc(error)}</div>` : ''}
                        <form class="form form-horizontal" action="/login" method="post">${field('Username', 'username', 'text', 'maxlength="16" autocomplete="username" required')}${field('Password', 'password', 'password', 'autocomplete="current-password" required')}
                            <div class="form-group"><div class="col-sm-12 text-center"><button class="btn btn-primary" type="submit">Log In</button></div></div>
                        </form>
                        <hr>
                        <h1>Create Account</h1>
                        <form class="form form-horizontal" action="/register" method="post">${field('Username', 'username', 'text', 'maxlength="16" autocomplete="username" required')}${field('Password', 'password', 'password', 'minlength="6" autocomplete="new-password" required')}
                            <div class="form-group"><div class="col-sm-12 text-center"><button class="btn btn-default" type="submit">Create Account</button></div></div>
                        </form>`;
}

function profileCard(account, flairs) {
  const items = [{ key: '', className: '', x: -1, y: -1, description: 'No Flair', extra: 'Remove your flair', category: '' }].concat(flairs).map((f) => `
                                <li class="otherFlair">
                                    <div class="flair-item flair-available${(account.flair || '') === f.key ? ' selected' : ''}" data-flair="${esc(f.key)}">
                                        ${f.key ? `<span class="flair ${esc(f.className)}" style="--flair-col: ${f.x}; --flair-row: ${f.y};"></span>` : '<span class="noflair"></span>'}
                                        <div class="flair-tooltip">
                                            <div class="flair-header">${esc(f.description)}</div>
                                            <div class="flair-description">${esc(f.extra || '')}</div>
                                            <div class="flair-footer"><div class="flair-type">${esc(f.category)}</div></div>
                                        </div>
                                    </div>
                                </li>`).join('');
  return `<div class="profile">
                        <h1>${esc(account.displayName)}</h1>
                        <form class="form form-horizontal" action="/profile" method="post">
                            <div class="form-group">
                                <label class="col-sm-4 control-label" for="reservedName">Username</label>
                                <div class="col-sm-8"><input class="form-control" id="reservedName" name="reservedName" type="text" value="${esc(account.username)}" disabled></div>
                            </div>
                            <div class="form-group">
                                <label class="col-sm-4 control-label" for="displayedName">Display Name</label>
                                <div class="col-sm-8"><input class="form-control" id="displayedName" name="displayedName" type="text" maxlength="12" value="${esc(account.displayName)}"></div>
                            </div>
                            <div class="form-group">
                                <div class="col-sm-12 text-center">
                                    <div class="form-status" style="margin-bottom: 10px;"></div>
                                    <button id="saveSettings" class="btn btn-primary" type="submit">Save</button>
                                    <a class="btn btn-default" href="/logout">Log Out</a>
                                </div>
                            </div>
                        </form>
                        <hr>
                        ${statsTable(account)}
                        <hr>
                        <h2>Flair</h2>
                        <div class="profile-flair block">
                            <div class="tab-content">
                                <div class="tab-pane active" id="flair">
                                    <ul class="flair-list js-flair-owner">${items}
                                    </ul>
                                </div>
                            </div>
                        </div></div>`;
}

function groupItem(g) {
  const members = g.memberList();
  return `<a class="row-link" href="/groups/${g.id}">
    <span class="title">${esc(g.settings.name)}</span>
    <span class="muted">${members.map((m) => esc(m.name)).join(', ')}</span>
    <span class="count">${members.length}</span></a>`;
}

const flairSpan = (f) => f ? `<span class="flair ${esc(f.className)}" style="--flair-col: ${f.x}; --flair-row: ${f.y}; display:inline-block; vertical-align:middle;"></span> ` : '';

function publicProfileCard(a, flairObj, games) {
  const rows = games.map((g) => {
    const me = g.players.find((p) => p.userId === a.id);
    const team = me ? (me.team === 1 ? 'red' : 'blue') : null;
    const won = me && g.winner === me.team;
    const key = Buffer.from(g.id + a.id, 'hex').toString('base64').replace(/\+/g, '_');
    return `<tr><td>${esc(g.started.slice(0, 16).replace('T', ' '))}</td><td>${esc(g.mapName)}</td>
      <td class="${team || 'no'}-team-text">${team ? esc(g.teams[team].name) : ''}</td>
      <td>${g.teams.red.score} - ${g.teams.blue.score}${won ? ' (won)' : ''}</td>
      <td><a href="/game?replay=${key}" target="_blank">Watch</a></td></tr>`;
  }).join('');
  return `<div class="profile"><h1>${flairSpan(flairObj)}${esc(a.displayName)}</h1>
    <p style="opacity:.7">${esc(a.username)} · joined ${new Date(a.created).toISOString().slice(0, 10)}</p>
    ${statsTable(a)}
    <h3>Recent Games</h3>
    ${rows ? `<table class="table"><thead><tr><th>Date</th><th>Map</th><th>Team</th><th>Score</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<p style="opacity:.7">No games yet.</p>'}</div>`;
}

module.exports = { THEMES, publicProfileCard, leadersCard, render, esc, groupItem, setStatsProvider, loginCard, profileCard, statsTable };
