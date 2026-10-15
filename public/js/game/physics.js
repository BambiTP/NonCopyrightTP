// Client-side prediction. Builds the same Box2D world as the server (engine/game.js
// buildWorld/createBody, same Box2D build and constants) and steps it at 60 Hz. Every ball moves
// with its owner's last known keys; server position updates replace the simulated state, and the
// jump is hidden by easing the drawn position (Ball.off*) back to the body.
(function () {
  var C = TPConstants, PH = C.PHYSICS, TU = C.TUNING;
  var V = Box2D.Common.Math.b2Vec2;
  var B = Box2D.Dynamics, S = Box2D.Collision.Shapes;

  function World(game) {
    this.game = game;
    this.gravity = false;
    this.ghostMode = 'disabled';
    this.wellForce = 1;
    this.bodies = {}; // player id -> body
    this.acc = 0;
    this.tick = 0;
    this.listeners = [];
  }

  World.prototype.build = function (tiles) {
    var g = this.gravity;
    this.world = new B.b2World(g ? new V(0, TU.GRAVITY_Y) : new V(0, 0), true);
    this.bodies = {};
    var fd = new B.b2FixtureDef(), bd = new B.b2BodyDef();
    fd.density = 1; fd.friction = g ? 0 : PH.WALL_FRICTION; fd.restitution = g ? TU.GRAVITY_RESTITUTION : PH.WALL_RESTITUTION;
    fd.filter.categoryBits = -1;
    bd.type = B.b2Body.b2_staticBody;
    var W = tiles.length, H = tiles[0].length, x, y, t;
    this.wells = [];
    for (x = 0; x < W; x++) for (y = 0; y < H; y++) {
      t = +tiles[x][y];
      if (Math.floor(t) === 22) this.wells.push({ x: x * PH.TILE, y: y * PH.TILE });
      if (Math.floor(t) !== 1) continue;
      fd.shape = new S.b2PolygonShape();
      if (t === 1.1) fd.shape.SetAsArray([new V(-0.2, 0.2), new V(-0.2, -0.2), new V(0.2, 0.2)]);
      else if (t === 1.2) fd.shape.SetAsArray([new V(-0.2, -0.2), new V(0.2, -0.2), new V(-0.2, 0.2)]);
      else if (t === 1.3) fd.shape.SetAsArray([new V(0.2, -0.2), new V(0.2, 0.2), new V(-0.2, -0.2)]);
      else if (t === 1.4) fd.shape.SetAsArray([new V(0.2, 0.2), new V(-0.2, 0.2), new V(0.2, -0.2)]);
      else fd.shape.SetAsBox(0.2, 0.2);
      bd.position.Set(PH.TILE * x, PH.TILE * y);
      this.world.CreateBody(bd).CreateFixture(fd);
    }
    var sfd = new B.b2FixtureDef();
    sfd.density = 1; sfd.friction = fd.friction; sfd.restitution = fd.restitution;
    sfd.filter.categoryBits = -1;
    sfd.shape = new S.b2CircleShape(TU.TOUCH_RADIUS.spike);
    for (x = 0; x < W; x++) for (y = 0; y < H; y++) {
      if (+tiles[x][y] !== 7) continue;
      bd.position.Set(PH.TILE * x, PH.TILE * y);
      this.world.CreateBody(bd).CreateFixture(sfd);
    }
    var self = this;
    var listener = new B.b2ContactListener();
    listener.BeginContact = function (c) { for (var i = 0; i < self.listeners.length; i++) self.listeners[i](c); };
    this.world.SetContactListener(listener);
  };

  World.prototype.body = function (p) {
    var b = this.bodies[p.id];
    if (b) return b;
    var fd = new B.b2FixtureDef(), bd = new B.b2BodyDef();
    fd.density = PH.BALL_DENSITY; fd.friction = this.gravity ? 0 : PH.BALL_FRICTION;
    fd.restitution = (this.gravity ? TU.GRAVITY_RESTITUTION : PH.BALL_RESTITUTION) * (this.game.bounce || 1);
    fd.shape = new S.b2CircleShape(PH.BALL_RADIUS);
    var f = C.getPlayerCollisions(this.ghostMode, p.team === 1);
    fd.filter.categoryBits = f.categoryBits; fd.filter.maskBits = f.maskBits;
    bd.type = B.b2Body.b2_dynamicBody;
    bd.linearDamping = PH.LINEAR_DAMPING; bd.angularDamping = PH.ANGULAR_DAMPING;
    b = this.world.CreateBody(bd);
    b.CreateFixture(fd);
    b.player = p;
    b.team = p.team;
    b.SetActive(false);
    this.bodies[p.id] = b;
    return b;
  };

  World.prototype.remove = function (id) {
    var b = this.bodies[id];
    if (b) { this.world.DestroyBody(b); delete this.bodies[id]; }
  };

  // team switch: the collision filter depends on the team
  World.prototype.setTeam = function (p) {
    var b = this.bodies[p.id];
    if (!b || b.team === p.team) return;
    b.team = p.team;
    var f = C.getPlayerCollisions(this.ghostMode, p.team === 1);
    var fix = b.GetFixtureList(), fd = fix.GetFilterData();
    fd.categoryBits = f.categoryBits; fd.maskBits = f.maskBits;
    fix.SetFilterData(fd);
  };

  // server state for a ball (metres, m/s). The server only sends fields that changed, so `s` (this
  // update) says what's new and `p` (every field merged so far) gives the full state.
  // snap: no easing (spawns, teleports, directSet)
  World.prototype.sync = function (p, s, snap) {
    var b = this.body(p);
    var was = b.IsActive() ? b.GetPosition() : null;
    var wx = was ? was.x : 0, wy = was ? was.y : 0;
    var num = function (v, d) { return typeof v === 'number' && isFinite(v) ? v : d; };
    var moved = s.rx != null || s.ry != null;
    var pos = b.GetPosition(), vel = b.GetLinearVelocity();
    var rx = num(p.rx, pos.x), ry = num(p.ry, pos.y);
    if (moved) b.SetPosition(new V(rx, ry));
    if (s.lx != null || s.ly != null) b.SetLinearVelocity(new V(num(p.lx, vel.x), num(p.ly, vel.y)));
    if (s.a != null) b.SetAngularVelocity(num(p.a, 0));
    if (s.ra != null) b.SetAngle(num(p.ra, 0));
    b.SetAwake(true);
    // our own ball: the server's state is from half a ping ago; move it forward by that much
    if (p.isMe && !snap && moved && this.game.latency > 0) {
      var lv = b.GetLinearVelocity(), lead = Math.min(0.15, this.game.latency / 1000);
      b.SetPosition(new V(rx + lv.x * lead, ry + lv.y * lead));
    }
    if (was && !snap && moved) {
      var now = b.GetPosition();
      p.offX += (wx - now.x) * PH.SCALE;
      p.offY += (wy - now.y) * PH.SCALE;
      var d = Math.hypot(p.offX, p.offY);
      if (d > 120) { p.offX = 0; p.offY = 0; } // too far: just jump
    } else if (snap) { p.offX = 0; p.offY = 0; }
  };

  World.prototype.setAlive = function (p, alive) {
    var b = this.body(p);
    if (alive) { b.SetActive(true); b.SetAwake(true); } else { b.SetActive(false); b.SetLinearVelocity(new V(0, 0)); }
  };

  // one 1/60 s tick: gravity wells, the world step, then key acceleration (server order)
  World.prototype.step = function (playing) {
    this.tick++;
    var players = this.game.players, id, p, b;
    if (playing) {
      for (var i = 0; i < this.wells.length; i++) {
        var w = this.wells[i];
        for (id in this.bodies) {
          b = this.bodies[id]; p = players[id];
          if (!p || p.dead || !b.IsActive()) continue;
          var c = b.GetWorldCenter(), o = new V(c.x - w.x, c.y - w.y), len = o.Length();
          if (len > PH.GRAVITY_WELL_RANGE || len < 1e-6) continue;
          var f = PH.GRAVITY_WELL_FORCE * this.wellForce * b.GetMass() / (len * len);
          o.NegativeSelf(); o.Multiply(f);
          b.ApplyImpulse(o, c);
        }
      }
    }
    for (id in this.bodies) {
      b = this.bodies[id];
      if (!b.IsActive()) continue;
      b.SetAwake(true);
      // a non-number position or speed would hang Box2D's solver: put the ball back where the server last had it
      var q = b.GetPosition(), qv = b.GetLinearVelocity();
      if (!isFinite(q.x) || !isFinite(q.y) || !isFinite(qv.x) || !isFinite(qv.y)) {
        p = players[id];
        b.SetPosition(new V(p && isFinite(p.rx) ? p.rx : 0, p && isFinite(p.ry) ? p.ry : 0));
        b.SetLinearVelocity(new V(0, 0));
        b.SetAngularVelocity(0);
      }
    }
    this.world.Step(PH.STEP, PH.VELOCITY_ITERATIONS, PH.POSITION_ITERATIONS);
    if (!playing || (this.game.egg && this.game.egg.state !== 'play')) return;
    for (id in this.bodies) {
      b = this.bodies[id]; p = players[id];
      if (!p || p.dead || !b.IsActive()) continue;
      var v = b.GetLinearVelocity(), ms = p.ms || PH.MAX_SPEED, ac = p.ac || PH.ACCEL, k = p.keys;
      if (k.left && v.x > -ms) v.x -= ac;
      if (k.right && v.x < ms) v.x += ac;
      if (k.up && v.y > -ms) v.y -= ac;
      if (k.down && v.y < ms) v.y += ac;
      b.SetLinearVelocity(v);
    }
  };

  // advance by dt ms in fixed ticks
  World.prototype.advance = function (dt, playing, onTick) {
    this.acc += Math.min(dt, 250);
    var n = 0;
    while (this.acc >= 1000 / 60 && n++ < 15) {
      this.acc -= 1000 / 60;
      this.step(playing);
      if (onTick) onTick();
    }
  };

  window.BPPhysics = { World: World };
})();
