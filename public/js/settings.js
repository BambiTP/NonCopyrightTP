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

  // site style: [name, label, background, surface, accent]
  var STYLES = [
    ['slate', 'Slate', '#1b1d21', '#2e323a', '#4c8dff'], ['light', 'Light', '#f4f5f7', '#ffffff', '#2563eb'],
    ['midnight', 'Midnight', '#0b1220', '#1a2540', '#38bdf8'], ['black', 'Black', '#000000', '#1a1a1a', '#f5f5f5'],
    ['forest', 'Forest', '#121815', '#232e27', '#3ccf7a'], ['sand', 'Sand', '#f2ede3', '#2b2620', '#c8572a'],
    ['grape', 'Grape', '#17131d', '#2b2436', '#b77cf7'], ['teams', 'Red & Blue', '#b3262b', '#2450b8', '#e5484d'],
    ['steel', 'Steel', '#e9ecef', '#212529', '#0d6efd'],
  ];
  var styles = document.getElementById('styles');
  function showStyles() {
    var cur = document.documentElement.getAttribute('data-theme');
    styles.innerHTML = STYLES.map(function (t) {
      return '<button type="button" class="style-pick' + (t[0] === cur ? ' selected' : '') + '" data-style="' + t[0] + '">'
        + '<span class="sw"><i style="background:' + t[2] + '"></i><i style="background:' + t[3] + '"></i><i style="background:' + t[4] + '"></i></span>'
        + '<span class="nm">' + BP.esc(t[1]) + '</span></button>';
    }).join('');
  }
  showStyles();
  styles.addEventListener('click', function (e) {
    var b = e.target.closest('[data-style]');
    if (!b) return;
    BP.setCookie('style', b.getAttribute('data-style'));
    document.documentElement.setAttribute('data-theme', b.getAttribute('data-style'));
    showStyles();
  });
})();
