// home.js - queue counts on the Play cards, and the "back to your group" banner.
(function () {
  var banner = document.getElementById('back-to-group');
  var gid = banner && banner.getAttribute('data-group');
  if (gid && gid !== 'null') {
    document.getElementById('back-to-group-link').href = '/groups/' + gid;
    banner.style.display = '';
  }
  function counts(type, el) {
    fetch('/queue/status' + (type ? '?type=' + type : '')).then(function (r) { return r.json(); }).then(function (c) {
      document.getElementById(el).textContent = c.queued + ' of ' + c.needed + ' waiting · ' + c.playing + ' playing';
    }).catch(function () {});
  }
  function refresh() { counts('', 'queue-casual'); counts('ranked', 'queue-ranked'); }
  refresh();
  setInterval(refresh, 5000);
})();
