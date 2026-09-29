// Phone apps disagree on how an incoming AppMessage is keyed: some use the numeric key, some the
// name from package.json, some both. Reading only the number made the phone ignore every map
// request on hardware, so the watch sat on "loading map..." with the timeline showing.
function field(payload, keys, name) {
  if (!payload) return undefined;
  var v = payload[keys[name]];
  if (v === undefined) v = payload[name];
  if (v === undefined) v = payload[String(keys[name])];
  return v;
}

module.exports = { field: field };
