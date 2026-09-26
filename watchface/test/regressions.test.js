// Regressions from the 2026-09-26 verifier pass.
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var route = require('../src/pkjs/route');
var render = require('../src/pkjs/render');
var frames = require('../src/pkjs/frames');
var tiles = require('../src/pkjs/tiles');
var timeline = require('../src/pkjs/timeline');
var helpers = require('./helpers');

var overview = render.decodeOverview(JSON.parse(fs.readFileSync(path.join(helpers.TILE_DIR, '..', 'overview.json'), 'utf8')));

function dayLand(limit, origin, direction, done) {
  var cache = new tiles.TileCache(helpers.fsLoader, limit);
  frames.build({ cache: cache, overview: overview, origin: origin, direction: direction, runs: [] }, render.ZOOM.DAY, 600, function (err, frame) {
    assert.ifError(err);
    done(frame.landPct);
  });
}

test('a Day frame needing more tiles than the cache limit is drawn complete', function (t, done) {
  var tromso = route.roundOrigin(69.65, 18.96);
  dayLand(40, tromso, 0, function (small) {
    dayLand(1000, tromso, 0, function (big) {
      assert.strictEqual(small, big, 'land ' + small + '% with a 40-tile cache vs ' + big + '% with 1000');
      done();
    });
  });
});

test('near a pole the dot stays on the Hour frame and the frame lasts', function () {
  var mcmurdo = route.roundOrigin(-77.8, 166.7);
  [690, 700, 710, 719, 730].forEach(function (minute) {
    var framed = render.localFrame(mcmurdo, 4, minute, render.ZOOM.HOUR);
    var here = route.pointAt(mcmurdo, 4, minute);
    var xy = framed.projection.xy(here.lat, here.lon);
    assert.ok(xy[0] >= 0 && xy[0] < 200 && xy[1] >= 0 && xy[1] < 152, 'dot on frame at ' + minute + ': ' + xy);
    assert.ok(framed.validTo > minute, 'frame lasts past ' + minute);
  });
});

test('a town names its own country', function (t, done) {
  helpers.cacheFor(['45_5', '45_0', '50_5', '40_5'], function (err, cache) {
    assert.ifError(err);
    var towns = cache.townsNear(49.47, 5.97, 5).filter(function (x) { return x.name === 'Esch-sur-Alzette'; });
    assert.strictEqual(towns[0].country, 'Luxembourg');
    var entry = timeline.labelAt(cache, 49.49, 5.98);
    if (entry.town === 'Esch-sur-Alzette') assert.ok(/Luxembourg$/.test(entry.label), entry.label);
    done();
  });
});

test('frames carry the minute they were drawn for', function (t, done) {
  var spring = route.roundOrigin(30.08, -95.42);
  helpers.cacheFor([], function (err, cache) {
    var ctx = { cache: cache, overview: overview, origin: spring, direction: 1, runs: [] };
    frames.build(ctx, render.ZOOM.HOUR, 1439, function (e1, hour) {
      assert.strictEqual(hour.base, 1439);
      frames.build(ctx, render.ZOOM.DAY, 700, function (e2, day) {
        assert.strictEqual(day.base, 0);
        assert.strictEqual(day.validTo, 1439);
        done();
      });
    });
  });
});

test('overlapping tile loads keep each other\'s tiles (per-request pins)', function (t, done) {
  var tromso = route.roundOrigin(69.65, 18.96);
  function slowLoader(key, cb) { setTimeout(function () { helpers.fsLoader(key, cb); }, 5 + (key.length * 7) % 20); }
  var alone = new tiles.TileCache(slowLoader, 5000); // reference: nothing is ever evicted
  frames.build({ cache: alone, overview: overview, origin: tromso, direction: 0, runs: [] }, render.ZOOM.DAY, 600, function (e1, reference) {
    var busy = new tiles.TileCache(slowLoader, 120);
    frames.build({ cache: busy, overview: overview, origin: tromso, direction: 0, runs: [] }, render.ZOOM.DAY, 600, function (e2, frame) {
      assert.strictEqual(frame.landPct, reference.landPct, 'Day frame land ' + frame.landPct + '% while another load ran vs ' + reference.landPct + '% alone');
      setTimeout(function () {
        assert.ok(busy.order.length <= 120 || Object.keys(busy.pins).length > 0, 'cache trims back to its limit once loads finish');
        done();
      }, 800);
    });
    setTimeout(function () { busy.ensure(timeline.keysForRoute(route.roundOrigin(-33.87, 151.21), 7), function () {}); }, 30);
  });
});
