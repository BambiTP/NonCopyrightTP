// groups.js - the public groups list and the create form.
(function () {
  if (!document.querySelector('.group-list .group-item')) document.getElementById('no-groups').style.display = '';
  var p2p = document.getElementById('create-p2p-group-btn');
  p2p.addEventListener('click', function (e) {
    var ok = confirm("Peer to peer: this group's games will run on a player's own PC, not the Chicago server. Whoever hosts can see and change anything in the game.\n\n"
      + 'Everyone who joins is warned and has to agree before they are sent to a game.\n\nCreate a peer-to-peer group?');
    if (!ok) e.preventDefault();
  });
})();
