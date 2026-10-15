// Starts the game page: a live game (socket /game/<id>) or a replay (?replay=<key>).
// Wires the server packets, keyboard, camera, sounds and the frame loop together.
(function () {
  var CFG = window.GAME_CONFIG || {};
  var STATES = TPConstants.STATES, PH = TPConstants.PHYSICS;
  var replayMode = CFG.mode === 'replay';
  var $ = function (id) { return document.getElementById(id); };

  var game = new BPGame({ replay: replayMode });
  var assets = new BPAssets.Assets(CFG.textures || {});
  var sounds = new BPAssets.Sounds();
  var music = new BPAssets.Music();
  var canvas = $('game');
  var renderer = new BPRenderer(canvas, game, assets);
  var socket = null, groupSocket = null, trust = null, replay = null;
  var send = function (ev, d) { if (socket && socket.connected) socket.emit(ev, d); };
  window.bp = { game: game, renderer: renderer, send: send }; // for tests and the console

  var ui = new BPUI(game, {
    replay: replayMode,
    canRate: !replayMode,
    onChat: function (mode, text) {
      if (mode === 'group') { if (groupSocket) groupSocket.emit('chat', text); return; }
      send('chat', { message: text, toAll: mode !== 'team' });
    },
  });

  renderer.resize();
  window.addEventListener('resize', function () { renderer.resize(); });

  // sounds
  var muteBtn = $('mute');
  function showMute() { muteBtn.textContent = sounds.enabled ? 'Sound on' : 'Sound off'; }
  showMute();
  muteBtn.addEventListener('click', function () { sounds.enabled = !sounds.enabled; showMute(); muteBtn.blur(); });
  game.on('sound', function (d) { if (!game.silent) sounds.play(d.s, d.v); });
  game.on('state', function (s, was) { if (s === STATES.ACTIVE && was === STATES.COUNTDOWN) music.start(); });
  game.on('end', function () { setTimeout(function () { music.stop(); }, 4000); });
  game.on('clientInfo', function (d) {
    // eggball brings its own tile sheet
    if (d.eventTextures && d.eventTextures.tiles) assets.useTiles(d.eventTextures.tiles).then(function () { renderer.chunks = {}; });
  });

  // camera
  var spec = { follow: null, free: false, autoZoom: false };
  function alivePlayers() { return Object.keys(game.players).map(function (id) { return game.players[id]; }).filter(function (p) { return !p.dead && p.draw !== false; }); }
  function focusPoint() {
    var me = game.me();
    var target = null;
    if (me && !game.spectating && !replayMode) target = me;
    else if (spec.follow != null && game.players[spec.follow]) target = game.players[spec.follow];
    else if (replayMode && replay && replay.follow != null && game.players[replay.follow]) target = game.players[replay.follow];
    if (target && !spec.free) {
      var pos = game.ballPos(target);
      if (pos) { target.lastX = pos.x; target.lastY = pos.y; return pos; }
      var sp = game.spawns.filter(function (s) { return s.team === target.team; }).pop(); // dead: look at where we'll come back
      if (sp) return { x: sp.x, y: sp.y };
      if (target.lastX != null) return { x: target.lastX, y: target.lastY };
    }
    if (game.tiles) return { x: game.tiles.length * 20, y: game.tiles[0].length * 20 };
    return null;
  }
  function cycle(dir) {
    var list = Object.keys(game.players).map(Number).sort(function (a, b) { return a - b; });
    if (!list.length) return;
    var cur = spec.follow != null ? spec.follow : replay ? replay.follow : null;
    var i = list.indexOf(cur);
    spec.follow = list[(i + dir + list.length) % list.length];
    if (replay) replay.follow = spec.follow;
    spec.free = false;
  }
  function followCarrier(team) { // A: whoever holds the red flag, S: the blue flag
    var p = alivePlayers().filter(function (x) { return x.flag === team || (x.flag === 3 && x.team !== team); })[0];
    if (p) { spec.follow = p.id; if (replay) replay.follow = p.id; spec.free = false; }
  }
  function autoZoom() {
    if (!spec.autoZoom || !game.tiles) return;
    renderer.zoom = Math.min(1, Math.min(renderer.w / (game.tiles.length * 40), renderer.h / (game.tiles[0].length * 40)));
  }

  // keyboard
  var seq = 0;
  var held = {};
  function moveKey(e) {
    var k = e.key.toLowerCase(), K = BP.prefs.keys;
    if (e.key === 'ArrowUp' || k === K.up) return 'up';
    if (e.key === 'ArrowDown' || k === K.down) return 'down';
    if (e.key === 'ArrowLeft' || k === K.left) return 'left';
    if (e.key === 'ArrowRight' || k === K.right) return 'right';
    return null;
  }
  var lastShift = 0;
  document.addEventListener('keydown', function (e) {
    if (ui.chatMode) { if (e.key === 'Escape') ui.closeChat(); return; }
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    var dir = moveKey(e), me = game.me();
    if (dir && !replayMode && !game.spectating) {
      e.preventDefault();
      if (held[dir]) return;
      held[dir] = true;
      if (me) me.keys[dir] = true;
      send('keydown', { k: dir, t: ++seq });
      if (dir === 'up' && trust) trust.jump();
      return;
    }
    switch (e.key) {
      case 'Enter': e.preventDefault(); ui.openChat('all'); break;
      case 't': case 'T': e.preventDefault(); ui.openChat('team'); break;
      case 'g': case 'G': if (groupSocket) { e.preventDefault(); ui.openChat('group'); } break;
      case ' ': e.preventDefault(); send('keydown', { k: 'space', t: ++seq }); break;
      case 'Tab': e.preventDefault(); ui.showBoard(true); break;
      case 'r': case 'R': if (game.mapTesting) send('resetMap'); break;
      case 'm': case 'M': sounds.enabled = !sounds.enabled; showMute(); break;
      case '+': case '=': renderer.zoom = Math.min(2, renderer.zoom + 0.1); spec.autoZoom = false; break;
      case '-': case '_': renderer.zoom = Math.max(0.3, renderer.zoom - 0.1); spec.autoZoom = false; break;
      case 'z': case 'Z': spec.autoZoom = !spec.autoZoom; if (!spec.autoZoom) renderer.zoom = 1; break;
      case 'q': case 'Q': if (game.spectating || replayMode) cycle(-1); break;
      case 'w': case 'W': if (game.spectating || replayMode) cycle(1); break;
      case 'a': case 'A': if (game.spectating || replayMode) followCarrier(1); break;
      case 's': case 'S': if (game.spectating || replayMode) followCarrier(2); break;
      case 'c': case 'C': if (game.spectating || replayMode) { spec.free = true; spec.follow = null; } break;
      case 'Shift':
        // Eggball Ranked: double-tap Shift to vote to keep playing after a teammate leaves
        if (CFG.ranked && !e.repeat) { var n = Date.now(); if (n - lastShift < 400) { lastShift = 0; send('rankedContinue'); } else lastShift = n; }
        break;
      default: break;
    }
  });
  document.addEventListener('keyup', function (e) {
    if (e.key === 'Tab') { ui.showBoard(false); return; }
    var dir = moveKey(e);
    if (!dir || replayMode || !held[dir]) return;
    held[dir] = false;
    var me = game.me();
    if (me) me.keys[dir] = false;
    send('keyup', { k: dir, t: ++seq });
  });
  window.addEventListener('blur', function () { // let go of every key when the window loses focus
    Object.keys(held).forEach(function (dir) {
      if (!held[dir]) return;
      held[dir] = false;
      var me = game.me();
      if (me) me.keys[dir] = false;
      send('keyup', { k: dir, t: ++seq });
    });
  });
  // eggball: click to throw the egg
  canvas.addEventListener('mousedown', function (e) {
    if (replayMode || !game.egg) return;
    var m = renderer.toMap(e.clientX, e.clientY);
    send('click', { x: m.x, y: m.y });
  });
  // map rating on the end screen
  $('board').addEventListener('click', function (e) {
    var b = e.target.closest('[data-rate]');
    if (!b) return;
    ui.rated = +b.getAttribute('data-rate');
    send('mapRating', ui.rated);
    ui.renderBoard(true);
  });

  // help line
  $('help').textContent = replayMode ? 'Space: pause · Q/W: switch player · A/S: flag carriers · Z: fit map · +/-: zoom'
    : 'Arrows/WASD move · Enter chat · T team chat' + ' · Tab scores · +/- zoom';
  game.on('arrived', function (d) {
    if (d.spectateType) $('help').textContent = 'Spectating · Q/W: switch player · A/S: flag carriers · C: free · Z: fit map · +/-: zoom';
  });
  game.on('groupId', function (gid) {
    if (replayMode || groupSocket || !gid) return;
    // the group page's socket: group chat (G) and following the group into its next game
    groupSocket = io('/groups/' + gid, { transports: ['websocket', 'polling'] });
    groupSocket.on('connect', function () { groupSocket.emit('touch', 'in a game'); });
    groupSocket.on('chat', function (c) { game.addChat({ from: c.from, message: c.message, to: c.from == null ? 'all' : 'group' }); });
    groupSocket.on('play', function () { if (game.state === STATES.ENDED || game.disconnectReason) location.href = '/games/find'; });
    $('help').textContent += ' · G group chat';
  });

  // live game
  function startLive() {
    socket = io(CFG.socket, { transports: ['websocket', 'polling'], reconnection: false });
    window.bp.socket = socket;
    socket.onAny(function (ev, d) { game.handle(ev, d); });
    socket.on('disconnect', function () { if (game.state !== STATES.ENDED && !game.disconnectReason) ui.banner('Disconnected', 600000); });
    if (CFG.localTrust) {
      trust = new BPTrust(game, CFG.localTrust, send);
      game.on('snap', function () { trust.snapped(); });
    }
    // ping: the server answers "p" with "pr"
    var pings = {}, pid = 0;
    setInterval(function () { if (socket.connected) { pings[++pid] = performance.now(); send('p', { id: pid }); } }, 2000);
    game.on('pong', function (id) {
      if (!pings[id]) return;
      var rtt = performance.now() - pings[id];
      delete pings[id];
      game.ping = game.ping ? game.ping * 0.7 + rtt * 0.3 : rtt;
      game.latency = trust ? 0 : game.ping / 2;
    });
    $('exit').addEventListener('click', function () { if (socket) socket.disconnect(); });
  }

  // replay
  function startReplay() {
    replay = new BPReplay(game, CFG.replay);
    window.bp.replay = replay;
    $('exit').href = '/replays';
    $('exit').innerHTML = '&larr; Replays';
    return replay.load().then(function () {
      var bar = document.createElement('div');
      bar.id = 'replay-bar'; bar.className = 'hud';
      bar.innerHTML = '<button class="gbtn" id="rp-play" type="button">Pause</button><input type="range" id="rp-seek" min="0" max="' + replay.duration + '" value="0" step="100">'
        + '<span class="t" id="rp-time"></span><select id="rp-speed"><option value="0.5">0.5x</option><option value="1" selected>1x</option><option value="2">2x</option><option value="4">4x</option><option value="8">8x</option></select>';
      document.body.appendChild(bar);
      var seekBar = $('rp-seek'), playBtn = $('rp-play');
      var toggle = function () {
        if (replay.t >= replay.duration) replay.seek(0);
        replay.paused = !replay.paused;
        playBtn.textContent = replay.paused ? 'Play' : 'Pause';
      };
      playBtn.addEventListener('click', function () { toggle(); playBtn.blur(); });
      seekBar.addEventListener('input', function () { replay.seek(+seekBar.value); });
      $('rp-speed').addEventListener('change', function () { replay.speed = +this.value; this.blur(); });
      document.addEventListener('keydown', function (e) { if (e.key === ' ') toggle(); });
      game.on('seeked', function () { renderer.chunks = {}; });
      replay.ui = function () {
        if (document.activeElement !== seekBar) seekBar.value = replay.t;
        $('rp-time').textContent = BP.duration(replay.t) + ' / ' + BP.duration(replay.duration);
        playBtn.textContent = replay.paused ? 'Play' : 'Pause';
      };
      if (replay.meta) document.title = replay.meta.mapName + ' replay - BambiPro';
    }).catch(function (err) { $('loading').textContent = String(err.message || err); throw err; });
  }

  // frame loop
  var last = performance.now(), fpsN = 0, fpsAt = last, fps = 0;
  function frame(now) {
    var dt = Math.min(100, now - last);
    last = now;
    if (replay) dt = replay.advance(dt);
    if (game.world) {
      game.world.advance(dt, game.playing(), trust ? function () { trust.tick(); } : null);
    }
    game.frame(dt);
    autoZoom();
    renderer.draw(focusPoint(), game.now());
    ui.update();
    if (replay && replay.ui) replay.ui();
    fpsN++;
    if (now - fpsAt > 1000) { fps = fpsN; fpsN = 0; fpsAt = now; }
    if (BP.prefs.fps) $('netstats').textContent = fps + ' fps' + (game.ping ? ' · ' + Math.round(game.ping) + ' ms' : '');
    requestAnimationFrame(frame);
  }

  assets.load().then(function () {
    $('loading').style.display = 'none';
    return replayMode ? startReplay() : startLive();
  }).then(function () { requestAnimationFrame(frame); });
})();
