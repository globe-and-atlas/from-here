// From Here, phone side: settings, home location, the day's timeline, and map frames on request.
var Clay = require('@rebble/clay');
var config = require('./config.json');
var keys = require('message_keys');
var route = require('./route');
var tiles = require('./tiles');
var timeline = require('./timeline');
var render = require('./render');
var frames = require('./frames');
var suggest = require('./suggest');
var dev = require('./dev.json'); // emulator-only test settings; {} in every real build

var PAGES = 'https://globe-and-atlas.github.io/from-here/';
var EMULATOR = 'http://localhost:8765/'; // python3 -m http.server 8765 --directory docs
var CHUNK = 1000; // frame bytes per AppMessage; watchface.c uses the same value
var AUTO = 8;
var DEV_HOME = { lat: 30.08, lon: -95.42 }; // emulator only, when it has no location

var clay = new Clay(config, null, { autoHandleEvents: false });
var state = { origin: null, direction: 1, zoom: 1, runs: [], overview: null, generation: 0, failedAt: 0 };
var RETRY_MS = 600000; // after a failed location or tile fetch, wait 10 minutes before trying again
var cache = new tiles.TileCache(loader, 80);

function isEmulator() {
  try { return /^qemu/.test(Pebble.getActiveWatchInfo().model); } catch (_) { return false; }
}

function base() { return isEmulator() ? EMULATOR : PAGES; }

function getJson(url, callback) {
  var req = new XMLHttpRequest();
  req.open('GET', url, true);
  req.timeout = 20000;
  req.onload = function () {
    if (req.status !== 200) { callback(new Error('HTTP ' + req.status + ' ' + url)); return; }
    var json;
    try { json = JSON.parse(req.responseText); } catch (e) { callback(e); return; }
    callback(null, json); // outside the try: an error in the caller must not trigger a second callback
  };
  req.onerror = function () { callback(new Error('network ' + url)); };
  req.ontimeout = function () { callback(new Error('timeout ' + url)); };
  req.send();
}

function loader(key, callback) { getJson(base() + 'tiles/' + key + '.json', callback); }

function settings() {
  var s;
  try { s = JSON.parse(localStorage.getItem('clay-settings')) || {}; } catch (_) { s = {}; }
  if (isEmulator() && dev.direction !== undefined) s.Setting_Direction = String(dev.direction);
  if (isEmulator() && dev.home) { s.Setting_UsePhone = false; s.Setting_Lat = String(dev.home[0]); s.Setting_Lon = String(dev.home[1]); }
  return s;
}

function stored(name) {
  try { return JSON.parse(localStorage.getItem(name)); } catch (_) { return null; }
}

// ---------------- messaging ----------------

var queue = [], sending = false;

function send(payload) {
  queue.push({ payload: payload, tries: 0 });
  pump();
}

function pump() {
  if (sending || !queue.length) return;
  sending = true;
  var item = queue[0];
  Pebble.sendAppMessage(item.payload, function () {
    queue.shift(); sending = false; pump();
  }, function () {
    item.tries += 1;
    if (item.tries >= 3) queue.shift();
    sending = false;
    setTimeout(pump, 500);
  });
}

function int16Bytes(values) {
  var out = [];
  values.forEach(function (v) { out.push(v & 0xff, (v >> 8) & 0xff); });
  return out;
}

function sendFrame(frame) {
  var dataParts = Math.max(1, Math.ceil(frame.data.length / CHUNK));
  var totalParts = 1 + dataParts;

  // Part 0: metadata only (keeps message well under 1.5 KB to avoid Bluetooth MTU drops)
  var metaMsg = {};
  metaMsg[keys.FrameZoom] = frame.zoom;
  metaMsg[keys.FramePart] = 0;
  metaMsg[keys.FrameParts] = totalParts;
  metaMsg[keys.FrameData] = [];
  metaMsg[keys.FrameKind] = frame.kind;
  metaMsg[keys.FrameW] = frame.w;
  metaMsg[keys.FrameH] = frame.h;
  metaMsg[keys.FrameValidTo] = frame.validTo;
  metaMsg[keys.FrameLand] = frame.landPct;
  metaMsg[keys.FrameRoute] = int16Bytes(frame.route);
  metaMsg[keys.FrameTowns] = frame.towns;
  metaMsg[keys.FrameCorner] = frame.corner;
  metaMsg[keys.FrameBase] = frame.base;
  send(metaMsg);

  // Parts 1..dataParts: 1000-byte data slices
  for (var part = 0; part < dataParts; part++) {
    var dataMsg = {};
    dataMsg[keys.FrameZoom] = frame.zoom;
    dataMsg[keys.FramePart] = part + 1;
    dataMsg[keys.FrameParts] = totalParts;
    dataMsg[keys.FrameData] = Array.prototype.slice.call(frame.data, part * CHUNK, (part + 1) * CHUNK);
    send(dataMsg);
  }
}

// Without tiles the watch still gets home and direction, so its coordinates keep moving.
function sendTimeline(withRuns) {
  var msg = {};
  msg[keys.OriginLat] = state.origin.lat;
  msg[keys.OriginLon] = state.origin.lon;
  msg[keys.Direction] = state.direction;
  msg[keys.DefaultZoom] = state.zoom;
  if (withRuns !== false) msg[keys.Timeline] = timeline.encode({ runs: state.runs });
  send(msg);
}

// ---------------- the day ----------------

function withOverview(done) {
  if (state.overview) { done(); return; }
  getJson(base() + 'overview.json', function (err, json) {
    if (err) { console.log('Overview unavailable: ' + err.message); done(); return; }
    state.overview = render.decodeOverview(json);
    done();
  });
}

function rebuild(origin) {
  var ticket = ++state.generation;
  var s = settings();
  var chosen = parseInt(s.Setting_Direction === undefined ? AUTO : s.Setting_Direction, 10);
  state.zoom = parseInt(s.Setting_Zoom === undefined ? 1 : s.Setting_Zoom, 10);
  state.origin = origin;
  withOverview(function () {
    if (ticket !== state.generation) return;
    state.direction = chosen === AUTO && state.overview ? suggest.best(state.overview, origin) : (chosen === AUTO ? 1 : chosen);
    cache.limit = 120;
    cache.ensure(timeline.keysForRoute(origin, state.direction), function (err) {
      if (ticket !== state.generation) return;
      localStorage.setItem('fh-origin', JSON.stringify(origin));
      if (err) {
        console.log('Tiles unavailable, sending home only: ' + err.message);
        state.runs = [];
        state.failedAt = Date.now();
        sendTimeline(false);
        return;
      }
      state.runs = timeline.build(cache, origin, state.direction).runs;
      state.failedAt = 0;
      sendTimeline();
    });
  });
}

function manualOrigin(s) {
  var lat = parseFloat(s.Setting_Lat), lon = parseFloat(s.Setting_Lon);
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return route.roundOrigin(lat, lon);
}

function refresh(force) {
  if (!force && Date.now() - state.failedAt < RETRY_MS) return;
  var s = settings();
  var usePhone = s.Setting_UsePhone === undefined ? true : !!s.Setting_UsePhone;
  var fallback = manualOrigin(s) || stored('fh-origin') || (isEmulator() ? route.roundOrigin(DEV_HOME.lat, DEV_HOME.lon) : null);
  if (!usePhone) { if (fallback) rebuild(fallback); else state.failedAt = Date.now(); return; }
  navigator.geolocation.getCurrentPosition(function (pos) {
    rebuild(route.roundOrigin(pos.coords.latitude, pos.coords.longitude));
  }, function () {
    if (fallback) rebuild(fallback); // without any home the watch shows the time only
    else state.failedAt = Date.now();
  }, { enableHighAccuracy: false, maximumAge: 3600000, timeout: 15000 });
}

function onRequest(payload) {
  if (payload[keys.ReqTimeline] !== undefined) {
    if (state.runs.length) sendTimeline(); else refresh(true);
    return;
  }
  if (payload[keys.ReqZoom] === undefined) return;
  if (!state.origin) {
    refresh(true);
    return;
  }
  var ctx = { cache: cache, overview: state.overview, origin: state.origin, direction: state.direction, runs: state.runs };
  var zoom = payload[keys.ReqZoom], minute = payload[keys.ReqMinute] || 0;
  if ((zoom === render.ZOOM.GLOBE || zoom === render.ZOOM.INSET) && !state.overview) {
    withOverview(function () { onRequest(payload); });
    return;
  }
  var ticket = state.generation;
  frames.build(ctx, zoom, minute, function (err, frame) {
    if (err) { console.log('Frame failed: ' + err.message); return; }
    if (ticket !== state.generation) return; // settings changed while drawing; the watch will ask again
    sendFrame(frame);
  });
}

Pebble.addEventListener('ready', function () { refresh(true); });
Pebble.addEventListener('appmessage', function (e) { onRequest(e.payload || {}); });
Pebble.addEventListener('showConfiguration', function () { Pebble.openURL(clay.generateUrl()); });
Pebble.addEventListener('webviewclosed', function (e) {
  if (!e || !e.response || e.response === 'CANCELLED') return;
  try { clay.getSettings(e.response); } catch (_) { return; }
  refresh(true);
});
setInterval(refresh, 6 * 3600000); // pick up a new home a few times a day
