// site.js - helpers shared by every page (BP.*), and the player's preferences (kept in this browser).
(function () {
  var BP = window.BP = {};

  BP.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  BP.$ = function (sel, root) { return (root || document).querySelector(sel); };
  BP.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  BP.cookie = function (name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/\W/g, '\\$&') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  };
  BP.setCookie = function (name, value) {
    document.cookie = name + '=' + encodeURIComponent(value) + '; path=/; max-age=' + (60 * 60 * 24 * 365 * 5) + '; samesite=lax';
  };

  // form-encoded POST, JSON answer
  BP.post = function (url, data) {
    return fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(data).toString(),
    }).then(function (r) { return r.json(); });
  };

  BP.toast = function (msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(BP._toast);
    BP._toast = setTimeout(function () { t.style.display = 'none'; }, 2200);
  };

  BP.duration = function (ms) {
    var s = Math.round(ms / 1000);
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  };

  // ---- preferences (settings page; read by the game) ----
  var PREF_DEFAULTS = {
    sound: true, volume: 0.7, music: false, musicVolume: 0.3,
    names: true, degrees: true, flair: true, spin: true,
    chat: true, chatLines: 8, fps: true, scoreboardStats: true,
    keys: { up: 'w', down: 's', left: 'a', right: 'd' },
  };
  function loadPrefs() {
    var p = {};
    try { p = JSON.parse(localStorage.getItem('bp-prefs') || '{}') || {}; } catch (e) { p = {}; }
    var out = {};
    for (var k in PREF_DEFAULTS) out[k] = p[k] !== undefined ? p[k] : PREF_DEFAULTS[k];
    out.keys = Object.assign({}, PREF_DEFAULTS.keys, p.keys || {});
    return out;
  }
  BP.prefs = loadPrefs();
  BP.prefDefaults = PREF_DEFAULTS;
  BP.savePrefs = function () {
    try { localStorage.setItem('bp-prefs', JSON.stringify(BP.prefs)); } catch (e) { /* private window */ }
  };

  // group lists: click "Players: N" to show the member list
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('.showMemberList');
    if (!t) return;
    var list = t.parentNode.querySelector('.memberList');
    if (list) list.style.display = list.style.display === 'block' ? 'none' : 'block';
  });
})();
