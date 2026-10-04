const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../ext/node_modules/typescript');
const exportsObject = {};
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../ext/utils/sync-schedule.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(source, { exports: exportsObject });
const { sync_due, next_sync_time } = exportsObject;
const config = { endpoint: 'http://private.test', uuid: 'test', password: '', crypto_type: 'none', type: 'up', interval: 10 };
const timestamp = (day, hour, minute, second = 0) => new Date(2026, 9, day, hour, minute, second).getTime();

test('next upload preserves real alarm seconds instead of rounding to whole minutes', () => {
  const now = timestamp(1, 12, 3);
  const alarm = { scheduledTime: timestamp(1, 12, 3, 27), periodInMinutes: 1 };
  assert.equal(next_sync_time(config, alarm, now), timestamp(1, 12, 10, 27));
});

test('next schedule advances after an elapsed alarm without returning a past time', () => {
  const now = timestamp(1, 12, 11);
  assert.equal(next_sync_time(config, { scheduledTime: timestamp(1, 12, 3, 27), periodInMinutes: 1 }, now), timestamp(1, 12, 20, 27));
});

test('paused, incomplete and missing-alarm configurations do not promise an upload', () => {
  const now = timestamp(1, 12, 3);
  const alarm = { scheduledTime: now };
  for (const change of [{ type: 'pause' }, { uuid: '' }, { endpoint: '' }, { crypto_type: 'legacy', password: '' }, { interval: 'invalid' }]) {
    assert.equal(next_sync_time({ ...config, ...change }, alarm, now), null);
  }
  assert.equal(next_sync_time(config, undefined, now), null);
  assert.equal(next_sync_time({ ...config, interval: 1000000 }, alarm, now), null);
});

test('midnight and month rollover schedules agree with the background day-of-month rule', () => {
  const now = new Date(2026, 9, 31, 23, 58, 15).getTime();
  const next = next_sync_time({ ...config, interval: 7 }, { scheduledTime: now, periodInMinutes: 1 }, now);
  assert.equal(next, new Date(2026, 10, 1, 0, 2, 15).getTime());
  assert.equal(sync_due(new Date(next), 7), true);
});

test('download and legacy string intervals use the same actual clock schedule', () => {
  const now = timestamp(1, 12, 3);
  assert.equal(next_sync_time({ ...config, type: 'down', interval: '10' }, { scheduledTime: now, periodInMinutes: 1 }, now), timestamp(1, 12, 10));
  assert.equal(next_sync_time({ ...config, interval: 0 }, { scheduledTime: now + 15000, periodInMinutes: 1 }, now), now + 15000);
});
