var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var route = require('../src/pkjs/route');
var render = require('../src/pkjs/render');
var frames = require('../src/pkjs/frames');
var timeline = require('../src/pkjs/timeline');
var suggest = require('../src/pkjs/suggest');
var helpers = require('./helpers');

var SPRING = route.roundOrigin(30.08, -95.42);
var NE = 1;
var overview = render.decodeOverview(JSON.parse(fs.readFileSync(path.join(helpers.TILE_DIR, '..', 'overview.json'), 'utf8')));

function context(done) {
  helpers.cacheFor(timeline.keysForRoute(SPRING, NE), function (err, cache) {
    assert.ifError(err);
    var day = timeline.build(cache, SPRING, NE);
    done({ cache: cache, overview: overview, origin: SPRING, direction: NE, runs: day.runs });
  });
}

function boxOf(t) {
  var width = Math.ceil(t.text.length * 6.5) + 2;
  return [t.left - 1, t.y - 9, t.left + width + 1, t.y + 8];
}

test('frames pack to 2 bits per pixel: 200 x 152 is 7,600 bytes', function (t, done) {
  context(function (ctx) {
    frames.build(ctx, render.ZOOM.HOUR, 642, function (err, frame) {
      assert.ifError(err);
      assert.strictEqual(frame.data.length, 7600);
      assert.strictEqual(frame.route.length, 289 * 2);
      done();
    });
  });
});

test('packing puts the leftmost pixel in the most significant bits', function () {
  var packed = render.pack2bpp(new Uint8Array([3, 0, 1, 2]), 4, 1);
  assert.strictEqual(packed[0], 0xC6); // 11 00 01 10
});

test('town labels never overlap each other, the inset or the dot', function (t, done) {
  context(function (ctx) {
    var zooms = [render.ZOOM.NOW, render.ZOOM.HOUR];
    var minutes = [60, 300, 420, 642, 730, 870, 960];
    var pending = zooms.length * minutes.length;
    zooms.forEach(function (zoom) {
      minutes.forEach(function (minute) {
        var framed = render.localFrame(SPRING, NE, minute, zoom);
        ctx.cache.ensure(render.keysForFrame(framed.projection), function (err) {
          assert.ifError(err);
          var here = route.pointAt(SPRING, NE, minute);
          var dot = framed.projection.xy(here.lat, here.lon);
          var reserved = [render.insetBox(NE), [dot[0] - 8, dot[1] - 8, dot[0] + 8, dot[1] + 8]];
          var towns = render.frameTowns(ctx.cache, framed.projection, zoom, {}, reserved);
          var boxes = towns.map(boxOf);
          boxes.forEach(function (a, i) {
            reserved.forEach(function (r) { assert.ok(a[2] < r[0] || a[0] > r[2] || a[3] < r[1] || a[1] > r[3], 'label clears reserved box'); });
            boxes.slice(i + 1).forEach(function (b) { assert.ok(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3], 'labels do not overlap'); });
          });
          pending -= 1;
          if (pending === 0) done();
        });
      });
    });
  });
});

test('the dot stays inside Now and Hour frames until validTo', function () {
  [render.ZOOM.NOW, render.ZOOM.HOUR].forEach(function (zoom) {
    [0, 300, 642, 1200].forEach(function (minute) {
      var framed = render.localFrame(SPRING, NE, minute, zoom);
      assert.ok(framed.validTo > minute, 'frame lasts past ' + minute);
      for (var m = minute; m <= framed.validTo; m++) {
        var p = route.pointAt(SPRING, NE, m);
        var xy = framed.projection.xy(p.lat, p.lon);
        assert.ok(xy[0] >= 0 && xy[0] < 200 && xy[1] >= 0 && xy[1] < 152, 'dot on screen at ' + m);
      }
    });
  });
});

test('globe and inset frames render for a polar route', function (t, done) {
  var tromso = route.roundOrigin(69.65, 18.96);
  var ctx = { cache: null, overview: overview, origin: tromso, direction: 0, runs: [] };
  frames.build(ctx, render.ZOOM.GLOBE, 1300, function (err, frame) {
    assert.ifError(err);
    assert.strictEqual(frame.kind, render.KIND.GLOBE);
    assert.strictEqual(frame.data.length, 7600);
    frames.build(ctx, render.ZOOM.INSET, 1300, function (err2, inset) {
      assert.ifError(err2);
      assert.strictEqual(inset.w, 44);
      assert.strictEqual(inset.data.length, 11 * 44);
      done();
    });
  });
});

test('Auto suggests NE for Spring TX', function () {
  assert.strictEqual(suggest.best(overview, SPRING), NE);
});

// Writes the land mask of the Spring NE Hour frame at 10:42 for tests/test_golden_frame.py.
test('dump golden Hour frame land mask', function (t, done) {
  context(function (ctx) {
    var framed = render.localFrame(SPRING, NE, 642, render.ZOOM.HOUR);
    ctx.cache.ensure(render.keysForFrame(framed.projection), function () {
      var picture = render.renderMap(ctx.cache, framed.projection);
      var p = framed.projection;
      var out = { center: p.center, kmPerPx: p.kmPerPx, w: p.w, h: p.h, land: Array.prototype.map.call(picture.pixels, function (v) { return v === 0 ? 0 : 1; }) };
      fs.writeFileSync(path.join(__dirname, '..', '..', '.tmp', 'golden_hour_frame.json'), JSON.stringify(out));
      done();
    });
  });
});
