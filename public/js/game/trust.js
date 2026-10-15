// trust.js - the "Local trust" group setting, client half. The server sends GameRoom.trustConfig()
// in the page config when it's on. Your ball is simulated only here, like an offline game:
//  - movement keys apply immediately, and the server never sends your own position back except
//    for a hard snap (spawn, death, rejected report), which carries directSet
//  - team tile / juke juice speed, boosts, your own bomb hits and portals are predicted here with
//    the server's formulas (engine/game.js tileInteractions); the server uses up the tile
//  - the position is reported ~30 times a second ('lt'), at once after using a tile
//  - explosions caused by others arrive as 'ltKick', a juke juice boost as 'ltVel'
//  - gravity: jumps happen here on the up press; landing on something restores them
(function () {
  var V = Box2D.Common.Math.b2Vec2;
  var PICKUP = { 5: 'boost', 14: 'boost', 15: 'boost', 6: 'powerup', 10: 'bomb' };

  function Trust(game, cfg, send) {
    this.game = game; this.cfg = cfg; this.send = send;
    this.used = {};       // "x,y" -> time: tiles used here, until the server's tile update arrives
    this.arrived = null;  // the portal we came out of; re-arms once we roll off it
    this.onPickups = {};  // boost/powerup/bomb tiles under the ball last tick: they fire on the way in only
    this.hit = false;
    this.frame = 0;
    this.G = cfg.gravity;
    this.jumps = this.G ? this.G.jumps : 0; // null = unlimited
    var self = this;
    game.on('ltKick', function (d) { self.kick(d.vx, d.vy); });
    game.on('ltVel', function (d) { var b = self.body(); if (b) { b.SetAwake(true); b.SetLinearVelocity(new V(d.vx, d.vy)); } });
    this.listen();
  }

  Trust.prototype.me = function () { return this.game.me(); };
  Trust.prototype.body = function () {
    var p = this.me(), w = this.game.world;
    return p && w && w.bodies[p.id];
  };

  // a hard snap from the server: forget local state
  Trust.prototype.snapped = function () {
    this.used = {}; this.arrived = null; this.onPickups = {};
    if (this.G) this.jumps = this.G.jumps;
  };

  // gravity: starting to touch something below (a wall, or a player with that setting on) restores jumps
  Trust.prototype.listen = function () {
    var self = this;
    var hook = function () {
      if (!self.G || !self.game.world || self.game.world.trustHooked) return;
      self.game.world.trustHooked = true;
      var wm = new Box2D.Collision.b2WorldManifold();
      self.game.world.listeners.push(function (c) {
        var body = self.body();
        var a = c.GetFixtureA().GetBody(), b = c.GetFixtureB().GetBody();
        if (!body || (a !== body && b !== body)) return;
        var other = a === body ? b : a;
        if (other.player && !self.G.playerReset) return;
        c.GetWorldManifold(wm);
        var ny = a === body ? wm.m_normal.y : -wm.m_normal.y; // from us to the other body
        if (ny > 0.5) self.jumps = self.G.jumps;
      });
    };
    this.game.on('map', hook);
    this.game.on('clientInfo', function () { setTimeout(hook, 0); });
  };

  Trust.prototype.jump = function () {
    var p = this.me(), b = this.body();
    if (!this.G || !p || !b || p.dead || !this.game.playing()) return;
    if (this.jumps != null && this.jumps <= 0) return;
    if (this.jumps != null) this.jumps--;
    var v = b.GetLinearVelocity();
    b.SetAwake(true);
    b.SetLinearVelocity(new V(v.x, v.y - this.G.jump));
  };

  Trust.prototype.kick = function (vx, vy) {
    var b = this.body();
    if (!b) return;
    var v = b.GetLinearVelocity();
    b.SetLinearVelocity(new V(v.x + vx, v.y + vy));
  };

  // engine/game.js boost(): keep the direction, the larger axis becomes 3x the current top speed
  Trust.prototype.boost = function (p, b) {
    var v = b.GetLinearVelocity(), dx = v.x, dy = v.y, k = p.keys;
    if (Math.hypot(dx, dy) < 1e-3) { dx = (k.right ? 1 : 0) - (k.left ? 1 : 0); dy = (k.down ? 1 : 0) - (k.up ? 1 : 0); }
    var m = Math.max(Math.abs(dx), Math.abs(dy));
    if (m < 1e-6) return;
    var f = this.cfg.boostPerMs * p.ms / m;
    b.SetAwake(true);
    b.SetLinearVelocity(new V(dx * f, dy * f));
  };

  // engine/game.js tileInteractions(), for team tiles, boosts, bombs and portals
  Trust.prototype.predict = function (p, b) {
    var cfg = this.cfg, TILE = cfg.tile, R = cfg.R, tiles = this.game.tiles;
    var pos = b.GetPosition(), h = TILE / 2, now = performance.now();
    var x0 = Math.floor((pos.x - R + h) / TILE), x1 = Math.floor((pos.x + R + h) / TILE);
    var y0 = Math.floor((pos.y - R + h) / TILE), y1 = Math.floor((pos.y + R + h) / TILE);
    var onTeamTile = false, onArrival = false, wasOn = this.onPickups;
    this.onPickups = {};
    for (var x = x0; x <= x1; x++) for (var y = y0; y <= y1; y++) {
      var col = tiles[x], t = col && col[y];
      if (t == null) continue;
      var cx = x * TILE, cy = y * TILE, key = x + ',' + y;
      var center = Math.hypot(pos.x - cx, pos.y - cy);
      var edge = Math.hypot(pos.x - Math.max(cx - h, Math.min(pos.x, cx + h)), pos.y - Math.max(cy - h, Math.min(pos.y, cy + h)));
      var base = Math.floor(parseFloat(t));
      if (edge < R - 0.01 && !p.flag && ((base === 11 && p.team === 1) || (base === 12 && p.team === 2) || base === 23)) onTeamTile = true;
      if (key === this.arrived && center < R + cfg.touch.portal) onArrival = true;
      var kind = PICKUP[base];
      if (kind && center < R + cfg.touch[kind]) { this.onPickups[key] = 1; if (wasOn[key]) continue; }
      if (typeof t !== 'number' || (this.used[key] && now - this.used[key] < 1500)) continue;
      if ((t === 5 || (t === 14 && p.team === 1) || (t === 15 && p.team === 2)) && center < R + cfg.touch.boost) {
        this.used[key] = now; this.hit = true; this.boost(p, b);
      } else if (t === 10 && center < R + cfg.touch.bomb) {
        this.used[key] = now; this.hit = true;
        var dx = pos.x - cx, dy = pos.y - cy, d = Math.hypot(dx, dy);
        if (d > 1e-6 && d < cfg.bombR) this.kick(dx / d * cfg.bombS * (cfg.bombR - d), dy / d * cfg.bombS * (cfg.bombR - d));
      } else if ((t === 13 || (t === 24 && p.team === 1) || (t === 25 && p.team === 2)) && cfg.portals[key] && key !== this.arrived && center < R + cfg.touch.portal) {
        var dest = cfg.portals[key];
        this.used[key] = now; this.hit = true; this.arrived = dest[0] + ',' + dest[1];
        b.SetPosition(new V(dest[0] * TILE, dest[1] * TILE));
        p.offX = 0; p.offY = 0;
        return;
      }
    }
    if (this.arrived && !onArrival) this.arrived = null;
    p.ac = cfg.ac + (p.jukeJuice ? cfg.jjAc : 0) + (onTeamTile ? cfg.teamAc : 0);
    p.ms = p.speed ? cfg.topMs : onTeamTile ? cfg.teamMs : cfg.ms;
  };

  // after every physics tick
  Trust.prototype.tick = function () {
    var p = this.me(), b = this.body();
    if (!p || !b || p.dead || p.draw === false || !b.IsActive()) return;
    p.trusted = true;
    this.predict(p, b);
    if (++this.frame % 2 && !this.hit) return;
    this.hit = false;
    var pos = b.GetPosition(), v = b.GetLinearVelocity();
    this.send('lt', { x: pos.x, y: pos.y, vx: v.x, vy: v.y, a: b.GetAngularVelocity(), ra: b.GetAngle(), e: p.lte || 0 });
  };

  window.BPTrust = Trust;
})();
