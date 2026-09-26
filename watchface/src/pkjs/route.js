// Where the dot is: at clock time H:M it sits H degrees M arcminutes from home along a map
// direction. Integer arcminutes keep the phone and the watch (watchface.c) in exact agreement.
var DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
var STEPS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
var PRIVACY_ARCMIN = 6; // origins are rounded to 0.1 degree and never leave the phone

function roundOrigin(latDeg, lonDeg) {
  var lat = Math.round(latDeg * 60 / PRIVACY_ARCMIN) * PRIVACY_ARCMIN;
  var lon = Math.round(lonDeg * 60 / PRIVACY_ARCMIN) * PRIVACY_ARCMIN;
  return { lat: Math.max(-5400, Math.min(5400, lat)), lon: wrapArcmin(lon) };
}

function wrapArcmin(lon) {
  // [-10800, 10800): -180 inclusive, +180 wraps to -180.
  var w = ((lon + 10800) % 21600 + 21600) % 21600;
  return w - 10800;
}

// Past a pole the route comes down the far side, 180 degrees of longitude away.
function pointAt(origin, direction, minute) {
  var step = STEPS[direction];
  var lat = origin.lat + step[0] * minute;
  var lon = origin.lon + step[1] * minute;
  if (lat > 5400) { lat = 10800 - lat; lon += 10800; }
  else if (lat < -5400) { lat = -10800 - lat; lon += 10800; }
  lon = wrapArcmin(lon);
  return { latA: lat, lonA: lon, lat: lat / 60, lon: lon / 60 };
}

function formatCoord(arcmin, pos, neg) {
  var hemi = arcmin < 0 ? neg : pos;
  var a = Math.abs(arcmin);
  var deg = Math.floor(a / 60);
  var min = a % 60;
  return deg + '°' + (min < 10 ? '0' : '') + min + "'" + hemi;
}

module.exports = {
  DIRECTIONS: DIRECTIONS,
  STEPS: STEPS,
  roundOrigin: roundOrigin,
  wrapArcmin: wrapArcmin,
  pointAt: pointAt,
  formatCoord: formatCoord
};
