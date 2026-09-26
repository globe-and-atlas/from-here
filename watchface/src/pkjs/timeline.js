// The day's place timeline: one label per minute, merged into runs. Same rules as the
// Python prototype: a town (pop >= 15k) within 25 km, else state/province, country, lake or sea.
var route = require('./route');
var tiles = require('./tiles');

var TOWN_KM = 25;
var MIN_RUN = 5;
var REGION_TOWN_ADMIN = { US: true, CA: true, AU: true, MX: true, BR: true };

// Tiles within reach of every minute, including neighbours when a town could be across an edge.
function keysForRoute(origin, direction) {
  var keys = {};
  for (var m = 0; m < 1440; m += 5) {
    var p = route.pointAt(origin, direction, m);
    var dLat = TOWN_KM / 110.6;
    var dLon = TOWN_KM / Math.max(20, 111.3 * Math.cos(p.lat * Math.PI / 180));
    [[0, 0], [dLat, dLon], [dLat, -dLon], [-dLat, dLon], [-dLat, -dLon]].forEach(function (o) {
      var lat = Math.max(-89.99, Math.min(89.99, p.lat + o[0]));
      var lon = p.lon + o[1];
      keys[tiles.tileKey(lat, ((lon + 540) % 360) - 180)] = true;
    });
  }
  return Object.keys(keys);
}

function labelAt(cache, lat, lon) {
  var place = cache.lookup(lat, lon);
  if (!place) return null;
  if (place.land) {
    var best = null, bestScore = -1;
    cache.townsNear(lat, lon, TOWN_KM).forEach(function (t) {
      var score = t.pop / (1 + t.km / 5); // bigger places win unless a smaller one is much closer
      if (score > bestScore) { best = t; bestScore = score; }
    });
    if (best) {
      var region = REGION_TOWN_ADMIN[best.cc] ? best.admin : place.country;
      if (place.country === 'United States of America') region = best.admin;
      return { label: region ? best.name + ', ' + region : best.name, land: true, town: best.name };
    }
  }
  return { label: place.label, land: place.land, town: '' };
}

function compress(minutes) {
  var runs = [];
  minutes.forEach(function (entry, m) {
    var last = runs[runs.length - 1];
    if (!last || last.label !== entry.label) runs.push({ minute: m, label: entry.label, land: entry.land, town: entry.town });
  });
  var changed = true;
  while (changed && runs.length > 1) {
    changed = false;
    for (var i = 0; i < runs.length; i++) {
      var end = i + 1 < runs.length ? runs[i + 1].minute : 1440;
      if (end - runs[i].minute < MIN_RUN) {
        runs.splice(i, 1);
        if (i === 0) runs[0].minute = 0;
        changed = true;
        break;
      }
    }
    var merged = [];
    runs.forEach(function (r) {
      var last = merged[merged.length - 1];
      if (last && last.label === r.label) return;
      merged.push(r);
    });
    runs = merged;
  }
  return runs;
}

// cache must already hold keysForRoute(origin, direction).
function build(cache, origin, direction) {
  var minutes = [];
  var landMinutes = 0;
  for (var m = 0; m < 1440; m++) {
    var p = route.pointAt(origin, direction, m);
    var entry = labelAt(cache, p.lat, p.lon) || { label: 'Open water', land: false, town: '' };
    if (entry.land) landMinutes += 1;
    minutes.push(entry);
  }
  var runs = compress(minutes);
  if (runs.length && runs[0].minute === 0) runs[0].minute = 1;
  runs.unshift({ minute: 0, label: 'Home', land: true, town: '' });
  return { runs: runs, landMinutes: landMinutes };
}

// Compact wire format for the watch: "minute|flags|label" per line; flags bit0 land, bit1 town.
function encode(timeline) {
  return timeline.runs.map(function (r) {
    return r.minute + '|' + ((r.land ? 1 : 0) | (r.town ? 2 : 0)) + '|' + r.label.substring(0, 40);
  }).join('\n');
}

module.exports = { keysForRoute: keysForRoute, labelAt: labelAt, compress: compress, build: build, encode: encode, TOWN_KM: TOWN_KM };
