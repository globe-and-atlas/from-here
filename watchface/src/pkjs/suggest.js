// Which of the 8 directions gives the most interesting day from here? Scored from the 1 degree
// overview so no detailed tiles are needed: time over land, plus towns passed (capped per cell).
var route = require('./route');
var render = require('./render');

function score(overview, origin, direction) {
  var land = 0, towns = 0, seen = {};
  for (var m = 0; m < 1440; m += 10) {
    var p = route.pointAt(origin, direction, m);
    var cell = render.overviewAt(overview, p.lat, p.lon);
    if (overview.land[cell]) land += 1;
    if (!seen[cell]) {
      seen[cell] = true;
      towns += Math.min(overview.towns[cell], 6);
    }
  }
  return land / 144 * 100 + towns * 1.5;
}

function best(overview, origin) {
  var top = 0, topScore = -1;
  for (var d = 0; d < 8; d++) {
    var s = score(overview, origin, d);
    if (s > topScore) { top = d; topScore = s; }
  }
  return top;
}

module.exports = { score: score, best: best };
