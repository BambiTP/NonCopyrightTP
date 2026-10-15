// The arena banner (drawn with your texture pack), queue counts, live games and groups.
(function () {
  var banner = document.getElementById('back-to-group');
  var gid = banner.getAttribute('data-group');
  if (gid && gid !== 'null') {
    document.getElementById('back-to-group-link').href = '/groups/' + gid;
    banner.style.display = '';
  }

  // a 30 x 9 arena with every tile, red on the left and blue on the right
  var canvas = document.getElementById('arena');
  var diamond = function (x, y) { return [[x, y, 1.4], [x + 1, y, 1.1], [x, y + 1, 1.3], [x + 1, y + 1, 1.2]]; };
  BPScene.draw(canvas, JSON.parse(canvas.getAttribute('data-pack')), {
    w: 30, h: 9,
    walls: [].concat(diamond(8, 2), diamond(8, 5), diamond(20, 2), diamond(20, 5)),
    items: [
      [3, 4, 'flagRed'], [26, 4, 'flagBlue'], [14, 4, 'flagYellow'], [15, 4, 'flagYellow'],
      [2, 1, 'portal'], [27, 1, 'portal'], [2, 7, 'portalRed'], [27, 7, 'portalBlue'],
      [5, 2, 'boostRed'], [24, 2, 'boostBlue'], [5, 6, 'boost'], [24, 6, 'boost'],
      [11, 1, 'jukeJuice'], [18, 1, 'rollingBomb'], [11, 7, 'tagpro'], [18, 7, 'topSpeed'],
      [14, 1, 'bomb'], [15, 7, 'bomb'], [12, 4, 'spike'], [17, 4, 'spike'],
      [10, 4, 'button'], [19, 4, 'button'], [13, 6, 'gateOff'], [14, 6, 'gateGreen'], [16, 6, 'gateRed'], [17, 6, 'gateBlue'],
      [6, 4, 'ballRed'], [23, 3, 'ballBlue'],
    ],
  });

  var esc = BP.esc;
  function list(el, items, empty, row) {
    el.innerHTML = items.length ? items.map(row).join('') : '<p class="muted">' + empty + '</p>';
  }
  function refresh() {
    fetch('/live.json').then(function (r) { return r.json(); }).then(function (d) {
      var q = d.queue, rk = d.ranked;
      document.getElementById('queue-casual').textContent = q.queued + ' of ' + q.needed + ' in queue · ' + q.playing + ' playing';
      document.getElementById('queue-ranked').textContent = rk.queued ? rk.queued + ' in ranked queue' : '';
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
