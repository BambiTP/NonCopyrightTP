// The joiner (/games/find): waits in the Play Now / ranked queue, or forwards a group
// member to their group's game. Server side: games.js attachJoiner, queue.js, ranked.js.
(function () {
  var box = document.getElementById('joiner');
  var group = box.getAttribute('data-group');
  var inGroup = group && group !== 'null';
  var ranked = box.getAttribute('data-type') === 'ranked';
  var status = document.getElementById('joiner-status');
  var counts = document.getElementById('joiner-counts');
  var title = document.getElementById('joiner-title');
  if (inGroup) {
    document.getElementById('queue-tabs').style.display = 'none';
    title.textContent = 'Joining your group’s game';
    document.getElementById('joiner-cancel').href = '/groups/' + group;
  } else if (ranked) title.textContent = 'Finding an Eggball Ranked game';

  var socket = io('/games/find', { transports: ['websocket', 'polling'] });
  var sent = false;
  function select() {
    if (sent) return;
    sent = true;
    socket.emit('JoinerSelections', { regions: ['US East'], gameModes: ['classic'], spectate: false });
  }
  socket.on('connect', function () { status.textContent = 'Connected. Looking for a game...'; });
  socket.on('ready', select);
  socket.on('JoinerSettings', select);
  socket.on('Full', function () { status.textContent = inGroup ? 'Waiting for your group’s game...' : 'Waiting for more players...'; });
  socket.on('serverStatsUpdated', function (s) {
    var t = s && s.TOTAL;
    if (t) counts.textContent = t.casualMatchmaking + ' waiting · ' + t.ingame + ' playing in ' + t.games + ' game' + (t.games === 1 ? '' : 's');
  });
  socket.on('NotRankedEligible', function (d) {
    status.textContent = 'You can’t play ranked right now. Try again in ' + (d && d.timeLeft || 'a while') + '.';
  });
  socket.on('FoundWorld', function (d) {
    status.textContent = 'Found a game! Joining...';
    location.href = (d && d.url) || '/game';
  });
  socket.on('SendToPage', function (d) {
    status.textContent = (d && d.reason) || 'Sending you back...';
    setTimeout(function () { location.href = (d && d.url) || '/'; }, 1500);
  });
  socket.on('disconnect', function () { if (!sent) status.textContent = 'Lost the connection. Reload to try again.'; });
  if (ranked && !inGroup) setInterval(function () {
    fetch('/queue/status?type=ranked').then(function (r) { return r.json(); }).then(function (c) {
      counts.textContent = c.queued + ' of ' + c.needed + ' queued for ranked · ' + c.playing + ' playing';
    }).catch(function () {});
  }, 4000);
  window.addEventListener('beforeunload', function () { socket.emit('leaveJoiner'); });
})();
