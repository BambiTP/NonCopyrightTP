// admin.js - the admin panel: draws each map's thumbnail from its layout image.
BP.$$('canvas.map-thumb').forEach(function (c) { BP.drawMapPreview(c, c.getAttribute('data-src')); });
