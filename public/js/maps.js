// The Maps page: the rotation with play counts and ratings (socket /maps/, server/mapstats.js).
(function () {
  var grid = document.getElementById('maps');
  var maps = [], votes = {}, loggedIn = false;
  var socket = io('/maps/', { transports: ['websocket', 'polling'] });

  function keyOf(m) { return m._id.replace(/^0+/, ''); }
  function render() {
    var q = document.getElementById('map-search').value.trim().toLowerCase();
    var type = document.getElementById('map-type').value;
    var sort = document.getElementById('map-sort').value;
    var list = maps.filter(function (m) { return (!q || m.name.toLowerCase().indexOf(q) >= 0 || m.author.toLowerCase().indexOf(q) >= 0) && (!type || m.type === type); });
    list.sort(function (a, b) {
      if (sort === 'plays') return b.totalPlays - a.totalPlays;
      if (sort === 'name') return a.name.localeCompare(b.name);
      return (b.score - a.score) || (b.totalUsers - a.totalUsers);
    });
    grid.innerHTML = '';
    list.forEach(function (m) {
      var mine = votes[m._id];
      var card = document.createElement('div');
      card.className = 'map-card';
      card.innerHTML = '<canvas width="460" height="300"></canvas>'
        + '<div class="name">' + BP.esc(m.name) + '</div>'
        + '<div class="meta"><span>by ' + BP.esc(m.author) + '</span><span>' + (m.type === 'nf' ? 'Neutral flag' : 'CTF') + '</span></div>'
        + '<div class="meta"><span>' + m.totalPlays + ' plays</span><span>' + (m.totalUsers ? m.score + '% liked (' + m.totalUsers + ')' : 'not rated yet') + '</span></div>'
        + '<div class="bar"><i style="width:' + m.averageLikes + '%;background:var(--accent)"></i><i style="width:' + m.averageIndifferents + '%;background:#777"></i><i style="width:' + m.averageDislikes + '%;background:var(--red)"></i></div>'
        + (loggedIn ? '<div class="votes">' + [[1, 'Like'], [0, 'Meh'], [-1, 'Dislike']].map(function (v) {
          return '<button class="btn btn-tiny' + (mine === v[0] ? ' on' : '') + '" data-id="' + BP.esc(m._id) + '" data-v="' + v[0] + '">' + v[1] + '</button>';
        }).join('') + '</div>' : '');
      grid.appendChild(card);
      BP.drawMapPreview(card.querySelector('canvas'), '/maps/png/' + encodeURIComponent(keyOf(m)));
    });
    if (!list.length) grid.innerHTML = '<p class="muted">No maps found.</p>';
  }
  socket.on('allMapData', function (d) {
    maps = Object.keys(d.rotation || {}).map(function (k) { return d.rotation[k]; });
    render();
  });
  socket.on('userLoggedIn', function () { loggedIn = true; socket.emit('getVotingData'); });
  socket.on('userNotLoggedIn', function () { document.getElementById('map-login').style.display = ''; });
  socket.on('votingData', function (list) { list.forEach(function (v) { votes[v.mapId] = v.rating; }); render(); });
  socket.on('ratedMap', function (d) { votes[d.mapId] = d.rating; socket.emit('getMapData'); });
  grid.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-v]');
    if (b) socket.emit('mapRating', { mapId: b.getAttribute('data-id'), rating: +b.getAttribute('data-v') });
  });
  ['map-search', 'map-sort', 'map-type'].forEach(function (id) { document.getElementById(id).addEventListener('input', render); });
})();
