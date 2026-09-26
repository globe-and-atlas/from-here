// Test helpers: a tile loader that reads the built tiles from docs/tiles.
var fs = require('fs');
var path = require('path');
var tiles = require('../src/pkjs/tiles');

var TILE_DIR = path.join(__dirname, '..', '..', 'docs', 'tiles');

function fsLoader(key, callback) {
  fs.readFile(path.join(TILE_DIR, key + '.json'), 'utf8', function (err, text) {
    if (err) return callback(err);
    callback(null, JSON.parse(text));
  });
}

function cacheFor(keys, done) {
  var cache = new tiles.TileCache(fsLoader, 400);
  cache.ensure(keys, function (err) { done(err, cache); });
}

module.exports = { fsLoader: fsLoader, cacheFor: cacheFor, TILE_DIR: TILE_DIR };
