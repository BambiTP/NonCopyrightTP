// The game's state, and a handler for every packet the game server sends
// (engine/game.js). Live games and replays both feed packets through Game.handle(event, data).
(function () {
  var C = TPConstants, PH = C.PHYSICS, STATES = C.STATES;

  function Game(opts) {
    this.opts = opts || {};
    this.replay = !!this.opts.replay;
    this.listeners = {};
    this.reset();
  }

  Game.prototype.reset = function () {
    this.players = {};
    this.playerId = null;
    this.tiles = null;
    this.mapInfo = {};
    this.score = { r: 0, b: 0 };
    this.teamNames = { red: 'Red', blue: 'Blue' };
    this.state = STATES.COUNTDOWN;
    this.timeLeft = 0;        // ms at timeAt (counting up in overtime)
    this.timeAt = 0;
    this.spectating = false;
    this.spectators = 0;
    this.chats = [];
    this.splats = [];         // { x, y, team, temp, at, variant }
    this.effects = [];        // explosions / flashes { x, y, type, at }
    this.spawns = [];         // upcoming spawns { x, y, team, at, until }
    this.marks = [];
    this.ended = null;        // { winner, isMercy }
    this.groupId = null;
    this.gravity = false;
    this.egg = null;
    this.eggObj = null;
    this.mapTesting = false;
    this.ghostMode = 'disabled';
    this.latency = this.latency || 0;
    this.world = null;
  };

  Game.prototype.on = function (ev, fn) { (this.listeners[ev] || (this.listeners[ev] = [])).push(fn); };
  Game.prototype.emit = function (ev, a, b) { var l = this.listeners[ev]; if (l) for (var i = 0; i < l.length; i++) l[i](a, b); };
  Game.prototype.now = function () { return this.clock ? this.clock() : performance.now(); };

  Game.prototype.me = function () { return this.playerId != null ? this.players[this.playerId] : null; };
  Game.prototype.playing = function () { return this.state === STATES.ACTIVE || this.state === STATES.OVERTIME || this.state === STATES.CLUTCH; };

  // ms left on the clock (overtime: ms played)
  Game.prototype.clockMs = function () {
    var d = this.now() - this.timeAt;
    return this.state === STATES.OVERTIME ? this.timeLeft + d : Math.max(0, this.timeLeft - d);
  };

  function blankPlayer(id) {
    return {
      id: id, name: '', team: 1, dead: true, draw: false, flag: null, keys: { up: false, down: false, left: false, right: false },
      offX: 0, offY: 0, score: 0, degree: 0, auth: null, flair: null, ms: PH.MAX_SPEED, ac: PH.ACCEL,
    };
  }

  // a "p" packet: full players (array) or { u: [...updates], t }
  Game.prototype.playerUpdates = function (d) {
    var list = Array.isArray(d) ? d : (d && d.u) || [];
    for (var i = 0; i < list.length; i++) this.updatePlayer(list[i]);
  };

  var KEYS = ['up', 'down', 'left', 'right'];
  Game.prototype.updatePlayer = function (u) {
    if (!u || u.id == null) return;
    var p = this.players[u.id], isNew = !p;
    if (isNew) { p = this.players[u.id] = blankPlayer(u.id); p.isMe = u.id === this.playerId; }
    var wasDead = p.dead, oldTeam = p.team, oldFlag = p.flag;
    for (var k in u) {
      if (k === 'id' || k === 'keys') continue;
      if (KEYS.indexOf(k) >= 0) {
        // other players' keys: the server sends a press as +seq and a release as -seq
        if (!p.isMe || this.replay) p.keys[k] = u[k] > 0;
        continue;
      }
      p[k] = u[k];
    }
    if (!this.world) return;
    if (u.team != null && u.team !== oldTeam) this.world.setTeam(p);
    var hasPos = u.rx != null || u.lx != null || u.a != null || u.ra != null;
    var alive = !p.dead && p.draw !== false;
    if (wasDead !== p.dead || u.draw != null) this.world.setAlive(p, alive);
    if (hasPos && alive && !(p.trusted && !u.directSet && !wasDead)) {
      this.world.sync(p, u, !!u.directSet || wasDead || isNew);
    }
    if (u.directSet && p.isMe) this.emit('snap', p);
    if (oldFlag !== p.flag) this.emit('flag', p, oldFlag);
    if (isNew) this.emit('playerJoined', p);
  };

  Game.prototype.setTile = function (x, y, v) {
    if (!this.tiles || !this.tiles[x]) return;
    var old = this.tiles[x][y];
    this.tiles[x][y] = v;
    this.emit('tile', x, y, old);
  };

  Game.prototype.addChat = function (c) {
    c.at = this.now();
    this.chats.push(c);
    if (this.chats.length > 200) this.chats.shift();
    this.emit('chat', c);
  };

  // every server packet
  Game.prototype.handle = function (ev, d) {
    var self = this, p;
    switch (ev) {
      case 'map':
        this.tiles = d.tiles;
        this.mapInfo = d.info || {};
        this.mapName = this.mapInfo.name || '';
        this.splats = (d.splats || []).map(function (s) { return { x: s.x, y: s.y, team: s.t, temp: false, at: 0, variant: Math.floor(Math.random() * 7) }; });
        this.world = new BPPhysics.World(this);
        this.world.gravity = this.gravity;
        this.world.ghostMode = this.ghostMode;
        this.world.build(this.tiles);
        for (var id in this.players) { p = this.players[id]; if (!p.dead) { this.world.setAlive(p, true); } }
        this.emit('map');
        break;
      case 'clientInfo':
        this.gameId = d.gameId;
        this.clientInfo = d;
        this.gravity = !!d.gravity || (d.eventScripts || []).some(function (s) { return /gravity/.test(s); });
        if (d.eventTextures && d.eventTextures.tiles) this.eventTiles = d.eventTextures.tiles;
        this.mapTesting = !!d.mapTestingMode;
        if (this.world && this.world.gravity !== this.gravity) { this.world.gravity = this.gravity; this.world.build(this.tiles); }
        this.emit('clientInfo', d);
        break;
      case 'teamNames': this.teamNames = { red: d.redTeamName || 'Red', blue: d.blueTeamName || 'Blue' }; break;
      case 'time':
      case 'clocksync':
        var was = this.state;
        this.timeLeft = d.time; this.timeAt = this.now();
        if (d.state != null) this.state = d.state;
        if (was !== this.state) this.emit('state', this.state, was);
        break;
      case 'spectators': this.spectators = d; break;
      case 'groupId': this.groupId = d; this.emit('groupId', d); break;
      case 'ghostMode': this.ghostMode = d; if (this.world) { this.world.ghostMode = d; this.world.build(this.tiles); this.rebuildBodies(); } break;
      case 'gravityWellForce': this.wellForce = d; if (this.world) this.world.wellForce = d; break;
      case 'arrivedInGame': this.spectating = !!d.spectateType; this.emit('arrived', d); break;
      case 'id':
        this.playerId = d;
        for (var pid in this.players) this.players[pid].isMe = +pid === d;
        break;
      case 'p': this.playerUpdates(d); break;
      case 'score': this.score = { r: d.r, b: d.b }; this.emit('score'); break;
      case 'playerLeft':
        if (this.world) this.world.remove(d);
        delete this.players[d];
        break;
      case 'chat': this.addChat(d); break;
      case 'spawn': this.spawns.push({ x: d.x, y: d.y, team: d.t, at: this.now(), until: this.now() + (d.w || 0) }); break;
      case 'splat':
        this.splats.push({ x: d.x, y: d.y, team: d.t, temp: !!d.temp, at: this.now(), variant: Math.floor(Math.random() * 7) });
        this.emit('splat', this.splats[this.splats.length - 1]);
        break;
      case 'bomb': this.effects.push({ x: d.x, y: d.y, type: d.type, at: this.now() }); break;
      case 'mapupdate':
        var list = Array.isArray(d) ? d : [d];
        for (var i = 0; i < list.length; i++) this.setTile(list[i].x, list[i].y, list[i].v);
        break;
      case 'sound': this.emit('sound', d); break;
      case 'mark': this.marks.push({ id: d, at: this.now() }); break;
      case 'end':
        this.ended = { winner: d.winner, isMercy: d.isMercy, at: this.now() };
        this.state = STATES.ENDED;
        this.emit('end', this.ended);
        break;
      case 'eggBall':
        this.egg = { state: d.state, holder: d.holder };
        break;
      case 'object':
        if (d.type === 'egg') { this.eggObj = { id: d.id, x: d.rx, y: d.ry, vx: d.lx || 0, vy: d.ly || 0, team: d.team, at: this.now() }; }
        break;
      case 'remove-egg': if (this.eggObj && this.eggObj.id === d) this.eggObj = null; break;
      case 'boat': this.emit('banner', 'RAPTOR BOAT! +1'); break;
      case 'disconnectReason': this.disconnectReason = d; this.emit('disconnectReason', d); break;
      case 'pr': this.emit('pong', d); break;
      case 'ltKick': case 'ltVel': this.emit(ev, d); break;
      default: break;
    }
  };

  // ghost mode changed after bodies existed: recreate them with the right filters
  Game.prototype.rebuildBodies = function () {
    for (var id in this.players) {
      var p = this.players[id];
      if (!p.dead) this.world.setAlive(p, true);
    }
  };

  // the drawn position of a ball in pixels (body + easing offset)
  Game.prototype.ballPos = function (p) {
    var b = this.world && this.world.bodies[p.id];
    if (!b || !b.IsActive()) return null;
    var pos = b.GetPosition();
    return { x: pos.x * PH.SCALE + p.offX, y: pos.y * PH.SCALE + p.offY, angle: b.GetAngle() };
  };

  // per frame: ease the drawn offsets toward the body, drop old effects
  Game.prototype.frame = function (dt) {
    var k = Math.pow(0.5, dt / 60); // halves every 60 ms
    for (var id in this.players) { var p = this.players[id]; p.offX *= k; p.offY *= k; if (Math.abs(p.offX) < 0.05) p.offX = 0; if (Math.abs(p.offY) < 0.05) p.offY = 0; }
    var now = this.now();
    this.effects = this.effects.filter(function (e) { return now - e.at < 900; });
    this.spawns = this.spawns.filter(function (s) { return now < s.until + 300; });
    this.marks = this.marks.filter(function (m) { return now - m.at < 3000; });
    this.splats = this.splats.filter(function (s) { return !s.temp || now - s.at < 6000; });
    if (this.eggObj) { // a loose egg drifts until the next update
      var e = this.eggObj, s = dt / 1000;
      e.x += e.vx * s; e.y += e.vy * s;
      var damp = Math.pow(1 - 0.75 / 60, dt / (1000 / 60));
      e.vx *= damp; e.vy *= damp;
    }
  };

  window.BPGame = Game;
})();
