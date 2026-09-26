// node --test watchface/test
var test = require('node:test');
var assert = require('node:assert');
var route = require('../src/pkjs/route');
var timeline = require('../src/pkjs/timeline');
var helpers = require('./helpers');

var SPRING = route.roundOrigin(30.08, -95.42);

test('pointAt adds H degrees M arcminutes along each of the 8 directions', function () {
  var origin = { lat: 600, lon: -1200 };
  route.STEPS.forEach(function (step, d) {
    [0, 1, 59, 60, 642, 1439].forEach(function (m) {
      var p = route.pointAt(origin, d, m);
      assert.strictEqual(p.latA, 600 + step[0] * m, route.DIRECTIONS[d] + ' lat at ' + m);
      assert.strictEqual(p.lonA, -1200 + step[1] * m, route.DIRECTIONS[d] + ' lon at ' + m);
    });
  });
});

test('a route over the North Pole comes down the far side', function () {
  var p = route.pointAt({ lat: 80 * 60, lon: 20 * 60 }, 0, 15 * 60); // 80N + 15 degrees
  assert.strictEqual(p.latA, 85 * 60);
  assert.strictEqual(p.lonA, -160 * 60);
  var q = route.pointAt({ lat: -80 * 60, lon: 0 }, 4, 12 * 60); // 80S - 12 degrees
  assert.strictEqual(q.latA, -88 * 60);
  assert.strictEqual(q.lonA, -180 * 60);
});

test('longitude wraps into [-180, 180)', function () {
  var p = route.pointAt({ lat: 0, lon: 170 * 60 }, 2, 20 * 60);
  assert.strictEqual(p.lonA, -170 * 60);
  var q = route.pointAt({ lat: 0, lon: -175 * 60 }, 6, 5 * 60);
  assert.strictEqual(q.lonA, -180 * 60);
  assert.strictEqual(route.wrapArcmin(180 * 60), -180 * 60);
});

test('origins round to 0.1 degree', function () {
  assert.deepStrictEqual(route.roundOrigin(30.08, -95.42), { lat: 1806, lon: -5724 });
  assert.strictEqual(route.formatCoord(2447, 'N', 'S'), "40°47'N");
});

test('compress merges runs under five minutes and keeps the first run at 00:00', function () {
  var minutes = [];
  for (var m = 0; m < 20; m++) minutes.push({ label: m < 3 ? 'A' : m < 5 ? 'B' : 'C', land: true, town: '' });
  for (m = 20; m < 1440; m++) minutes.push({ label: 'C', land: true, town: '' });
  var runs = timeline.compress(minutes);
  assert.strictEqual(runs[0].minute, 0);
  runs.forEach(function (r, i) {
    var end = i + 1 < runs.length ? runs[i + 1].minute : 1440;
    assert.ok(end - r.minute >= 5, r.label + ' lasts ' + (end - r.minute) + ' minutes');
  });
  assert.strictEqual(runs[runs.length - 1].label, 'C');
});

test('Spring TX heading NE names the prototype towns within 10 minutes', function (t, done) {
  var ne = 1;
  helpers.cacheFor(timeline.keysForRoute(SPRING, ne), function (err, cache) {
    assert.ifError(err);
    var day = timeline.build(cache, SPRING, ne);
    assert.strictEqual(day.runs[0].label, 'Home');
    assert.strictEqual(day.runs[0].minute, 0);
    var prototype = { Memphis: 306, Paducah: 407, Evansville: 463, Muncie: 595, Toledo: 694, Detroit: 728, 'North Bay': 961 };
    Object.keys(prototype).forEach(function (town) {
      var run = day.runs.filter(function (r) { return r.town === town; })[0];
      assert.ok(run, town + ' is in the timeline');
      assert.ok(Math.abs(run.minute - prototype[town]) <= 10, town + ' at ' + run.minute + ' vs prototype ' + prototype[town]);
    });
    day.runs.slice(1).forEach(function (r, i) {
      var end = i + 2 < day.runs.length ? day.runs[i + 2].minute : 1440;
      assert.ok(end - r.minute >= 5 || i === day.runs.length - 2, 'run ' + r.label + ' lasts at least 5 minutes');
    });
    done();
  });
});

test('the wire format carries minute, flags and label per line', function () {
  var text = timeline.encode({ runs: [{ minute: 0, label: 'Home', land: true, town: '' }, { minute: 306, label: 'Memphis, Tennessee', land: true, town: 'Memphis' }] });
  assert.strictEqual(text, '0|1|Home\n306|3|Memphis, Tennessee');
});
