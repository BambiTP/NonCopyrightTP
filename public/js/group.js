// group.js - the group page. Talks to the group socket (/groups/<id>, server/groups.js):
//   in:  you, member, removed, setting, game, servers, loaded, chat, play, p2p, groupKick, full,
//        groupPreset, groupPresetResult
//   out: touch, chat, team, setting, leader, kick, pub, pug, swapTeams, randomTeams, groupPlay,
//        endGame, groupPresetGenerate, groupPresetApply, applyPersonalMute, removePersonalMute,
//        p2pStatus, p2pAgree
(function () {
  var $ = BP.$, $$ = BP.$$, esc = BP.esc;
  var root = $('#group');
  var gid = root.getAttribute('data-group');
  var TEAM = { PLAYING: 0, RED: 1, BLUE: 2, SPECTATING: 3, WAITING: 4 };

  var me = null;            // my member id
  var members = {};         // id -> member
  var settings = {};        // name -> value
  var game = { gameId: null };
  var servers = [];
  var mapList = [];
  var loaded = false;

  var socket = io('/groups/' + gid, { transports: ['websocket', 'polling'] });
  window.bpGroup = { socket: socket, members: members, settings: settings }; // for tests and the console
  var leader = function () { return !!(members[me] && members[me].leader); };

  // ---------------------------------------------------------------- settings schema
  var range = function (a, b, step, fmt) { var o = []; for (var v = a; v <= b + 1e-9; v += step) { var n = Math.round(v * 100) / 100; o.push([n, fmt ? fmt(n) : String(n)]); } return o; };
  var pct = function (v) { return Math.round(v * 100) + '%'; };
  var secs = function (list) { return list.map(function (s) { return [s * 1000, s === 0 ? 'Instant' : s + ' s']; }); };
  var SECTIONS = [
    ['Game', [
      { k: 'map', type: 'map', label: 'Map' },
      { k: 'mode', label: 'Mode', opts: [['classic', 'Capture the flag'], ['eggball', 'Eggball'], ['gravity', 'Gravity']] },
      { k: 'time', label: 'Time limit', opts: range(1, 30, 1, function (v) { return v + ' min'; }) },
      { k: 'caps', label: 'Capture limit', opts: [[0, 'None']].concat(range(1, 10, 1), [[15, '15'], [20, '20']]) },
      { k: 'mercyRule', label: 'Mercy rule (lead to win)', opts: [[0, 'Off']].concat(range(1, 10, 1)) },
      { k: 'overtime', label: 'Overtime when tied', check: true },
      { k: 'lastPossession', label: 'Clutch time for a held flag', opts: [['disabled', 'Off'], ['always', 'Always'], ['tied', 'When tied'], ['winnable', 'When one cap from tying'], ['tiedOrWinnable', 'Tied or one cap from tying']] },
      { k: 'redTeamScore', label: 'Red starting score', num: [0, 50] },
      { k: 'blueTeamScore', label: 'Blue starting score', num: [0, 50] },
      { k: 'mapTestingMode', label: 'Map testing mode (R resets the map)', check: true },
    ]],
    ['Movement', [
      { k: 'accel', label: 'Acceleration', opts: range(0.5, 3, 0.1, pct) },
      { k: 'topspeed', label: 'Top speed', opts: range(0.5, 3, 0.1, pct) },
      { k: 'bounce', label: 'Bounciness', opts: range(0, 3, 0.1, pct) },
      { k: 'ghostMode', label: 'Ghost mode', opts: [['disabled', 'Off: everyone collides'], ['noPlayerCollisions', 'No player collisions'], ['noTeamCollisions', 'No team collisions'], ['noEnemyCollisions', 'No enemy collisions'], ['noMarsBallCollisions', 'No mars ball collisions'], ['noPlayerOrMarsCollisions', 'No player or mars ball collisions']] },
      { k: 'localTrust', label: 'Local trust: no input delay (needs a no-player-collision ghost mode)', check: true },
      { k: 'poosts', label: 'Pop and portal boosts', check: true },
      { k: 'gravityWellForce', label: 'Gravity well force', opts: range(-3, 3, 0.5) },
      { k: 'jumpLimit', label: 'Gravity: jumps in the air', opts: range(0, 10, 1).concat([[51, 'Unlimited']]) },
      { k: 'isPlayerJumpResetEnabled', label: 'Gravity: landing on a player resets jumps', check: true },
    ]],
    ['Respawns', [
      { k: 'playerRespawnTime', label: 'Player respawn', opts: secs([0, 1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30]) },
      { k: 'overtimeRespawnIncrement', label: 'Overtime: extra respawn per pop', opts: secs([0, 1, 2, 3, 4, 5, 10]) },
      { k: 'speedPadRespawnTime', label: 'Boost respawn', opts: secs([0, 1, 2, 5, 10, 15, 20, 30, 60]) },
      { k: 'dynamiteRespawnTime', label: 'Bomb respawn', opts: secs([0, 5, 10, 15, 20, 30, 45, 60, 120]) },
      { k: 'powerupRespawnTime', label: 'Powerup respawn', opts: secs([5, 10, 15, 20, 30, 45, 60, 90, 120, 180]) },
      { k: 'respawnWarnings', label: 'Flash tiles before they come back', check: true },
      { k: 'potatoTime', label: 'Hot potato: flag pops its carrier after', opts: [[0, 'Off']].concat(secs([5, 10, 15, 20, 30, 45, 60, 90, 120]).slice(0)) },
    ]],
    ['Powerups', [
      { k: 'powerupJukeJuice', label: 'Juke juice', check: true },
      { k: 'powerupRollingBomb', label: 'Rolling bomb', check: true },
      { k: 'powerupTagPro', label: 'Tag pro', check: true },
      { k: 'disableAllPups', label: 'No powerups at all', check: true },
      { k: 'powerupDelay', label: 'First powerups come after one respawn time', check: true },
      { k: 'pupIndicators', label: 'Show which powerup is coming', check: true },
      { k: 'overtimeJukeJuice', label: 'Overtime: grabbing the flag gives juke juice', check: true },
      { k: 'powerupJukeJuiceDuration', label: 'Juke juice lasts', opts: secs([5, 10, 15, 20, 30, 45, 60]) },
      { k: 'powerupRollingBombDuration', label: 'Rolling bomb lasts', opts: secs([5, 10, 15, 20, 30, 45, 60]) },
      { k: 'powerupTagproDuration', label: 'Tag pro lasts', opts: secs([5, 10, 15, 20, 30, 45, 60]) },
      { k: 'rollingBombBehavior', label: 'Rolling bomb', opts: [['default', 'Space detonates, saves you from a pop'], ['classic', 'Explodes on any contact']] },
      { k: 'rollingBombForceMultipler', label: 'Rolling bomb force', opts: range(0.5, 3, 0.1, pct) },
      { k: 'rollingBombDistanceMultipler', label: 'Rolling bomb reach', opts: range(0.5, 3, 0.1, pct) },
      { k: 'spacebarDetonateAll', label: 'Space uses every held powerup at once', check: true },
      { k: 'jukeJuiceBoost', label: 'Space with juke juice boosts you', check: true },
      { k: 'jukeJuiceBoostPower', label: 'Juke juice boost power', opts: range(10, 150, 5, function (v) { return v + '%'; }) },
      { k: 'combinejjrb', label: 'Juke juice and rolling bomb come together', check: true },
      { k: 'tagproMaxTags', label: 'Tag pro ends after this many pops', opts: [[0, 'No limit']].concat(range(1, 10, 1)) },
    ]],
    ['Rules', [
      { k: 'kissingFCs', label: 'Two flag carriers touching pop each other', check: true },
      { k: 'kissingTPs', label: 'Two tag pros touching pop each other', check: true },
      { k: 'eggballLosingTeamStarts', label: 'Eggball: the losing team gets the egg', check: true },
      { k: 'selfAssignment', label: 'Players can pick their own team', check: true },
    ]],
    ['Group', [
      { k: 'discoverable', label: 'List this group on the Groups page', check: true },
      { k: 'serverSelect', label: 'Choose the server', check: true },
      { k: 'server', type: 'server', label: 'Server' },
    ]],
  ];

  function optionHtml(opts, value) {
    var found = false;
    var html = opts.map(function (o) {
      var sel = String(o[0]) === String(value);
      if (sel) found = true;
      return '<option value="' + esc(o[0]) + '"' + (sel ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('');
    if (!found && value != null) html = '<option value="' + esc(value) + '" selected>' + esc(value) + '</option>' + html;
    return html;
  }

  function mapOptions(value) {
    var v = value == null ? 'random' : String(value);
    var opts = [['random', 'Random (rotation)']];
    if (/^fm_id\//.test(v)) opts.push([v, 'Fortunate Maps #' + v.slice(6)]);
    if (/^upload\//.test(v)) opts.push([v, 'Your uploaded map']);
    mapList.forEach(function (m) { opts.push([m.name, m.name + ' (' + m.author + ')']); });
    return optionHtml(opts, v);
  }

  function serverOptions(value) {
    return optionHtml([[null, 'Automatic']].concat(servers.map(function (s) { return [s.value, s.name]; })), value).replace('value=""', 'value="null"');
  }

  function buildSettings() {
    var html = SECTIONS.map(function (sec, i) {
      return '<details' + (i === 0 ? ' open' : '') + '><summary>' + esc(sec[0]) + '</summary><div class="grid">' + sec[1].map(function (s) {
        var v = settings[s.k];
        if (s.check) return '<label class="setting check"><input type="checkbox" data-k="' + s.k + '"' + (v === true ? ' checked' : '') + '> <span>' + esc(s.label) + '</span></label>';
        if (s.num) return '<label class="setting"><span>' + esc(s.label) + '</span><input type="number" min="' + s.num[0] + '" max="' + s.num[1] + '" data-k="' + s.k + '" value="' + esc(v == null ? 0 : v) + '"></label>';
        if (s.type === 'map') {
          return '<label class="setting"><span>' + esc(s.label) + '</span><select data-k="map">' + mapOptions(v) + '</select></label>'
            + '<label class="setting"><span>Or a Fortunate Maps ID</span><span class="input-group"><input type="text" id="fm-id" placeholder="e.g. 12345" inputmode="numeric"><button class="btn btn-default btn-sm" type="button" id="fm-go">Use</button></span></label>';
        }
        if (s.type === 'server') return '<label class="setting"><span>' + esc(s.label) + '</span><select data-k="server">' + serverOptions(v) + '</select></label>';
        return '<label class="setting"><span>' + esc(s.label) + '</span><select data-k="' + s.k + '">' + optionHtml(s.opts, v) + '</select></label>';
      }).join('') + '</div></details>';
    }).join('');
    var box = $('#settings');
    var open = $$('details', box).map(function (d) { return d.open; });
    box.innerHTML = html;
    if (open.length) $$('details', box).forEach(function (d, i) { d.open = open[i]; });
    box.classList.toggle('readonly', !leader());
  }

  // one setting changed: update its control in place (rebuilding would close dropdowns)
  function showSetting(name) {
    var el = $('#settings [data-k="' + name + '"]');
    if (!el) return;
    var v = settings[name];
    if (el.type === 'checkbox') el.checked = v === true;
    else if (name === 'map') el.innerHTML = mapOptions(v);
    else if (name === 'server') el.innerHTML = serverOptions(v);
    else if (el.tagName === 'SELECT') {
      var spec = null;
      SECTIONS.forEach(function (sec) { sec[1].forEach(function (s) { if (s.k === name) spec = s; }); });
      el.innerHTML = optionHtml(spec.opts, v);
    } else el.value = v;
  }

  $('#settings').addEventListener('change', function (e) {
    var k = e.target.getAttribute('data-k');
    if (!k || !leader()) return;
    var value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    socket.emit('setting', { name: k, value: value });
  });
  $('#settings').addEventListener('click', function (e) {
    if (e.target.id !== 'fm-go' || !leader()) return;
    var id = String($('#fm-id').value || '').trim().replace(/\D/g, '');
    if (id) socket.emit('setting', { name: 'map', value: 'fm_id/' + id });
  });

  // ---------------------------------------------------------------- members
  function memberHtml(m) {
    var mine = m.id === me;
    var canDrag = leader() || (mine && settings.selfAssignment);
    var idle = Date.now() - (m.lastSeen || 0) > 120000;
    var flair = m.flair && m.flair.x != null ? '<span class="flair-icon" style="--flair-col:' + (+m.flair.x) + ';--flair-row:' + (+m.flair.y) + '" title="' + esc(m.flair.description || '') + '"></span>' : '';
    var muted = members[me] && members[me].mutedGroupIds && members[me].mutedGroupIds[m.id];
    var acts = '';
    if (!mine && leader()) acts += '<button class="btn btn-tiny" data-act="leader">Make leader</button><button class="btn btn-tiny btn-danger" data-act="kick">Kick</button>';
    if (!mine) acts += '<button class="btn btn-tiny" data-act="mute">' + (muted ? 'Unmute' : 'Mute') + '</button>';
    return '<li class="member' + (mine ? ' me' : '') + (idle ? ' idle' : '') + '" data-id="' + esc(m.id) + '"' + (canDrag ? ' draggable="true"' : '') + '>'
      + (m.leader ? '<span class="leader-crown" title="Group leader">&#9819;</span>' : '')
      + flair + '<span class="name">' + esc(m.name) + '</span>'
      + (m.auth ? '<span class="tags" title="Registered">&#10003;</span>' : '')
      + (muted ? '<span class="tags">muted</span>' : '')
      + '<span class="actions">' + acts + '</span>'
      + '<span class="loc">' + esc(m.location && m.location !== '???' ? m.location : '') + '</span></li>';
  }

  function teamBox(team, cls, title, list, nameKey) {
    var head = nameKey && leader()
      ? '<input type="text" maxlength="12" data-team-name="' + nameKey + '" value="' + esc(settings[nameKey] || title) + '">'
      : esc(nameKey ? settings[nameKey] || title : title);
    return '<div class="team-box ' + cls + '" data-team="' + team + '"><h3>' + head + '<span class="count">' + list.length + '</span></h3><ul>'
      + list.map(memberHtml).join('') + '</ul></div>';
  }

  function renderMembers() {
    var all = Object.keys(members).map(function (id) { return members[id]; });
    var by = function (t) { return all.filter(function (m) { return m.team === t; }); };
    var html;
    if (settings.isPrivate) {
      html = teamBox(TEAM.RED, 'red', 'Red', by(TEAM.RED), 'redTeamName') + teamBox(TEAM.BLUE, 'blue', 'Blue', by(TEAM.BLUE), 'blueTeamName')
        + teamBox(TEAM.SPECTATING, '', 'Spectators', by(TEAM.SPECTATING)) + teamBox(TEAM.WAITING, '', 'Waiting', by(TEAM.WAITING).concat(by(TEAM.PLAYING)));
    } else {
      html = teamBox(TEAM.PLAYING, 'wide', 'Players (teams are picked when the game starts)', all);
    }
    $('#teams').innerHTML = html;
  }

  function renderRole() {
    var lead = leader();
    $$('.leader-only').forEach(function (el) { el.style.display = lead ? '' : 'none'; });
    $$('.private-only').forEach(function (el) { el.style.display = settings.isPrivate ? '' : 'none'; });
    if (lead) $$('.leader-only.private-only').forEach(function (el) { el.style.display = settings.isPrivate ? '' : 'none'; });
    $('#not-leader').style.display = lead ? 'none' : '';
    $('#toggle-private').textContent = settings.isPrivate ? 'Switch to public games' : 'Switch to private games';
    $('#toggle-private').title = settings.isPrivate ? 'Public: the server picks teams, anyone can join the game' : 'Private: you pick the teams';
    var name = $('#group-name');
    if (lead && !name.querySelector('input')) name.innerHTML = '<input type="text" maxlength="32" value="' + esc(settings.name || '') + '">';
    else if (!lead) name.textContent = settings.name || '';
    $('#settings').classList.toggle('readonly', !lead);
    renderGame();
  }

  function render() { if (!loaded) return; renderMembers(); renderRole(); }

  // name edits
  $('#group-name').addEventListener('change', function (e) { if (leader()) socket.emit('setting', { name: 'name', value: e.target.value }); });
  $('#teams').addEventListener('change', function (e) {
    var k = e.target.getAttribute('data-team-name');
    if (k && leader()) socket.emit('setting', { name: k, value: e.target.value });
  });

  // member buttons
  $('#teams').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]');
    if (!b) return;
    var id = b.closest('.member').getAttribute('data-id');
    var act = b.getAttribute('data-act');
    if (act === 'leader' && confirm('Make ' + members[id].name + ' the group leader?')) socket.emit('leader', id);
    if (act === 'kick' && confirm('Kick ' + members[id].name + ' from the group?')) socket.emit('kick', id);
    if (act === 'mute') {
      var muted = members[me].mutedGroupIds && members[me].mutedGroupIds[id];
      socket.emit(muted ? 'removePersonalMute' : 'applyPersonalMute', { playerId: id });
    }
  });

  // drag and drop between teams
  var dragging = null;
  $('#teams').addEventListener('dragstart', function (e) {
    var li = e.target.closest('.member');
    if (!li) return;
    dragging = li.getAttribute('data-id');
    e.dataTransfer.setData('text/plain', dragging);
  });
  $('#teams').addEventListener('dragover', function (e) {
    var box = e.target.closest('.team-box');
    if (!box || !dragging) return;
    e.preventDefault();
    $$('.team-box').forEach(function (b) { b.classList.toggle('drop-ok', b === box); });
  });
  $('#teams').addEventListener('dragend', function () { dragging = null; $$('.team-box').forEach(function (b) { b.classList.remove('drop-ok'); }); });
  $('#teams').addEventListener('drop', function (e) {
    var box = e.target.closest('.team-box');
    if (!box || !dragging) return;
    e.preventDefault();
    socket.emit('team', { id: dragging, team: +box.getAttribute('data-team') });
    dragging = null;
    $$('.team-box').forEach(function (b) { b.classList.remove('drop-ok'); });
  });

  // ---------------------------------------------------------------- game + leader buttons
  function renderGame() {
    var running = !!game.gameId;
    $('#game-banner').style.display = running ? '' : 'none';
    var m = members[me];
    var canJoin = m && (!settings.isPrivate || m.team !== TEAM.WAITING);
    $('#join-game').style.display = canJoin ? '' : 'none';
    $('#game-banner-text').textContent = running ? (canJoin ? 'Your group has a game running.' : 'Your group has a game running. Join a team to play next time.') : '';
    $('#launch').disabled = running;
    $('#launch').textContent = running ? 'Game running' : 'Launch Game';
  }
  $('#launch').addEventListener('click', function () { socket.emit('groupPlay'); });
  $('#end-game').addEventListener('click', function () { if (confirm('End the current game for everyone?')) socket.emit('endGame'); });
  $('#swap-teams').addEventListener('click', function () { socket.emit('swapTeams'); });
  $('#random-teams').addEventListener('click', function () { socket.emit('randomTeams'); });
  $('#toggle-private').addEventListener('click', function () { socket.emit(settings.isPrivate ? 'pub' : 'pug'); });

  // ---------------------------------------------------------------- chat
  var log = $('#chat-log');
  function addChat(html) {
    var atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 30;
    var div = document.createElement('div');
    div.innerHTML = html;
    log.appendChild(div);
    while (log.children.length > 300) log.removeChild(log.firstChild);
    if (atBottom) log.scrollTop = log.scrollHeight;
  }
  $('#chat-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = $('#chat-input');
    if (input.value.trim()) socket.emit('chat', input.value);
    input.value = '';
  });

  // ---------------------------------------------------------------- presets + map upload
  $('#preset-generate').addEventListener('click', function () { socket.emit('groupPresetGenerate'); });
  $('#preset-link').addEventListener('click', function () { socket.emit('groupPresetGenerate'); copyLink = true; });
  $('#preset-apply').addEventListener('click', function () {
    var t = $('#preset-text').value.trim();
    if (t) socket.emit('groupPresetApply', t);
  });
  var copyLink = false;
  socket.on('groupPreset', function (p) {
    $('#preset-text').value = p;
    var status = $('#preset-status');
    if (!p) { status.textContent = 'Every setting is at its default, so the preset is empty.'; copyLink = false; return; }
    if (copyLink) {
      copyLink = false;
      var link = location.origin + '/groups/create?preset=' + encodeURIComponent(p);
      if (navigator.clipboard) navigator.clipboard.writeText(link);
      status.textContent = 'Copied: ' + link;
    } else status.textContent = 'Copy the code above to share these settings.';
  });
  socket.on('groupPresetResult', function (ok) {
    $('#preset-status').textContent = ok ? 'Preset loaded.' : 'This is not a valid group preset.';
  });
  $('#map-upload').addEventListener('submit', function (e) {
    e.preventDefault();
    var status = $('#upload-status');
    status.textContent = 'Uploading...';
    fetch('/groups/testmap', { method: 'POST', body: new FormData(e.target), credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (r) { status.textContent = r.success ? 'Uploaded. Launch a game to play it.' : (r.error || 'Upload failed.'); })
      .catch(function () { status.textContent = 'Upload failed.'; });
  });

  // ---------------------------------------------------------------- peer to peer
  socket.on('p2p', function (st) {
    $('#p2p-panel').style.display = st.on ? '' : 'none';
    $('#p2p-state').innerHTML = st.connected
      ? 'Games are hosted on <b>' + esc(st.hostName) + '</b>’s PC (<span class="muted">' + esc(st.url) + '</span>).'
      : 'Nobody is hosting yet.' + (st.code ? '' : ' The group leader can host from their PC.');
    $('#p2p-consent').innerHTML = st.agreed
      ? '<b style="color:var(--accent)">&#10003; You agreed to be sent to this group’s peer-to-peer games.</b> '
        + '<button class="btn btn-default btn-tiny" type="button" data-agree="false">Stop sending me to games</button>'
      : '<b>You will not be sent to games in this group until you agree.</b><br>'
        + '<button class="btn btn-primary btn-tiny" type="button" data-agree="true" style="margin-top:6px">I trust the host: send me to games</button> '
        + '<a class="btn btn-default btn-tiny" href="/groups/leave" style="margin-top:6px">Leave group</a>';
    $('#p2p-leader').style.display = st.code ? '' : 'none';
    $('#p2p-waiting').innerHTML = st.notAgreed && st.notAgreed.length
      ? 'Haven’t agreed yet (won’t be sent to games): <b>' + st.notAgreed.map(esc).join(', ') + '</b>' : '';
    if (st.code) $('#p2p-cmd').textContent = 'git clone https://github.com/BambiTP/NonCopyrightTP\ncd NonCopyrightTP\nnpm install\nnpm run host -- ' + st.code;
  });
  $('#p2p-consent').addEventListener('click', function (e) {
    var b = e.target.closest('[data-agree]');
    if (b) socket.emit('p2pAgree', b.getAttribute('data-agree') === 'true');
  });
  $('#p2p-chicago').addEventListener('click', function () { socket.emit('setting', { name: 'server', value: 'chicago' }); });
  $('#p2p-copy').addEventListener('click', function () {
    if (navigator.clipboard) navigator.clipboard.writeText($('#p2p-cmd').textContent);
    this.textContent = 'Copied';
  });

  // ---------------------------------------------------------------- socket
  socket.on('connect', function () { socket.emit('touch', 'group page'); });
  socket.on('you', function (id) { me = id; render(); });
  socket.on('member', function (m) {
    members[m.id] = m;
    if (loaded) render();
  });
  socket.on('removed', function (d) { delete members[d.id]; render(); });
  socket.on('setting', function (d) {
    settings[d.name] = d.value;
    if (!loaded) return;
    if (d.name === 'isPrivate' || d.name === 'selfAssignment' || d.name === 'redTeamName' || d.name === 'blueTeamName') renderMembers();
    if (d.name === 'name') { document.title = d.value + ' - BambiPro Group'; if (!leader()) $('#group-name').textContent = d.value; }
    showSetting(d.name);
    renderRole();
  });
  socket.on('servers', function (list) { servers = list || []; if (loaded) showSetting('server'); });
  socket.on('game', function (g) { game = g || { gameId: null }; renderGame(); });
  socket.on('loaded', function () {
    loaded = true;
    buildSettings();
    render();
  });
  socket.on('chat', function (c) {
    if (c.from == null) return addChat('<span class="sys">' + esc(c.message) + '</span>');
    var sender = Object.keys(members).map(function (id) { return members[id]; }).filter(function (m) { return m.name === c.from; })[0];
    if (sender && members[me] && members[me].mutedGroupIds && members[me].mutedGroupIds[sender.id]) return;
    addChat('<span class="from">' + esc(c.from) + (c.auth ? ' &#10003;' : '') + ':</span> ' + esc(c.message));
  });
  socket.on('play', function () {
    var m = members[me];
    if (settings.isPrivate && m && m.team === TEAM.WAITING) return addChat('<span class="sys">A game started. You’re waiting, so you’ll play next time.</span>');
    location.href = '/games/find';
  });
  socket.on('groupKick', function () { alert('You were removed from the group.'); location.href = '/groups'; });
  socket.on('full', function () { alert('This group is full.'); location.href = '/groups'; });
  socket.on('disconnect', function () { addChat('<span class="sys">Disconnected. Reconnecting...</span>'); });
  setInterval(function () { if (socket.connected) socket.emit('touch', 'group page'); }, 30000);
  setInterval(function () { if (loaded) renderMembers(); }, 60000); // idle markers

  fetch('/maps/list.json').then(function (r) { return r.json(); }).then(function (list) {
    mapList = list;
    if (loaded) showSetting('map');
  }).catch(function () {});
})();
