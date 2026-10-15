// Draws a small made-up map with a texture pack: the home page banner and the texture previews.
// Needs walls.js. A layout is { w, h, walls: [[x, y, tile]], items: [[x, y, name]] }; the border is
// wall with 45s in the corners, everything else is floor.
(function () {
  var SPRITE = {
    spike: [12, 0], bomb: [12, 1], ballRed: [14, 0], ballBlue: [15, 0],
    flagRed: [14, 1], flagBlue: [15, 1], flagYellow: [13, 1],
    gateOff: [12, 3], gateGreen: [13, 3], gateRed: [14, 3], gateBlue: [15, 3],
    jukeJuice: [12, 4], rollingBomb: [12, 5], tagpro: [12, 6], topSpeed: [12, 7],
    tileRed: [14, 4], tileBlue: [15, 4], tileYellow: [13, 5], button: [13, 6],
  };
  // items that sit on a team tile
  var UNDER = { flagRed: 'tileRed', flagBlue: 'tileBlue', flagYellow: 'tileYellow' };
  // items from their own image (first animation frame)
  var SHEET = { boost: 'speedpad', boostRed: 'speedpadRed', boostBlue: 'speedpadBlue', portal: 'portal', portalRed: 'portalRed', portalBlue: 'portalBlue' };

  function load(src) {
    return new Promise(function (ok) {
      if (!src) return ok(null);
      var i = new Image(); i.onload = function () { ok(i); }; i.onerror = function () { ok(null); }; i.src = src;
    });
  }

  function grid(layout) {
    var W = layout.w, H = layout.h, t = [];
    for (var x = 0; x < W; x++) {
      t.push([]);
      for (var y = 0; y < H; y++) t[x].push(x === 0 || y === 0 || x === W - 1 || y === H - 1 ? 1 : 2);
    }
    t[1][1] = 1.2; t[W - 2][1] = 1.3; t[1][H - 2] = 1.1; t[W - 2][H - 2] = 1.4;
    (layout.walls || []).forEach(function (w) { t[w[0]][w[1]] = w[2] || 1; });
    return t;
  }

  function draw(canvas, pack, layout) {
    var keys = ['tiles'].concat(Object.keys(SHEET).map(function (k) { return SHEET[k]; }));
    return Promise.all(keys.map(function (k) { return load(pack[k]); })).then(function (im) {
      var img = {};
      keys.forEach(function (k, i) { img[k] = im[i]; });
      var c = canvas.getContext('2d'), t = img.tiles;
      canvas.width = layout.w * 40; canvas.height = layout.h * 40;
      c.fillStyle = '#000'; c.fillRect(0, 0, canvas.width, canvas.height);
      if (!t) return;
      BPWalls.drawMap(c, grid(layout), t);
      var sprite = function (name, x, y) { var s = SPRITE[name]; c.drawImage(t, s[0] * 40, s[1] * 40, 40, 40, x * 40, y * 40, 40, 40); };
      layout.items.forEach(function (it) {
        var x = it[0], y = it[1], name = it[2];
        if (UNDER[name]) sprite(UNDER[name], x, y);
        if (SPRITE[name]) sprite(name, x, y);
        else if (SHEET[name] && img[SHEET[name]]) c.drawImage(img[SHEET[name]], 0, 0, 40, 40, x * 40, y * 40, 40, 40);
      });
    });
  }

  // every tile once, for the texture pack cards
  var PREVIEW = {
    w: 15, h: 7,
    items: [
      [2, 1, 'jukeJuice'], [4, 1, 'rollingBomb'], [7, 1, 'flagYellow'], [10, 1, 'tagpro'], [12, 1, 'topSpeed'],
      [4, 2, 'boostRed'], [10, 2, 'boostBlue'], [7, 2, 'spike'],
      [2, 3, 'flagRed'], [3, 3, 'ballRed'], [11, 3, 'ballBlue'], [12, 3, 'flagBlue'],
      [5, 3, 'gateOff'], [6, 3, 'gateGreen'], [7, 3, 'button'], [8, 3, 'gateRed'], [9, 3, 'gateBlue'],
      [2, 5, 'portalRed'], [5, 5, 'boost'], [7, 4, 'bomb'], [9, 5, 'portal'], [12, 5, 'portalBlue'],
    ],
  };

  window.BPScene = { draw: draw, PREVIEW: PREVIEW };
})();
