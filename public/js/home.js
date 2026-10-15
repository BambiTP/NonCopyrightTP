// The arena banner (drawn with your texture pack), queue counts, live games and groups.
(function () {
  var banner = document.getElementById('back-to-group');
  var gid = banner.getAttribute('data-group');
  if (gid && gid !== 'null') {
    document.getElementById('back-to-group-link').href = '/groups/' + gid;
    banner.style.display = '';
  }

  // a 28 x 7 arena: rounded corners, two diamond pillars, both bases
  var canvas = document.getElementById('arena');
  var rows = [
    '############################',
    '#q........................e#',
    '#..R.....cz......cz.....B..#',
    '#..f.....eq......eq.....g..#',
    '#....................r.....#',
    '#z........................c#',
    '############################',
  ];
  var DIAG = { q: 1.2, e: 1.3, z: 1.1, c: 1.4 };
  var tiles = [];
  for (var x = 0; x < rows[0].length; x++) {
    tiles.push([]);
    for (var y = 0; y < rows.length; y++) {
      var ch = rows[y][x];
      tiles[x].push(ch === '#' ? 1 : DIAG[ch] || (ch === ' ' ? 0 : 2));
    }
  }
  var SPRITES = { R: [14, 1], B: [15, 1], f: [14, 4], g: [15, 4], r: [12, 4] };
  var img = new Image();
  img.onload = function () {
    var c = canvas.getContext('2d');
    BPWalls.drawMap(c, tiles, img, function (x, y, t, px, py) {
      var s = SPRITES[rows[y][x]];
      if (s) c.drawImage(img, s[0] * 40, s[1] * 40, 40, 40, px, py, 40, 40);
    });
    // a red ball chasing a blue one
    c.drawImage(img, 14 * 40, 0, 40, 40, 250, 170, 40, 40);
    c.drawImage(img, 15 * 40, 0, 40, 40, 900, 90, 40, 40);
  };
  img.src = canvas.getAttribute('data-tiles');

  var esc = BP.esc;
  function list(el, items, empty, row) {
    el.innerHTML = items.length ? items.map(row).join('') : '<p class="muted">' + empty + '</p>';
  }
  function refresh() {
    fetch('/live.json').then(function (r) { return r.json(); }).then(function (d) {
      var q = d.queue, rk = d.ranked;
      document.getElementById('queue-casual').textContent = q.queued + '/' + q.needed + ' in queue · ' + q.playing + ' playing';
      document.getElementById('queue-ranked').textContent = rk.queued ? '(' + rk.queued + ')' : '';
      list(document.getElementById('live-games'), d.games, 'Nothing running.', function (g) {
        return '<a class="row-link" href="/games/watch/' + esc(g.id) + '"><span class="title">' + esc(g.map) + '</span>'
          + '<span class="muted">' + esc(g.group || (g.ranked ? 'Ranked' : 'Public')) + ' · ' + g.players + ' playing</span>'
          + '<span class="score"><span class="score-red">' + g.red + '</span> - <span class="score-blue">' + g.blue + '</span></span>'
          + '<span class="go">Watch</span></a>';
      });
      list(document.getElementById('live-groups'), d.groups, 'No open groups.', function (g) {
        return '<a class="row-link" href="/groups/' + esc(g.id) + '"><span class="title">' + esc(g.name) + '</span>'
          + '<span class="muted">' + (g.playing ? 'in a game' : 'waiting') + '</span><span class="count">' + g.players + '</span>'
          + '<span class="go">Join</span></a>';
      });
    }).catch(function () {});
  }
  refresh();
  setInterval(refresh, 5000);
})();
