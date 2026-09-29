// Hardware regression 2026-09-29: requests keyed by name were ignored, so the map never loaded.
var test = require('node:test');
var assert = require('node:assert');
var field = require('../src/pkjs/payload').field;

var keys = { ReqZoom: 10018, ReqMinute: 10019, ReqTimeline: 10020 };

test('request fields read by numeric key', function () {
  var p = {}; p[10018] = 1; p[10019] = 600;
  assert.strictEqual(field(p, keys, 'ReqZoom'), 1);
  assert.strictEqual(field(p, keys, 'ReqMinute'), 600);
});

test('request fields read by name', function () {
  var p = { ReqZoom: 0, ReqMinute: 725 };
  assert.strictEqual(field(p, keys, 'ReqZoom'), 0); // zoom 0 (Now) must not read as missing
  assert.strictEqual(field(p, keys, 'ReqMinute'), 725);
  assert.strictEqual(field(p, keys, 'ReqTimeline'), undefined);
});

test('missing payload reads as undefined', function () {
  assert.strictEqual(field(undefined, keys, 'ReqZoom'), undefined);
});
