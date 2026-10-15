// ui.js - the HTML overlay: score, clock, banners, chat, scoreboard, end-of-game panel.
(function () {
  var STATES = TPConstants.STATES;
  var $ = function (id) { return document.getElementById(id); };
  var esc = BP.esc;

  function UI(game, opts) {
    this.game = game;
    this.opts = opts || {};
    this.boardHeld = false;
    this.chatMode = null;
    this.bannerUntil = 0;
    this.lastLines = 0;
    this.rated = null;
    var self = this;
    game.on('chat', function (c) { self.chatLine(c); });
    game.on('end', function () { self.showBoard(true); });
    game.on('banner', function (t) { self.banner(t, 2500); });
    game.on('state', function (s) {
      if (s === STATES.ACTIVE) self.banner('GO!', 900);
      if (s === STATES.OVERTIME) self.banner('OVERTIME', 2000, 'Next capture wins');
      if (s === STATES.CLUTCH) self.banner('CLUTCH TIME', 2000, 'Held flags can still score');
    });
    game.on('disconnectReason', function (r) {
      var why = { afk: 'You were kicked for being away.', ended: 'This game is over.' }[r] || 'Disconnected.';
      self.banner(why, 60000);
    });
    $('chat-input-wrap').addEventListener('submit', function (e) { e.preventDefault(); self.sendChat(); });
  }

  UI.prototype.banner = function (text, ms, small) {
    $('banner').innerHTML = esc(text) + (small ? '<small>' + esc(small) + '</small>' : '');
    this.bannerUntil = this.game.now() + ms;
  };

  function mmss(ms) { var s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

  // every frame
  UI.prototype.update = function () {
    var g = this.game, now = g.now();
    $('score-red').textContent = g.score.r;
    $('score-blue').textContent = g.score.b;
    $('name-red').textContent = g.teamNames.red;
    $('name-blue').textContent = g.teamNames.blue;
    var clock = $('clock'), ms = g.clockMs();
    clock.className = g.state === STATES.OVERTIME ? 'ot' : '';
    clock.textContent = g.state === STATES.OVERTIME ? '+' + mmss(ms) : g.state === STATES.ENDED ? 'Final' : mmss(ms);
    $('mapname').textContent = g.mapInfo.name ? g.mapInfo.name + (g.mapInfo.author ? ' by ' + g.mapInfo.author : '') : '';
    $('specs').textContent = g.spectators ? g.spectators + ' watching' : '';

    // countdown before the game starts
    if (g.state === STATES.COUNTDOWN && now > this.bannerUntil) {
      $('banner').innerHTML = 'Starting in ' + Math.ceil(ms / 1000) + (g.spectating ? '<small>Spectating</small>' : '');
    } else if (now > this.bannerUntil && g.state !== STATES.ENDED) $('banner').innerHTML = '';
    if (g.state === STATES.ENDED && g.ended && now > this.bannerUntil) {
      var w = g.ended.winner;
      var txt = w === 'tie' ? 'Tie Game' : (w === 'red' ? g.teamNames.red : g.teamNames.blue) + ' Wins!';
      $('banner').innerHTML = '<span style="color:' + (w === 'red' ? '#ff5b52' : w === 'blue' ? '#4f8fff' : '#ddd') + '">' + esc(txt) + '</span>' + (g.ended.isMercy ? '<small>Mercy rule</small>' : '');
    }

    // respawn countdown for our own ball
    var me = g.me(), rs = '';
    if (me && me.dead && g.state !== STATES.ENDED) {
      var sp = g.spawns.filter(function (s) { return s.team === me.team && s.until > now; }).sort(function (a, b) { return b.at - a.at; })[0];
      if (sp) rs = 'Respawning in ' + Math.ceil((sp.until - now) / 1000);
    }
    $('respawn').textContent = rs;

    // chat fades out a while after each line
    var lines = $('chat-lines').children, open = !!this.chatMode;
    for (var i = 0; i < lines.length; i++) lines[i].classList.toggle('old', !open && now - lines[i].at > 12000);
    if (this.boardHeld || g.state === STATES.ENDED) this.renderBoard();
  };

  // ---- chat ----
  UI.prototype.chatLine = function (c) {
    if (!BP.prefs.chat && c.from != null) return;
    var g = this.game, html, cls = 'sys';
    if (c.from == null) html = esc(c.message);
    else {
      var p = typeof c.from === 'number' ? g.players[c.from] : null;
      var name = p ? p.name : String(c.from);
      cls = c.to === 'group' ? 'grp' : p ? (p.team === 1 ? 'team-r' : 'team-b') : 'sys';
      var tag = c.to === 'team' ? '[team] ' : c.to === 'group' ? '[group] ' : '';
      html = '<span class="who ' + cls + '">' + esc(tag + name) + ':</span> <span>' + esc(c.message) + '</span>';
      cls = '';
    }
    var div = document.createElement('div');
    div.className = 'line ' + cls;
    if (c.c) div.style.color = c.c;
    div.innerHTML = html;
    div.at = this.game.now();
    var box = $('chat-lines');
    box.appendChild(div);
    var max = Math.max(1, BP.prefs.chatLines || 8);
    while (box.children.length > (this.chatMode ? 30 : max)) box.removeChild(box.firstChild);
  };

  UI.prototype.openChat = function (mode) {
    if (this.opts.replay) return;
    this.chatMode = mode;
    $('chat-to').textContent = mode === 'team' ? 'TEAM' : mode === 'group' ? 'GROUP' : 'ALL';
    $('chat-input-wrap').classList.add('open');
    var input = $('chat-input');
    input.value = '';
    input.focus(); // now, so fast typing right after Enter isn't lost (the opening key's keydown was cancelled)
  };
  UI.prototype.closeChat = function () {
    this.chatMode = null;
    $('chat-input-wrap').classList.remove('open');
    $('chat-input').blur();
  };
  UI.prototype.sendChat = function () {
    var text = $('chat-input').value.trim(), mode = this.chatMode;
    this.closeChat();
    if (text && this.opts.onChat) this.opts.onChat(mode, text);
  };

  // ---- scoreboard ----
  var COLS = [['score', 'Score'], ['s-tags', 'Tags'], ['s-pops', 'Pops'], ['s-grabs', 'Grabs'], ['s-drops', 'Drops'], ['s-hold', 'Hold'],
    ['s-captures', 'Caps'], ['s-prevent', 'Prevent'], ['s-returns', 'Returns'], ['s-support', 'Support'], ['s-powerups', 'Pups']];
  UI.prototype.showBoard = function (on) { this.boardHeld = on; $('board').classList.toggle('show', on || this.game.state === STATES.ENDED); if (on) this.renderBoard(true); };
  UI.prototype.renderBoard = function (force) {
    var g = this.game, now = g.now();
    if (!force && now - (this.boardAt || 0) < 500) return;
    this.boardAt = now;
    var cols = BP.prefs.scoreboardStats ? COLS : COLS.slice(0, 1).concat([['s-captures', 'Caps'], ['s-tags', 'Tags'], ['s-returns', 'Returns']]);
    var ps = Object.keys(g.players).map(function (id) { return g.players[id]; })
      .sort(function (a, b) { return (a.team - b.team) || (b.score - a.score); });
    var secs = function (v) { v = v || 0; return Math.floor(v / 60) + ':' + ('0' + (v % 60)).slice(-2); };
    var rows = ps.map(function (p) {
      return '<tr class="' + (p.team === 1 ? 'r' : 'b') + (p.isMe ? ' me' : '') + '"><td>' + esc(p.name) + (p.auth ? ' &#10003;' : '') + '</td>'
        + cols.map(function (c) { var v = p[c[0]] || 0; return '<td>' + (c[0] === 's-hold' || c[0] === 's-prevent' ? secs(v) : v) + '</td>'; }).join('') + '</tr>';
    }).join('');
    var ended = g.state === STATES.ENDED;
    var html = '<h2><span style="color:#ff5b52">' + esc(g.teamNames.red) + ' ' + g.score.r + '</span> &ndash; <span style="color:#4f8fff">' + g.score.b + ' ' + esc(g.teamNames.blue) + '</span></h2>'
      + '<table><thead><tr><th>Player</th>' + cols.map(function (c) { return '<th>' + c[1] + '</th>'; }).join('') + '</tr></thead><tbody>' + rows + '</tbody></table>';
    if (ended && !this.opts.replay) {
      var rated = this.rated;
      html += '<div class="actions">'
        + (g.groupId ? '<a class="gbtn primary" href="/groups/' + esc(g.groupId) + '">Back to your group</a>' : '<a class="gbtn primary" href="/games/find">Play again</a>')
        + '<a class="gbtn" href="/">Home</a>'
        + (this.opts.canRate ? '<span class="rate">Rate this map: ' + [[1, 'Like'], [0, 'Meh'], [-1, 'Dislike']].map(function (r) {
          return '<button class="gbtn' + (rated === r[0] ? ' on' : '') + '" data-rate="' + r[0] + '">' + r[1] + '</button>';
        }).join(' ') + '</span>' : '')
        + '</div>';
    }
    var board = $('board');
    if (board.innerHTML !== html) board.innerHTML = html;
    board.classList.toggle('show', this.boardHeld || ended);
  };

  window.BPUI = UI;
})();
