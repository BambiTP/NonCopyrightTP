// Texture pack picker. The choice goes in the "textures" cookie and, when logged in,
// on the account.
(function () {
  var box = document.getElementById('packs');
  var data = JSON.parse(box.getAttribute('data-packs'));
  var KEYS = ['tiles', 'splats', 'speedpad', 'speedpadRed', 'speedpadBlue', 'portal', 'portalRed', 'portalBlue'];
  var chosen = data.chosen.tiles;

  function draw(canvas, pack) { BPScene.draw(canvas, pack, BPScene.PREVIEW); }

  box.innerHTML = '';
  data.packs.forEach(function (p) {
    var card = document.createElement('div');
    card.className = 'pack' + (p.tiles === chosen ? ' selected' : '');
    card.innerHTML = '<canvas width="600" height="280"></canvas><div class="name">' + BP.esc(p.name) + '</div><div class="by">by ' + BP.esc(p.author || 'Unknown') + '</div>';
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
