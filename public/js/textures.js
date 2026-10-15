// Texture pack picker. The choice goes in the "textures" cookie and, when logged in,
// on the account.
(function () {
  var box = document.getElementById('packs');
  var data = JSON.parse(box.getAttribute('data-packs'));
  var KEYS = ['tiles', 'splats', 'speedpad', 'speedpadRed', 'speedpadBlue', 'portal', 'portalRed', 'portalBlue'];
  var chosen = data.chosen.tiles;

  function load(src) {
    return new Promise(function (ok) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = function () { ok(null); }; i.src = src; });
  }
  // a small room in the pack: walls with rounded corners and a pillar, both flags, balls, a boost,
  // a powerup, a spike, a bomb, a portal
  var ROOM = [
    '#########',
    '#q.....e#',
    '#.R.#.B.#',
    '#z.....c#',
    '#########',
  ];
  var DIAG = { q: 1.2, e: 1.3, z: 1.1, c: 1.4 };
  var TILES = [];
  for (var x = 0; x < ROOM[0].length; x++) {
    TILES.push([]);
    for (var y = 0; y < ROOM.length; y++) TILES[x].push(ROOM[y][x] === '#' ? 1 : DIAG[ROOM[y][x]] || 2);
  }
  function draw(canvas, pack) {
    Promise.all([load(pack.tiles), load(pack.speedpad), load(pack.portal)]).then(function (im) {
      var t = im[0], sp = im[1], po = im[2];
      var c = canvas.getContext('2d');
      c.fillStyle = '#000'; c.fillRect(0, 0, canvas.width, canvas.height);
      if (!t) return;
      var tile = function (sx, sy, x, y) { c.drawImage(t, sx * 40, sy * 40, 40, 40, x * 40, y * 40, 40, 40); };
      BPWalls.drawMap(c, TILES, t);
      tile(14, 1, 2, 2); tile(15, 1, 6, 2);   // flags
      tile(14, 0, 3, 1); tile(15, 0, 5, 3);   // balls
      tile(12, 0, 4, 3);                      // spike
      tile(12, 4, 2, 3);                      // juke juice
      tile(12, 1, 6, 1);                      // bomb
      if (sp) c.drawImage(sp, 0, 0, 40, 40, 40, 80, 40, 40);   // boost (1, 2)
      if (po) c.drawImage(po, 0, 0, 40, 40, 280, 80, 40, 40);  // portal (7, 2)
    });
  }

  box.innerHTML = '';
  data.packs.forEach(function (p) {
    var card = document.createElement('div');
    card.className = 'pack' + (p.tiles === chosen ? ' selected' : '');
    card.innerHTML = '<canvas width="360" height="200"></canvas><div class="name">' + BP.esc(p.name) + '</div><div class="by">by ' + BP.esc(p.author || 'Unknown') + '</div>';
    box.appendChild(card);
    draw(card.querySelector('canvas'), p);
    card.addEventListener('click', function () {
      var pick = {};
      KEYS.forEach(function (k) { pick[k] = p[k]; });
      BP.setCookie('textures', JSON.stringify(pick));
      BP.post('/textures', pick).catch(function () {});
      BP.$$('.pack', box).forEach(function (el) { el.classList.toggle('selected', el === card); });
      BP.toast(p.name);
    });
  });
})();
