const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../ext/node_modules/typescript');

const exportsObject = {};
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../ext/utils/config-transfer.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(source, { exports: exportsObject, URL });
const { export_config, import_config } = exportsObject;
const plain = value => JSON.parse(JSON.stringify(value));
const config = {
  endpoint: 'http://192.168.1.100:8088', password: '测试-secret', interval: 10,
  domains: 'example.test\nother.test', uuid: 'my-uuid', type: 'pause', keep_live: 'https://example.test|60',
  with_storage: 1, blacklist: 'google.com', headers: 'Authorization: Bearer abc:def',
  expire_minutes: -1, crypto_type: 'none',
};

test('export and import preserve all settings, credentials, multiline text and long-term lifetime', () => {
  assert.deepEqual(plain(import_config(export_config(config))), config);
});

test('legacy raw configuration normalizes numeric strings and ignores unrelated fields', () => {
  const imported = import_config('\uFEFF' + JSON.stringify({ ...config, interval: '10', with_storage: '1', expire_minutes: '-1', cookie_data: { secret: 'not config' }, unknown: true }));
  assert.deepEqual(plain(imported), config);
});

test('invalid imports are rejected before returning a partial configuration', () => {
  for (const invalid of [
    '{broken', 'null', '[]', '{}',
    JSON.stringify({ format: 'CookieCloudConfig', version: 2, config }),
    JSON.stringify({ format: 'OtherApp', version: 1, config }),
    JSON.stringify({ ...config, interval: 0 }),
    JSON.stringify({ ...config, expire_minutes: -2 }),
    JSON.stringify({ ...config, with_storage: true }),
    JSON.stringify({ ...config, interval: 'NaN' }),
    JSON.stringify({ ...config, type: 'invalid' }),
    JSON.stringify({ ...config, crypto_type: 'invalid' }),
    JSON.stringify({ ...config, endpoint: 'javascript:alert(1)' }),
    JSON.stringify({ ...config, password: 123 }),
  ]) assert.throws(() => import_config(invalid));
});

test('partial config imports only provided fields; an incomplete draft can be exported and restored', () => {
  assert.deepEqual(plain(import_config('{"interval":"30"}')), { interval: 30 });
  const draft = { ...config, endpoint: '', uuid: '', password: '', expire_minutes: 0 };
  assert.deepEqual(plain(import_config(export_config(draft))), draft);
});

test('untrusted object keys never enter the imported configuration', () => {
  const imported = import_config('{"uuid":"test","__proto__":{"polluted":true},"constructor":{}}');
  assert.deepEqual(Object.keys(imported), ['uuid']);
  assert.equal(imported.polluted, undefined);
});
