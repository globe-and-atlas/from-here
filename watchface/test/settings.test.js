var test = require('node:test');
var assert = require('node:assert');
var config = require('../src/pkjs/config.json');
var pkg = require('../package.json');

function items(list) {
  return list.reduce(function (all, item) { return all.concat([item], item.items ? items(item.items) : []); }, []);
}

test('settings offer Auto plus the 8 directions', function () {
  var select = items(config).filter(function (i) { return i.messageKey === 'Setting_Direction'; })[0];
  assert.deepStrictEqual(select.options.map(function (o) { return o.value; }).sort(), ['0', '1', '2', '3', '4', '5', '6', '7', '8']);
  assert.strictEqual(select.defaultValue, '8');
});

test('settings offer phone location or manual coordinates', function () {
  var keys = items(config).map(function (i) { return i.messageKey; });
  ['Setting_UsePhone', 'Setting_Lat', 'Setting_Lon'].forEach(function (k) { assert.ok(keys.indexOf(k) >= 0, k); });
});

test('settings credit GeoNames under CC BY 4.0 and Natural Earth', function () {
  var text = items(config).map(function (i) { return i.defaultValue; }).join(' ');
  assert.ok(/GeoNames, CC BY 4\.0/.test(text));
  assert.ok(/Natural Earth/.test(text));
});

test('every settings key is a declared message key', function () {
  items(config).forEach(function (i) {
    if (i.messageKey) assert.ok(pkg.pebble.messageKeys.indexOf(i.messageKey) >= 0, i.messageKey);
  });
});
