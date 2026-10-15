// BP.drawMapPreview(canvas, url): draws a map from its layout PNG (one pixel per
// tile, the community map format) in flat colours.
(function () {
  // map pixel colour -> preview colour
  var COLORS = {
    '787878': '#5b6170', '807040': '#5b6170', '408050': '#5b6170', '405080': '#5b6170', '804070': '#5b6170',
    'd4d4d4': '#2a2e37', 'ff0000': '#ff4d4d', '0000ff': '#4d7dff', 'ffff00': '#ffd23f', '00ff00': '#5cd65c',
    '373737': '#9aa0aa', 'b97a57': '#c08a5a', '007500': '#2f8f2f', 'ff8000': '#ff8c1a', 'dcbaba': '#5a3434',
    'bbb8dd': '#34405a', 'cac000': '#e0d040', 'ff7373': '#ff8080', '7373ff': '#8080ff', '808000': '#e8e050',
    'b90000': '#6a2020', '190094': '#20206a', 'ff8080': '#ff4d4d', '8080ff': '#4d7dff', '202020': '#7a50a0',
    'dcdcba': '#5a5a34', 'cc3300': '#e05030', '0066cc': '#3080e0',
  };
  var DIAG = { '807040': 1, '408050': 2, '405080': 3, '804070': 4 };
  var hex = function (n) { return (n < 16 ? '0' : '') + n.toString(16); };

  BP.drawMapPreview = function (canvas, url) {
    var img = new Image();
    img.onload = function () {
      var w = img.width, h = img.height;
      var src = document.createElement('canvas');
      src.width = w; src.height = h;
      var sc = src.getContext('2d');
      sc.drawImage(img, 0, 0);
      var d = sc.getImageData(0, 0, w, h).data;
      var s = Math.max(1, Math.floor(Math.min(canvas.width / w, canvas.height / h)));
      var ox = Math.floor((canvas.width - w * s) / 2), oy = Math.floor((canvas.height - h * s) / 2);
      var c = canvas.getContext('2d');
      c.clearRect(0, 0, canvas.width, canvas.height);
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var i = (y * w + x) * 4;
        if (!d[i + 3]) continue;
        var k = hex(d[i]) + hex(d[i + 1]) + hex(d[i + 2]);
        var col = COLORS[k];
        if (!col) continue;
        var px = ox + x * s, py = oy + y * s;
        if (DIAG[k]) {
          // diagonal wall: floor under it, wall in one half
          c.fillStyle = COLORS.d4d4d4; c.fillRect(px, py, s, s);
          c.fillStyle = col; c.beginPath();
          var t = DIAG[k];
          var pts = t === 1 ? [[0, 0], [0, 1], [1, 1]] : t === 2 ? [[0, 0], [1, 0], [0, 1]] : t === 3 ? [[0, 0], [1, 0], [1, 1]] : [[1, 0], [1, 1], [0, 1]];
          c.moveTo(px + pts[0][0] * s, py + pts[0][1] * s);
          c.lineTo(px + pts[1][0] * s, py + pts[1][1] * s);
          c.lineTo(px + pts[2][0] * s, py + pts[2][1] * s);
          c.fill();
          continue;
        }
        c.fillStyle = col;
        c.fillRect(px, py, s, s);
      }
    };
    img.src = url;
  };
})();
