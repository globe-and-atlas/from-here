// Map frames for the watch: a 2-bit palette image plus the route in screen coordinates and a few
// town labels. The watch only draws what it is sent (watchface.c), so all geography lives here.
var route = require('./route');
var tiles = require('./tiles');

var MAP_W = 200, MAP_H = 152;
var INSET = 44;
var ZOOM = { NOW: 0, HOUR: 1, DAY: 2, GLOBE: 3, INSET: 4 };
var KM_PER_PX = [1.2, 3.0];
var TOWN_RULES = [{ minPop: 15000, limit: 5 }, { minPop: 60000, limit: 4 }];
var KIND = { MAP: 0, GLOBE: 1 };
var OFFSCREEN = -32768;
// Palette indices. MAP: ocean, land, state line, country border. GLOBE: space, ocean, land, graticule.
var MAP_OCEAN = 0, MAP_LAND = 1, MAP_STATE = 2, MAP_BORDER = 3;
var G_SPACE = 0, G_OCEAN = 1, G_LAND = 2, G_GRID = 3;

function wrapDeg(d) { return ((d + 540) % 360) - 180; }

// Equirectangular around a centre, x scaled by cos(lat) so shapes keep their proportions.
function localProjection(center, kmPerPx, w, h) {
  var k = Math.cos(center.lat * Math.PI / 180);
  return {
    kind: KIND.MAP, w: w, h: h, center: center, kmPerPx: kmPerPx,
    xy: function (lat, lon) {
      return [w / 2 + wrapDeg(lon - center.lon) * 111.32 * k / kmPerPx, h / 2 - (lat - center.lat) * 110.57 / kmPerPx];
    },
    inverse: function (x, y) {
      var lat = center.lat - (y + 0.5 - h / 2) * kmPerPx / 110.57;
      var lon = center.lon + (x + 0.5 - w / 2) * kmPerPx / (111.32 * Math.max(k, 0.01));
      return [Math.max(-89.999, Math.min(89.999, lat)), wrapDeg(lon)];
    }
  };
}

function orthographic(center, radius, w, h) {
  var p0 = center.lat * Math.PI / 180, l0 = center.lon * Math.PI / 180;
  var sp0 = Math.sin(p0), cp0 = Math.cos(p0);
  var cx = w / 2, cy = h / 2;
  return {
    kind: KIND.GLOBE, w: w, h: h, center: center, radius: radius,
    xy: function (lat, lon) {
      var p = lat * Math.PI / 180, l = lon * Math.PI / 180;
      var cosc = sp0 * Math.sin(p) + cp0 * Math.cos(p) * Math.cos(l - l0);
      if (cosc < 0) return null;
      return [cx + radius * Math.cos(p) * Math.sin(l - l0), cy - radius * (cp0 * Math.sin(p) - sp0 * Math.cos(p) * Math.cos(l - l0))];
    },
    inverse: function (x, y) {
      var px = (x + 0.5 - cx) / radius, py = (cy - y - 0.5) / radius;
      var rho = Math.sqrt(px * px + py * py);
      if (rho > 1) return null;
      var c = Math.asin(rho);
      if (rho === 0) return [center.lat, center.lon];
      var lat = Math.asin(Math.cos(c) * sp0 + py * Math.sin(c) * cp0 / rho);
      var lon = l0 + Math.atan2(px * Math.sin(c), rho * cp0 * Math.cos(c) - py * sp0 * Math.sin(c));
      return [lat * 180 / Math.PI, wrapDeg(lon * 180 / Math.PI)];
    }
  };
}

// Tile keys a map frame needs. Each pixel row is one latitude with longitude linear across it, so
// list every 5-degree column between the row's ends (near the poles one row can span the globe).
function keysForFrame(projection) {
  var keys = {};
  var w = projection.w, h = projection.h;
  var k = Math.max(Math.cos(projection.center.lat * Math.PI / 180), 0.01);
  var halfSpan = (w / 2) * projection.kmPerPx / (111.32 * k);
  for (var y = 0; y <= h + 4; y += 5) {
    var lat = projection.inverse(0, Math.min(y, h - 1))[0];
    if (halfSpan >= 180) {
      for (var lon = -180; lon < 180; lon += tiles.TILE_DEG) keys[tiles.tileKey(lat, lon)] = true;
      continue;
    }
    var left = projection.center.lon - halfSpan, right = projection.center.lon + halfSpan;
    for (var c = Math.floor(left / tiles.TILE_DEG) * tiles.TILE_DEG; c <= right; c += tiles.TILE_DEG) {
      keys[tiles.tileKey(lat, wrapDeg(c + 0.001))] = true;
    }
  }
  return Object.keys(keys);
}

function renderMap(cache, projection) {
  var w = projection.w, h = projection.h;
  var pixels = new Uint8Array(w * h);
  var keys = new Array(w * h), countries = new Array(w * h), land = new Uint8Array(w * h);
  var landCount = 0;
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var ll = projection.inverse(x, y);
      var place = cache.lookup(ll[0], ll[1]);
      var i = y * w + x;
      keys[i] = place ? place.key : 'Open water|0';
      countries[i] = place ? place.country : '';
      land[i] = place && place.land ? 1 : 0;
      landCount += land[i];
    }
  }
  for (y = 0; y < h; y++) {
    for (x = 0; x < w; x++) {
      i = y * w + x;
      if (!land[i]) { pixels[i] = MAP_OCEAN; continue; }
      var value = MAP_LAND;
      var neighbours = [x > 0 ? i - 1 : -1, y > 0 ? i - w : -1];
      for (var n = 0; n < 2; n++) {
        var j = neighbours[n];
        if (j < 0 || !land[j] || keys[j] === keys[i]) continue;
        value = countries[j] !== countries[i] ? MAP_BORDER : Math.max(value, MAP_STATE);
      }
      pixels[i] = value;
    }
  }
  return { pixels: pixels, landFraction: landCount / (w * h) };
}

// overview: decoded {land: Uint8Array(180*360)} from docs/overview.json (1 degree, row 0 = 89..90N).
function decodeOverview(json) {
  var land = new Uint8Array(180 * 360);
  json.land.forEach(function (row, r) {
    var value = row[0], c = 0;
    for (var k = 1; k < row.length; k++) {
      for (var j = 0; j < row[k]; j++) land[r * 360 + c + j] = value;
      c += row[k];
      value = 1 - value;
    }
  });
  var towns = new Uint16Array(180 * 360);
  json.towns.forEach(function (t) { towns[t[0] * 360 + t[1]] = t[2]; });
  return { land: land, towns: towns };
}

function overviewAt(overview, lat, lon) {
  var r = Math.max(0, Math.min(179, Math.floor(90 - lat)));
  var c = Math.max(0, Math.min(359, Math.floor(lon + 180)));
  return r * 360 + c;
}

function renderGlobe(overview, projection) {
  var w = projection.w, h = projection.h;
  var pixels = new Uint8Array(w * h);
  var step = 30, tol = 0.9 * 180 / Math.PI / projection.radius; // ~1 px of graticule
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var ll = projection.inverse(x, y);
      var i = y * w + x;
      if (!ll) { pixels[i] = G_SPACE; continue; }
      var onGrid = Math.abs(ll[0] - Math.round(ll[0] / step) * step) < tol ||
        (Math.abs(ll[0]) < 80 && Math.abs(ll[1] - Math.round(ll[1] / step) * step) < tol / Math.max(0.2, Math.cos(ll[0] * Math.PI / 180)));
      pixels[i] = overview.land[overviewAt(overview, ll[0], ll[1])] ? G_LAND : (onGrid && projection.radius > 30 ? G_GRID : G_OCEAN);
    }
  }
  return { pixels: pixels, landFraction: 0 };
}

// Route samples every 5 minutes (289 points, minute 0..1440) as int16 pairs in frame pixels.
function routeSamples(origin, direction, projection) {
  var out = [];
  for (var m = 0; m <= 1440; m += 5) {
    var p = route.pointAt(origin, direction, m);
    var xy = projection.xy(p.lat, p.lon);
    if (!xy || Math.abs(xy[0]) > 30000 || Math.abs(xy[1]) > 30000) out.push(OFFSCREEN, OFFSCREEN);
    else out.push(Math.round(xy[0]), Math.round(xy[1]));
  }
  return out;
}

// Which corner the globe inset takes: away from where the route is heading.
function insetCorner(direction) {
  var step = route.STEPS[direction];
  return { right: step[1] < 0, bottom: step[0] < 0 };
}

function insetBox(direction) {
  var c = insetCorner(direction);
  var x = c.right ? MAP_W - INSET - 4 : 4, y = c.bottom ? MAP_H - INSET - 4 : 4;
  return [x - 2, y - 2, x + INSET + 2, y + INSET + 2];
}

// Areas labels must avoid: the globe inset, the dot, and the route line (5-minute samples).
function reservedBoxes(origin, direction, projection, minute) {
  var here = route.pointAt(origin, direction, minute);
  var dot = projection.xy(here.lat, here.lon);
  var boxes = [insetBox(direction), [dot[0] - 8, dot[1] - 8, dot[0] + 8, dot[1] + 8]];
  var samples = routeSamples(origin, direction, projection);
  for (var i = 0; i < samples.length; i += 2) {
    var x = samples[i], y = samples[i + 1];
    if (x > -20 && x < projection.w + 20 && y > -20 && y < projection.h + 20) boxes.push([x - 3, y - 3, x + 3, y + 3]);
  }
  return boxes;
}

function overlap(a, b) { return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]); }

// Up to limit towns inside the frame, biggest first, with no overlapping label boxes.
function frameTowns(cache, projection, zoom, etas, reserved) {
  var rule = TOWN_RULES[zoom];
  var candidates = [];
  var seen = {};
  keysForFrame(projection).forEach(function (key) {
    var tile = cache.get(key);
    if (!tile) return;
    tile.towns.forEach(function (t) {
      if (t[3] < rule.minPop || seen[t[0] + t[1]]) return;
      seen[t[0] + t[1]] = true;
      var xy = projection.xy(t[1], t[2]);
      if (xy[0] < 4 || xy[0] > projection.w - 4 || xy[1] < 6 || xy[1] > projection.h - 16) return;
      candidates.push({ name: t[0], pop: t[3], x: Math.round(xy[0]), y: Math.round(xy[1]) });
    });
  });
  candidates.sort(function (a, b) { return b.pop - a.pop; });
  var placed = reserved.slice(), out = [];
  for (var i = 0; i < candidates.length && out.length < rule.limit; i++) {
    var t = candidates[i];
    var eta = etas[t.name] === undefined ? -1 : etas[t.name];
    var text = t.name + (eta >= 0 ? ' ' + hhmm(eta) : '');
    var width = Math.ceil(text.length * 6.5) + 2;
    var left = t.x + 5 + width < projection.w - 2 ? t.x + 5 : t.x - 5 - width;
    var box = [left - 1, t.y - 9, left + width + 1, t.y + 8];
    if (left < 1 || placed.some(function (b) { return overlap(b, box); })) continue;
    placed.push(box);
    out.push({ x: t.x, y: t.y, left: left, text: text });
  }
  return out;
}

function hhmm(minute) {
  var h = Math.floor(minute / 60), m = minute % 60;
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

// Frame centre for Now/Hour: a little ahead of the dot, so it starts on the trailing side.
function localFrame(origin, direction, minute, zoom) {
  var kmPerPx = KM_PER_PX[zoom];
  var here = route.pointAt(origin, direction, minute);
  var next = route.pointAt(origin, direction, Math.min(1440, minute + 1));
  var speed = Math.max(0.3, tiles.haversine(here.lat, here.lon, next.lat, next.lon)); // km per minute
  var lead = Math.round(0.25 * MAP_W * kmPerPx / speed);
  var framed = centredFrame(origin, direction, minute, lead, kmPerPx);
  // Near a pole the lead can land over the top, leaving the dot off-frame: centre on the dot.
  if (framed.validTo === minute) framed = centredFrame(origin, direction, minute, 0, kmPerPx);
  return framed;
}

function centredFrame(origin, direction, minute, lead, kmPerPx) {
  var centre = route.pointAt(origin, direction, Math.min(1440, minute + lead));
  var projection = localProjection({ lat: centre.lat, lon: centre.lon }, kmPerPx, MAP_W, MAP_H);
  var validTo = minute;
  for (var m = minute + 1; m < 1440; m++) {
    var p = route.pointAt(origin, direction, m);
    var xy = projection.xy(p.lat, p.lon);
    if (xy[0] < 14 || xy[0] > MAP_W - 14 || xy[1] < 14 || xy[1] > MAP_H - 14) break;
    validTo = m;
  }
  return { projection: projection, validTo: validTo };
}

function dayFrame(origin, direction) {
  var lats = [], lons = [];
  for (var m = 0; m <= 1440; m += 10) {
    var p = route.pointAt(origin, direction, m);
    lats.push(p.lat);
    lons.push(wrapDeg(p.lon - origin.lon / 60));
  }
  var latMin = Math.min.apply(null, lats), latMax = Math.max.apply(null, lats);
  var lonMin = Math.min.apply(null, lons), lonMax = Math.max.apply(null, lons);
  var centre = { lat: (latMin + latMax) / 2, lon: wrapDeg(origin.lon / 60 + (lonMin + lonMax) / 2) };
  var k = Math.cos(centre.lat * Math.PI / 180);
  var kmPerPx = Math.max((latMax - latMin) * 110.57 / (MAP_H - 24), (lonMax - lonMin) * 111.32 * k / (MAP_W - 24), 1.5);
  return { projection: localProjection(centre, kmPerPx, MAP_W, MAP_H), validTo: 1439 };
}

// Pack palette indices 2 bits per pixel, leftmost pixel in the most significant bits.
function pack2bpp(pixels, w, h) {
  var stride = Math.ceil(w / 4);
  var out = new Uint8Array(stride * h);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      out[y * stride + (x >> 2)] |= (pixels[y * w + x] & 3) << (6 - 2 * (x & 3));
    }
  }
  return out;
}

module.exports = {
  MAP_W: MAP_W, MAP_H: MAP_H, INSET: INSET, ZOOM: ZOOM, KIND: KIND, OFFSCREEN: OFFSCREEN,
  localProjection: localProjection, orthographic: orthographic, keysForFrame: keysForFrame,
  renderMap: renderMap, renderGlobe: renderGlobe, decodeOverview: decodeOverview, overviewAt: overviewAt,
  routeSamples: routeSamples, insetCorner: insetCorner, insetBox: insetBox, frameTowns: frameTowns, reservedBoxes: reservedBoxes,
  localFrame: localFrame, dayFrame: dayFrame, pack2bpp: pack2bpp, hhmm: hhmm
};
