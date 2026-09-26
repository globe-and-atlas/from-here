// Tile cache and place lookup. Tiles are 5x5 degrees with a 0.02 degree label raster
// (execution/build_tiles.py). Each tile decodes once into a Uint16Array of name ids.
var TILE_DEG = 5;

function tileKey(lat, lon) {
  var lat0 = Math.floor(lat / TILE_DEG) * TILE_DEG;
  var lon0 = Math.floor(lon / TILE_DEG) * TILE_DEG;
  if (lat0 >= 90) lat0 = 85;
  if (lat0 < -90) lat0 = -90;
  if (lon0 >= 180) lon0 -= 360;
  if (lon0 < -180) lon0 += 360;
  return lat0 + '_' + lon0;
}

function decode(tile) {
  var n = tile.n;
  var grid = new Uint16Array(n * n);
  if (tile.fill !== undefined) {
    for (var i = 0; i < grid.length; i++) grid[i] = tile.fill;
  } else {
    for (var r = 0; r < n; r++) {
      var row = tile.rows[r];
      var c = 0;
      for (var k = 0; k < row.length; k += 2) {
        var len = row[k], id = row[k + 1];
        for (var j = 0; j < len; j++) grid[r * n + c + j] = id;
        c += len;
      }
    }
  }
  tile.grid = grid;
  // Global ids let renders compare labels across tile edges.
  tile.keys = tile.names.map(function (entry) { return entry[0] + '|' + entry[1]; });
  return tile;
}

// loader(key, callback(err, tileJson)) is injected: XMLHttpRequest on the phone, fs in tests.
function TileCache(loader, limit) {
  this.loader = loader;
  this.limit = limit || 40;
  this.tiles = {};
  this.order = [];
}

TileCache.prototype.get = function (key) {
  return this.tiles[key] || null;
};

TileCache.prototype.ensure = function (keys, done) {
  var self = this;
  var pending = keys.filter(function (k, i) { return !self.tiles[k] && keys.indexOf(k) === i; });
  if (!pending.length) { done(null); return; }
  var left = pending.length, failed = null;
  pending.forEach(function (key) {
    self.loader(key, function (err, tile) {
      if (err) failed = failed || err;
      else self.put(key, decode(tile));
      left -= 1;
      if (left === 0) done(failed);
    });
  });
};

TileCache.prototype.put = function (key, tile) {
  this.tiles[key] = tile;
  this.order.push(key);
  while (this.order.length > this.limit) delete this.tiles[this.order.shift()];
};

// Returns {label, land, country, key} or null when the tile is not loaded.
TileCache.prototype.lookup = function (lat, lon) {
  var tile = this.tiles[tileKey(lat, lon)];
  if (!tile) return null;
  var n = tile.n, res = tile.deg / n;
  var r = Math.floor((tile.lat0 + tile.deg - lat) / res);
  var c = Math.floor((lon - tile.lon0) / res);
  // A latitude exactly on the southern edge computes row n; clamp into the tile.
  r = Math.max(0, Math.min(n - 1, r));
  c = Math.max(0, Math.min(n - 1, c));
  var id = tile.grid[r * n + c];
  var entry = tile.names[id];
  return {
    label: entry[0],
    land: entry[1] === 1,
    country: entry[2] >= 0 ? tile.countries[entry[2]] : '',
    key: tile.keys[id]
  };
};

// Towns (pop >= 15k) within km of a point, from loaded tiles around it.
TileCache.prototype.townsNear = function (lat, lon, km) {
  var found = [];
  var seen = {};
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      var key = tileKey(lat + dy * TILE_DEG, lon + dx * TILE_DEG);
      if (seen[key]) continue;
      seen[key] = true;
      var tile = this.tiles[key];
      if (!tile) continue;
      for (var i = 0; i < tile.towns.length; i++) {
        var t = tile.towns[i];
        var d = haversine(lat, lon, t[1], t[2]);
        if (d <= km) found.push({ name: t[0], lat: t[1], lon: t[2], pop: t[3], cc: t[4], admin: t[5], km: d });
      }
    }
  }
  return found;
};

function haversine(lat1, lon1, lat2, lon2) {
  var p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
  var dp = p2 - p1, dl = (lon2 - lon1) * Math.PI / 180;
  var a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

module.exports = { TILE_DEG: TILE_DEG, tileKey: tileKey, decode: decode, TileCache: TileCache, haversine: haversine };
