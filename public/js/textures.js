// textures.js - texture pack picker. Each card draws a small scene from the pack's own images.
// The choice goes in the "textures" cookie (read by the server for game pages) and, when logged
// in, on the account (POST /textures).
(function () {
  var box = document.getElementById('packs');
  var data = JSON.parse(box.getAttribute('data-packs'));
  var KEYS = ['tiles', 'splats', 'speedpad', 'speedpadRed', 'speedpadBlue', 'portal', 'portalRed', 'portalBlue'];
  var chosen = data.chosen.tiles;

  function load(src) {
    return new Promise(function (ok) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = function () { ok(null); }; i.src = src; });
  }
  // a 7 x 4 tile scene: floor, a wall row, both flags, balls, a boost, a powerup, a spike, a portal
  function draw(canvas, pack) {
    Promise.all([load(pack.tiles), load(pack.speedpad), load(pack.portal)]).then(function (im) {
      var t = im[0], sp = im[1], po = im[2];
      var c = canvas.getContext('2d');
      c.fillStyle = '#000'; c.fillRect(0, 0, canvas.width, canvas.height);
      if (!t) return;
      var tile = function (sx, sy, x, y) { c.drawImage(t, sx * 40, sy * 40, 40, 40, x * 40, y * 40, 40, 40); };
      for (var x = 0; x < 7; x++) for (var y = 0; y < 4; y++) tile(13, 4, x, y);
      tile(14, 4, 0, 3); tile(15, 4, 6, 3); // team tiles
      tile(14, 1, 1, 1); tile(15, 1, 5, 1);  // flags
      tile(12, 0, 3, 3);                      // spike
      tile(12, 4, 3, 1);                      // juke juice
      tile(14, 0, 2, 2); tile(15, 0, 4, 2);  // balls
      if (sp) c.drawImage(sp, 0, 0, 40, 40, 0, 0, 40, 40);
      if (po) c.drawImage(po, 0, 0, 40, 40, 240, 0, 40, 40);
      tile(12, 1, 6, 2);                      // bomb
    });
  }

  box.innerHTML = '';
  data.packs.forEach(function (p) {
    var card = document.createElement('div');
    card.className = 'pack' + (p.tiles === chosen ? ' selected' : '');
    card.innerHTML = '<canvas width="280" height="160"></canvas><div class="name">' + BP.esc(p.name) + '</div><div class="by">by ' + BP.esc(p.author || 'Unknown') + '</div>';
    box.appendChild(card);
    draw(card.querySelector('canvas'), p);
    card.addEventListener('click', function () {
      var pick = {};
      KEYS.forEach(function (k) { pick[k] = p[k]; });
      BP.setCookie('textures', JSON.stringify(pick));
      BP.post('/textures', pick).catch(function () {});
      BP.$$('.pack', box).forEach(function (el) { el.classList.toggle('selected', el === card); });
      BP.toast(p.name + ' selected');
    });
  });
})();
