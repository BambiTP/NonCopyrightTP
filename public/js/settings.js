// Preferences and key bindings, saved in this browser (BP.prefs).
(function () {
  var P = BP.prefs;
  var ROWS = [
    ['sound', 'Sound', 'check'],
    ['volume', 'Volume', 'range'],
    ['music', 'Music', 'check'],
    ['musicVolume', 'Music volume', 'range'],
    ['names', 'Names', 'check'],
    ['degrees', 'Degrees', 'check'],
    ['flair', 'Flair', 'check'],
    ['spin', 'Ball spin', 'check'],
    ['chat', 'Chat', 'check'],
    ['chatLines', 'Chat lines', 'number'],
    ['fps', 'FPS and ping', 'check'],
    ['scoreboardStats', 'Full scoreboard', 'check'],
  ];
  var box = document.getElementById('prefs');
  box.innerHTML = ROWS.map(function (r) {
    var k = r[0], v = P[k], input;
    if (r[2] === 'check') input = '<input type="checkbox" data-k="' + k + '"' + (v ? ' checked' : '') + '>';
    else if (r[2] === 'range') input = '<input type="range" min="0" max="1" step="0.05" data-k="' + k + '" value="' + v + '">';
    else input = '<input type="number" min="0" max="30" data-k="' + k + '" value="' + v + '" style="width:80px">';
    return '<div class="pref"><div class="label">' + BP.esc(r[1]) + (r[3] ? '<small>' + BP.esc(r[3]) + '</small>' : '') + '</div>' + input + '</div>';
  }).join('');
  box.addEventListener('input', function (e) {
    var k = e.target.getAttribute('data-k');
    if (!k) return;
    P[k] = e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value);
    BP.savePrefs();
  });
  box.addEventListener('change', function () { BP.toast('Saved'); });

  // key bindings (arrow keys always work as well)
  var keys = document.getElementById('keys');
  var listening = null;
  function showKeys() {
    keys.innerHTML = ['up', 'down', 'left', 'right'].map(function (d) {
      return '<div class="pref"><div class="label">Move ' + d + '</div><button class="btn btn-default keybind" type="button" data-dir="' + d + '">' + BP.esc((P.keys[d] || '').toUpperCase()) + '</button></div>';
    }).join('');
  }
  showKeys();
  keys.addEventListener('click', function (e) {
    var b = e.target.closest('[data-dir]');
    if (!b) return;
    listening = b.getAttribute('data-dir');
    BP.$$('.keybind').forEach(function (x) { x.classList.toggle('listening', x === b); });
    b.textContent = 'Press a key';
  });
  document.addEventListener('keydown', function (e) {
    if (!listening) return;
    e.preventDefault();
    if (e.key !== 'Escape' && e.key.length === 1) P.keys[listening] = e.key.toLowerCase();
    listening = null;
    BP.savePrefs();
    showKeys();
  });
  document.getElementById('keys-reset').addEventListener('click', function () {
    P.keys = Object.assign({}, BP.prefDefaults.keys);
    BP.savePrefs();
    showKeys();
    BP.toast('Keys reset');
  });
})();
