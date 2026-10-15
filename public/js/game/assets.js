// assets.js - texture pack images, sprite positions in the community tile-sheet layout, and sounds.
(function () {
  // tiles.png: 40 px cells; the left 12 columns are wall pieces (see walls.js)
  var SPRITE = {
    floor: [13, 4], spike: [12, 0], ballRed: [14, 0], ballBlue: [15, 0],
    bomb: [12, 1], bombOff: [12, 2],
    flagYellow: [13, 1], flagRed: [14, 1], flagBlue: [15, 1],
    flagYellowAway: [13, 2], flagRedAway: [14, 2], flagBlueAway: [15, 2],
    gateOff: [12, 3], gateGreen: [13, 3], gateRed: [14, 3], gateBlue: [15, 3],
    jukeJuice: [12, 4], rollingBomb: [12, 5], tagpro: [12, 6], topSpeed: [12, 7], powerupEmpty: [12, 8],
    tileRed: [14, 4], tileBlue: [15, 4], tileYellow: [13, 5], endzoneRed: [14, 5], endzoneBlue: [15, 5],
    button: [13, 6],
  };
  var PUPS = { 1: 'jukeJuice', 2: 'rollingBomb', 3: 'tagpro', 4: 'topSpeed' };

  function loadImage(src) {
    return new Promise(function (ok) {
      if (!src) return ok(null);
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { ok(img); };
      img.onerror = function () { ok(null); };
      img.src = src;
    });
  }

  // urls: { tiles, splats, speedpad, speedpadRed, speedpadBlue, portal, portalRed, portalBlue }
  function Assets(urls) { this.urls = urls; this.img = {}; }
  Assets.prototype.load = function () {
    var self = this, keys = Object.keys(this.urls);
    var extra = { flair: '/images/flair.png' };
    return Promise.all(keys.map(function (k) { return loadImage(self.urls[k]).then(function (i) { self.img[k] = i; }); })
      .concat(Object.keys(extra).map(function (k) { return loadImage(extra[k]).then(function (i) { self.img[k] = i; }); })))
      .then(function () {
        // a pack without an image falls back to the default pack's
        var D = '/textures/musclescupgradients/';
        var files = { tiles: 'tiles', splats: 'splats', speedpad: 'speedpad', speedpadRed: 'speedpadred', speedpadBlue: 'speedpadblue', portal: 'portal', portalRed: 'portalred', portalBlue: 'portalblue' };
        return Promise.all(Object.keys(files).filter(function (k) { return !self.img[k]; }).map(function (k) {
          return loadImage(D + files[k] + '.png').then(function (i) { self.img[k] = i; });
        }));
      }).then(function () { return self; });
  };
  // swap the tile sheet (eggball uses its own)
  Assets.prototype.useTiles = function (src) {
    var self = this;
    return loadImage(src).then(function (i) { if (i) self.img.tiles = i; });
  };

  // draw sprite `name` with its centre at (x, y), optionally scaled
  Assets.prototype.sprite = function (c, name, x, y, scale, alpha) {
    var s = SPRITE[name], img = this.img.tiles;
    if (!s || !img) return;
    var size = 40 * (scale || 1);
    if (alpha != null) c.globalAlpha = alpha;
    c.drawImage(img, s[0] * 40, s[1] * 40, 40, 40, x - size / 2, y - size / 2, size, size);
    if (alpha != null) c.globalAlpha = 1;
  };
  // a frame of a 5-frame strip (speedpads, portals): frames 0-3 animate, 4 is "used up"
  Assets.prototype.frame = function (c, key, frame, x, y) {
    var img = this.img[key];
    if (!img) return;
    c.drawImage(img, frame * 40, 0, 40, 40, x - 20, y - 20, 40, 40);
  };

  // ---- sounds ----
  var SOUND_FILES = ['alert', 'alertlong', 'bing', 'burst', 'cheering', 'click', 'countdown', 'degreeup', 'drop', 'explosion',
    'friendlyalert', 'friendlydrop', 'go', 'mark', 'overtime', 'pop', 'powerup', 'sigh', 'teleport', 'wind', 'ranked-ready', 'ranked-reminder'];
  var ALIAS = { throw: 'click' }; // event sounds without a file of their own
  function Sounds() {
    this.cache = {};
    this.enabled = BP.prefs.sound;
    this.volume = BP.prefs.volume;
  }
  Sounds.prototype.play = function (name, vol) {
    if (!this.enabled) return;
    name = ALIAS[name] || name;
    if (SOUND_FILES.indexOf(name) < 0) return;
    var base = this.cache[name];
    if (!base) {
      base = this.cache[name] = new Audio('/sounds/' + name + '.mp3');
      base.preload = 'auto';
    }
    var a = base.paused || base.ended || base.currentTime === 0 ? base : base.cloneNode();
    a.volume = Math.max(0, Math.min(1, (vol == null ? 1 : vol) * this.volume));
    try { a.currentTime = 0; } catch (e) { /* not loaded yet */ }
    var p = a.play();
    if (p && p.catch) p.catch(function () { /* autoplay blocked until the first key press */ });
  };

  // ---- music (community tracks, downloaded on the server by deploy/fetch-music.sh) ----
  function Music() { this.audio = null; this.list = null; }
  Music.prototype.start = function () {
    if (!BP.prefs.music || this.audio) return;
    var self = this;
    fetch('/music.json').then(function (r) { return r.json(); }).then(function (list) {
      self.list = list;
      self.next();
    }).catch(function () {});
  };
  Music.prototype.next = function () {
    if (!this.list || !this.list.length) return;
    var t = this.list[Math.floor(Math.random() * this.list.length)], self = this;
    var a = this.audio = new Audio('/sounds/music/' + encodeURIComponent(t.url) + '.mp3');
    a.volume = Math.min(1, BP.prefs.musicVolume * (Number(t.volume) || 0.5) * 2);
    a.onended = function () { self.next(); };
    a.onerror = function () { self.audio = null; }; // the server doesn't have the music
    var p = a.play();
    if (p && p.catch) p.catch(function () {});
    this.track = t;
  };
  Music.prototype.stop = function () { if (this.audio) { this.audio.pause(); this.audio = null; } };

  window.BPAssets = { Assets: Assets, Sounds: Sounds, Music: Music, SPRITE: SPRITE, PUPS: PUPS };
})();
