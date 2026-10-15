// Draws the map, balls and effects on a canvas. Coordinates: tile (x, y) is centred on
// pixel (40x, 40y), balls are at metres * 100, the same space the server uses.
(function () {
  var PH = TPConstants.PHYSICS;
  var CHUNK = 16; // tiles per cached chunk side
  var A = BPAssets;

  function base(t) { return Math.floor(parseFloat(t)); }
  // the part after the tile's base id: "" (normal), "1" (used up), "1xx" (respawn warning xx), ...
  function suffix(t) { var s = String(t), i = s.indexOf('.'); return i < 0 ? '' : s.slice(i + 1); }
  function isWall(t) { return base(t) === 1; }

  var W = BPWalls;
  var STATIC = { 2: 1, 7: 1, 8: 1, 11: 1, 12: 1, 17: 1, 18: 1, 22: 1, 23: 1 }; // drawn once into the floor layer

  function Renderer(canvas, game, assets) {
    this.canvas = canvas;
    this.c = canvas.getContext('2d');
    this.game = game;
    this.assets = assets;
    this.zoom = 1;
    this.cam = { x: 0, y: 0 };
    this.chunks = {};
    var self = this;
    game.on('map', function () { self.chunks = {}; self.diagFloor = W.diagonalFloors(game.tiles); });
    game.on('tile', function (x, y) {
      // walls and static tiles never change; but a changed tile could border a wall piece
      if (STATIC[base(self.game.tiles[x][y])] || isWall(self.game.tiles[x][y])) self.dropChunk(x, y);
    });
    game.on('splat', function (s) { if (!s.temp) self.paintSplat(s); });
  }

  Renderer.prototype.dropChunk = function (x, y) { delete this.chunks[Math.floor(x / CHUNK) + ',' + Math.floor(y / CHUNK)]; };

  Renderer.prototype.resize = function () {
    var dpr = window.devicePixelRatio || 1;
    var w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.dpr = dpr; this.w = w; this.h = h;
  };

  // cached chunks: floor (+ static tiles), splats, walls
  Renderer.prototype.chunk = function (cx, cy) {
    var key = cx + ',' + cy, ch = this.chunks[key];
    if (ch) return ch;
    var size = CHUNK * 40;
    ch = this.chunks[key] = { floor: document.createElement('canvas'), splat: document.createElement('canvas'), wall: document.createElement('canvas'), ox: cx * CHUNK * 40 - 20, oy: cy * CHUNK * 40 - 20 };
    [ch.floor, ch.splat, ch.wall].forEach(function (cv) { cv.width = size; cv.height = size; });
    var tiles = this.game.tiles, img = this.assets.img.tiles;
    var fc = ch.floor.getContext('2d'), wc = ch.wall.getContext('2d');
    var x0 = cx * CHUNK, y0 = cy * CHUNK;
    for (var x = x0; x < x0 + CHUNK && x < tiles.length; x++) for (var y = y0; y < y0 + CHUNK && y < tiles[x].length; y++) {
      var t = tiles[x][y], b = base(t), px = (x - x0) * 40, py = (y - y0) * 40;
      if (+t === 0) continue;
      if (b === 1) {
        if (+t !== 1 && this.diagFloor(x, y)) this.tileTo(fc, 'floor', px, py); // a diagonal's open half
        W.draw(wc, tiles, x, y, px, py, img);
        continue;
      }
      this.tileTo(fc, 'floor', px, py);
      if (b === 7) this.tileTo(fc, 'spike', px, py);
      else if (b === 8) this.tileTo(fc, 'button', px, py);
      else if (b === 11) this.tileTo(fc, 'tileRed', px, py);
      else if (b === 12) this.tileTo(fc, 'tileBlue', px, py);
      else if (b === 23) this.tileTo(fc, 'tileYellow', px, py);
      else if (b === 17) this.tileTo(fc, 'endzoneRed', px, py);
      else if (b === 18) this.tileTo(fc, 'endzoneBlue', px, py);
      else if (b === 22) drawWell(fc, px + 20, py + 20);
    }
    // splats already on the map
    var self = this;
    this.game.splats.forEach(function (s) { if (!s.temp) self.paintSplat(s, ch); });
    return ch;
  };

  Renderer.prototype.tileTo = function (c, name, px, py) {
    var s = A.SPRITE[name], img = this.assets.img.tiles;
    if (s && img) c.drawImage(img, s[0] * 40, s[1] * 40, 40, 40, px, py, 40, 40);
  };

  // splats: splats.png has one 120 px row per team
  Renderer.prototype.paintSplat = function (s, only) {
    var img = this.assets.img.splats;
    if (!img) return;
    var cols = Math.max(1, Math.floor(img.width / 120)), row = s.team === 2 ? 1 : 0;
    if (row * 120 >= img.height) row = 0;
    var self = this, chunks = only ? [only] : [];
    // a 120 px splat can overlap up to four chunks (chunks not built yet paint it when they are)
    if (!only) [[-60, -60], [60, -60], [-60, 60], [60, 60]].forEach(function (d) {
      var k = Math.floor(Math.floor((s.x + d[0] + 20) / 40) / CHUNK) + ',' + Math.floor(Math.floor((s.y + d[1] + 20) / 40) / CHUNK);
      if (self.chunks[k] && chunks.indexOf(self.chunks[k]) < 0) chunks.push(self.chunks[k]);
    });
    chunks.forEach(function (ch) {
      ch.splat.getContext('2d').drawImage(img, (s.variant % cols) * 120, row * 120, 120, 120, s.x - 60 - ch.ox, s.y - 60 - ch.oy, 120, 120);
    });
  };

  function drawWell(c, x, y) {
    var g = c.createRadialGradient(x, y, 2, x, y, 19);
    g.addColorStop(0, 'rgba(20,0,40,1)'); g.addColorStop(0.6, 'rgba(110,60,180,.7)'); g.addColorStop(1, 'rgba(110,60,180,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, 19, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(200,170,255,.6)'; c.lineWidth = 1.5;
    for (var i = 0; i < 3; i++) { c.beginPath(); c.arc(x, y, 6 + i * 4.5, i * 2, i * 2 + 3.6); c.stroke(); }
  }

  // animated / changing tiles, drawn every frame
  Renderer.prototype.dynamicTile = function (c, t, x, y, now) {
    var b = base(t), sfx = suffix(t), cx = x * 40, cy = y * 40, a = this.assets;
    var anim = Math.floor(now / 120) % 4;
    // "1xx": respawn warning frame xx; the tile blinks back in
    var warn = sfx.length === 3 && sfx[0] === '1';
    var blinkOn = warn && Math.floor(now / 125) % 2 === 0;
    switch (b) {
      case 3: case 4: case 16: case 19: case 20: {
        var team = b === 3 || b === 19 ? 'Red' : b === 4 || b === 20 ? 'Blue' : 'Yellow';
        a.sprite(c, 'flag' + team + (sfx === '1' ? 'Away' : ''), cx, cy);
        if (b === 19 || b === 20) { c.fillStyle = '#ffcc33'; c.font = 'bold 10px sans-serif'; c.textAlign = 'center'; c.fillText('HOT', cx, cy + 18); }
        break;
      }
      case 5: case 14: case 15: {
        var key = b === 5 ? 'speedpad' : b === 14 ? 'speedpadRed' : 'speedpadBlue';
        a.frame(c, key, sfx === '' || blinkOn ? anim : 4, cx, cy);
        break;
      }
      case 13: case 24: case 25: {
        var pk = b === 13 ? 'portal' : b === 24 ? 'portalRed' : 'portalBlue';
        a.frame(c, pk, sfx === '' ? anim : 4, cx, cy);
        break;
      }
      case 6: {
        // 6 = empty; 6.k = powerup k; 6.k2 = k is coming next; 6.k01-6.k12 = k about to appear
        if (sfx === '') { a.sprite(c, 'powerupEmpty', cx, cy); break; }
        var name = A.PUPS[sfx[0]];
        if (!name) { a.sprite(c, 'powerupEmpty', cx, cy); break; }
        if (sfx.length === 1) a.sprite(c, name, cx, cy);
        else if (sfx.length === 2) { a.sprite(c, 'powerupEmpty', cx, cy); a.sprite(c, name, cx, cy, 0.5, 0.35); }
        else { a.sprite(c, 'powerupEmpty', cx, cy); if (Math.floor(now / 125) % 2 === 0) a.sprite(c, name, cx, cy, 1, 0.7); }
        break;
      }
      case 9: {
        var g = +t === 9.1 ? 'gateGreen' : +t === 9.2 ? 'gateRed' : +t === 9.3 ? 'gateBlue' : 'gateOff';
        a.sprite(c, g, cx, cy);
        break;
      }
      case 10:
        a.sprite(c, sfx === '' || blinkOn ? 'bomb' : 'bombOff', cx, cy);
        break;
      default: break;
    }
  };

  // one frame
  Renderer.prototype.draw = function (focus, now) {
    var c = this.c, g = this.game, dpr = this.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#000';
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!g.tiles || !this.assets.img.tiles) return;
    if (focus) { this.cam.x = focus.x; this.cam.y = focus.y; }
    var z = this.zoom * dpr;
    c.setTransform(z, 0, 0, z, Math.round(this.canvas.width / 2 - this.cam.x * z), Math.round(this.canvas.height / 2 - this.cam.y * z));
    c.imageSmoothingEnabled = this.zoom !== 1 || dpr !== 1;

    // visible tile range
    var halfW = this.canvas.width / 2 / z, halfH = this.canvas.height / 2 / z;
    var vx0 = Math.max(0, Math.floor((this.cam.x - halfW) / 40) - 1), vx1 = Math.min(g.tiles.length - 1, Math.ceil((this.cam.x + halfW) / 40) + 1);
    var vy0 = Math.max(0, Math.floor((this.cam.y - halfH) / 40) - 1), vy1 = Math.min(g.tiles[0].length - 1, Math.ceil((this.cam.y + halfH) / 40) + 1);
    var cx0 = Math.floor(vx0 / CHUNK), cx1 = Math.floor(vx1 / CHUNK), cy0 = Math.floor(vy0 / CHUNK), cy1 = Math.floor(vy1 / CHUNK);
    var cx, cy, ch, x, y;
    for (cx = cx0; cx <= cx1; cx++) for (cy = cy0; cy <= cy1; cy++) { ch = this.chunk(cx, cy); c.drawImage(ch.floor, ch.ox, ch.oy); }
    for (cx = cx0; cx <= cx1; cx++) for (cy = cy0; cy <= cy1; cy++) { ch = this.chunk(cx, cy); c.drawImage(ch.splat, ch.ox, ch.oy); }
    this.tempSplats(c, now);
    for (x = vx0; x <= vx1; x++) for (y = vy0; y <= vy1; y++) {
      var t = g.tiles[x][y], b = base(t);
      if (b > 2 && !STATIC[b]) this.dynamicTile(c, t, x, y, now);
    }
    for (cx = cx0; cx <= cx1; cx++) for (cy = cy0; cy <= cy1; cy++) { ch = this.chunk(cx, cy); c.drawImage(ch.wall, ch.ox, ch.oy); }

    this.spawnMarks(c, now);
    this.drawEgg(c);
    var ids = Object.keys(g.players), self = this;
    // own ball last so it's on top
    ids.sort(function (a, b) { return (g.players[a].isMe ? 1 : 0) - (g.players[b].isMe ? 1 : 0); });
    ids.forEach(function (id) { self.ball(c, g.players[id], now); });
    ids.forEach(function (id) { self.label(c, g.players[id]); });
    this.effects(c, now);
    this.markers(c, now);
  };

  Renderer.prototype.tempSplats = function (c, now) {
    var img = this.assets.img.splats;
    if (!img) return;
    var cols = Math.max(1, Math.floor(img.width / 120));
    this.game.splats.forEach(function (s) {
      if (!s.temp) return;
      var age = now - s.at;
      c.globalAlpha = Math.max(0, 1 - age / 6000);
      c.drawImage(img, (s.variant % cols) * 120, (s.team === 2 && img.height >= 240 ? 1 : 0) * 120, 120, 120, s.x - 60, s.y - 60, 120, 120);
    });
    c.globalAlpha = 1;
  };

  Renderer.prototype.spawnMarks = function (c, now) {
    var a = this.assets;
    this.game.spawns.forEach(function (s) {
      if (now > s.until) return;
      var left = s.until - now;
      a.sprite(c, s.team === 1 ? 'ballRed' : 'ballBlue', s.x, s.y, 1, 0.15 + 0.15 * Math.sin(now / 150) + (left < 500 ? 0.3 : 0));
    });
  };

  Renderer.prototype.ball = function (c, p, now) {
    if (p.dead || p.draw === false) return;
    var pos = this.game.ballPos(p);
    if (!pos) return;
    p.drawX = pos.x; p.drawY = pos.y;
    var x = pos.x, y = pos.y, a = this.assets;
    if (p.bomb) { // rolling bomb: a pulsing glow
      var k = 0.35 + 0.25 * Math.sin(now / 90);
      var gr = c.createRadialGradient(x, y, 10, x, y, 30);
      gr.addColorStop(0, 'rgba(255,140,30,' + k + ')'); gr.addColorStop(1, 'rgba(255,140,30,0)');
      c.fillStyle = gr; c.beginPath(); c.arc(x, y, 30, 0, Math.PI * 2); c.fill();
    }
    c.save();
    c.translate(x, y);
    if (BP.prefs.spin) c.rotate(pos.angle);
    a.sprite(c, p.team === 1 ? 'ballRed' : 'ballBlue', 0, 0);
    c.restore();
    if (p.tagpro) {
      c.strokeStyle = 'rgba(60,255,110,.9)'; c.lineWidth = 3;
      c.shadowColor = '#3cff6e'; c.shadowBlur = 8;
      c.beginPath(); c.arc(x, y, 20, 0, Math.PI * 2); c.stroke();
      c.shadowBlur = 0;
    }
    if (p.jukeJuice) a.sprite(c, 'jukeJuice', x + 15, y + 15, 0.4);
    if (p.speed) a.sprite(c, 'topSpeed', x - 15, y + 15, 0.4);
    if (this.game.egg && this.game.egg.holder === p.id) drawEggAt(c, x + 13, y - 13, 0.8);
    if (p.flag) {
      var blink = (p.potatoFlag && p.selfDestructSoon) ? Math.floor(now / 120) % 2 === 0 : true;
      if (blink) a.sprite(c, p.flag === 1 ? 'flagRed' : p.flag === 2 ? 'flagBlue' : 'flagYellow', x + 12, y - 22, 0.9);
    }
  };

  Renderer.prototype.label = function (c, p) {
    if (p.dead || p.draw === false || p.drawX == null || !BP.prefs.names) return;
    var x = p.drawX, y = p.drawY - 27;
    var text = p.name + (BP.prefs.degrees && p.degree ? ' ' + p.degree + '°' : '');
    c.font = 'bold 11px "Segoe UI", Arial, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.8)'; c.lineJoin = 'round';
    c.strokeText(text, x, y);
    c.fillStyle = p.auth ? '#bfff00' : '#fff';
    c.fillText(text, x, y);
    var f = p.flair;
    if (BP.prefs.flair && f && f.x != null && this.assets.img.flair) {
      var w = c.measureText(text).width;
      c.drawImage(this.assets.img.flair, f.x * 16, f.y * 16, 16, 16, x - w / 2 - 19, y - 8, 16, 16);
    }
  };

  function drawEggAt(c, x, y, s) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = '#fbf6e9'; c.strokeStyle = '#3a3226'; c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(0, 0, 9, 12, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#e7a7d0'; c.beginPath(); c.arc(-3, -3, 2, 0, 7); c.fill();
    c.fillStyle = '#8fd0f0'; c.beginPath(); c.arc(3, 3, 2, 0, 7); c.fill();
    c.restore();
  }
  Renderer.prototype.drawEgg = function (c) {
    var e = this.game.eggObj;
    if (e) drawEggAt(c, e.x * PH.SCALE, e.y * PH.SCALE, 1);
  };

  Renderer.prototype.effects = function (c, now) {
    this.game.effects.forEach(function (e) {
      var age = (now - e.at) / 1000, r, col;
      if (e.type === 3) { r = 20 + age * 120; col = '150,200,255'; } // portal flash
      else if (e.type === 1) { r = 20 + age * 220; col = '255,170,60'; } // rolling bomb
      else { r = 30 + age * 320; col = '255,120,40'; }                    // bomb
      var alpha = Math.max(0, 0.8 - age * 1.1);
      if (alpha <= 0) return;
      var gr = c.createRadialGradient(e.x, e.y, r * 0.2, e.x, e.y, r);
      gr.addColorStop(0, 'rgba(255,255,220,' + alpha + ')');
      gr.addColorStop(0.5, 'rgba(' + col + ',' + alpha * 0.7 + ')');
      gr.addColorStop(1, 'rgba(' + col + ',0)');
      c.fillStyle = gr; c.beginPath(); c.arc(e.x, e.y, r, 0, Math.PI * 2); c.fill();
    });
  };

  Renderer.prototype.markers = function (c, now) {
    var g = this.game;
    g.marks.forEach(function (m) {
      var p = g.players[m.id];
      if (!p || p.drawX == null) return;
      var bob = Math.sin(now / 120) * 4;
      c.fillStyle = '#ffd34d';
      c.beginPath(); c.moveTo(p.drawX, p.drawY - 40 + bob); c.lineTo(p.drawX - 8, p.drawY - 54 + bob); c.lineTo(p.drawX + 8, p.drawY - 54 + bob); c.fill();
    });
  };

  // screen pixel -> map pixel (for egg throws)
  Renderer.prototype.toMap = function (sx, sy) {
    return { x: this.cam.x + (sx - this.w / 2) / this.zoom, y: this.cam.y + (sy - this.h / 2) / this.zoom };
  };

  window.BPRenderer = Renderer;
})();
