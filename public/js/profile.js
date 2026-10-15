// profile.js - your profile card (server/pages.js profileCard): save the display name, pick a flair.
(function () {
  var form = document.querySelector('.profile form');
  var status = document.querySelector('.form-status');
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    BP.post('/profile', { displayedName: document.getElementById('displayedName').value }).then(function (r) {
      status.textContent = r.success ? 'Saved.' : (r.error || 'Could not save.');
      if (r.success) { document.querySelector('.profile h1').textContent = r.displayName; var b = document.getElementById('login-btn'); if (b) b.textContent = r.displayName; }
    });
  });
  document.addEventListener('click', function (e) {
    var item = e.target.closest('.flair-item');
    if (!item) return;
    var key = item.getAttribute('data-flair') || '';
    BP.post('/profile/selectedFlair', { flair: key }).then(function (r) {
      if (!r.success) return BP.toast(r.error || 'Could not change flair.');
      BP.$$('.flair-item').forEach(function (el) { el.classList.toggle('selected', el === item); });
      BP.toast(key ? 'Flair on.' : 'Flair off.');
    });
  });
})();
