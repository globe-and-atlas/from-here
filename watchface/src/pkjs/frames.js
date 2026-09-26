// Builds any view the watch asks for: projection, tiles, image, route and town labels.
var route = require('./route');
var render = require('./render');

// ctx: {cache, overview, origin, direction, runs}; done(err, frame)
function build(ctx, zoom, minute, done) {
  var Z = render.ZOOM;
  var here = route.pointAt(ctx.origin, ctx.direction, minute);
  if (zoom === Z.GLOBE || zoom === Z.INSET) {
    var size = zoom === Z.INSET ? render.INSET : null;
    var w = size || render.MAP_W, h = size || render.MAP_H;
    var radius = zoom === Z.INSET ? size / 2 - 1 : 70;
    var projection = render.orthographic({ lat: here.lat, lon: here.lon }, radius, w, h);
    var image = render.renderGlobe(ctx.overview, projection);
    done(null, finish(ctx, zoom, projection, image, Math.min(1439, minute + 60), [], minute));
    return;
  }
  var framed = zoom === Z.DAY ? render.dayFrame(ctx.origin, ctx.direction) : render.localFrame(ctx.origin, ctx.direction, minute, zoom);
  var p = framed.projection;
  ctx.cache.ensure(render.keysForFrame(p), function (err) {
    if (err) { done(err); return; }
    var picture = render.renderMap(ctx.cache, p);
    var towns = [];
    if (zoom !== Z.DAY) {
      var etas = {};
      ctx.runs.forEach(function (r) { if (r.town && etas[r.town] === undefined) etas[r.town] = r.minute; });
      var reserved = render.reservedBoxes(ctx.origin, ctx.direction, p, minute);
      towns = render.frameTowns(ctx.cache, p, zoom, etas, reserved);
    }
    done(null, finish(ctx, zoom, p, picture, framed.validTo, towns, zoom === Z.DAY ? 0 : minute));
  });
}

function finish(ctx, zoom, projection, image, validTo, towns, minute) {
  return {
    zoom: zoom,
    base: minute, // the watch treats the frame as current from here to validTo
    kind: projection.kind,
    w: projection.w,
    h: projection.h,
    validTo: validTo,
    landPct: Math.round(image.landFraction * 100),
    data: render.pack2bpp(image.pixels, projection.w, projection.h),
    route: render.routeSamples(ctx.origin, ctx.direction, projection),
    towns: towns.map(function (t) { return t.x + '|' + t.y + '|' + t.left + '|' + t.text; }).join('\n'),
    corner: (function (c) { return (c.right ? 1 : 0) | (c.bottom ? 2 : 0); })(render.insetCorner(ctx.direction))
  };
}

module.exports = { build: build };
