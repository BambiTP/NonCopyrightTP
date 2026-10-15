// replays.js - the replay list (/replays/data, server/replays.js); Watch opens /game?replay=<key>.
(function () {
  var rows = document.getElementById('replay-rows');
  var user = document.getElementById('filters').getAttribute('data-user');
  var page = 0, pageSize = 25;
  if (!user) document.getElementById('f-mine-wrap').style.display = 'none';
  var q = new URLSearchParams(location.search);
  if (q.get('userId')) { user = q.get('userId'); document.getElementById('f-mine').checked = true; }

  // the viewer key: base64 of the game id's bytes (24 hex) with "+" -> "_"
  function key(hex) {
    var bin = '';
    for (var i = 0; i < hex.length; i += 2) bin += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    return btoa(bin).replace(/\+/g, '_');
  }
  function when(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function load() {
    var p = { page: page, pageSize: pageSize };
    var map = document.getElementById('f-map').value.trim();
    var vis = document.getElementById('f-vis').value;
    if (map) p.mapName = map;
    if (vis) p.visibility = vis;
    if (document.getElementById('f-mine').checked && user) p.userId = user;
    fetch('/replays/data?' + new URLSearchParams(p)).then(function (r) { return r.json(); }).then(function (d) {
      document.getElementById('page-no').textContent = 'Page ' + (page + 1);
      document.getElementById('prev').disabled = page === 0;
      document.getElementById('next').disabled = d.games.length < pageSize;
      if (!d.games.length) { rows.innerHTML = '<tr><td colspan="7" class="muted">No replays found.</td></tr>'; return; }
      rows.innerHTML = d.games.map(function (g) {
        var red = g.teams.red, blue = g.teams.blue;
        var result = g.myTeam ? (g.myTeamWon ? '<span class="won">Won</span> ' : g.winner === 0 ? 'Tie ' : '<span class="lost">Lost</span> ') : '';
        var names = g.players.map(function (p) { return '<span class="' + (p.team === 1 ? 'score-red' : 'score-blue') + '" style="font-weight:400">' + BP.esc(p.displayName) + '</span>'; }).join(', ');
        return '<tr><td>' + when(g.started) + '</td><td>' + BP.esc(g.mapName) + '</td><td>' + BP.esc(g.visibility) + '</td>'
          + '<td class="text-center">' + result + '<span class="score-red">' + red.score + '</span> - <span class="score-blue">' + blue.score + '</span></td>'
          + '<td>' + BP.duration(g.duration) + '</td><td style="font-size:13px">' + names + '</td>'
          + '<td class="text-right" style="white-space:nowrap"><a class="btn btn-primary btn-tiny" href="/game?replay=' + encodeURIComponent(key(g.id)) + '">Watch</a> '
          + '<a class="btn btn-default btn-tiny" href="/replays/gameFile?gameId=' + g.id + '">Download</a></td></tr>';
      }).join('');
    });
  }
  ['f-map', 'f-vis', 'f-mine'].forEach(function (id) { document.getElementById(id).addEventListener('change', function () { page = 0; load(); }); });
  document.getElementById('prev').addEventListener('click', function () { if (page > 0) { page--; load(); } });
  document.getElementById('next').addEventListener('click', function () { page++; load(); });
  load();
})();
