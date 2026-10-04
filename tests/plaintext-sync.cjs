// Run after installing ext dependencies: node --test tests/plaintext-sync.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../ext/node_modules/typescript');
const CryptoJS = require('../ext/node_modules/crypto-js');
const { gzip, ungzip } = require('../ext/node_modules/pako');

const root = path.resolve(__dirname, '..');
const cookie = { name: 'session', value: '秘密', domain: 'example.test', path: '/', secure: false, httpOnly: true, sameSite: 'lax' };
const quiet = { log() {}, error() {}, warn() {}, info() {} };

function server(file) {
  const routes = {};
  const files = new Map();
  const app = { use() {}, get(url, handler) { routes[url] = handler; }, post(url, handler) { routes[url] = handler; }, all(url, handler) { routes[url] = handler; }, listen() {} };
  const fakeFs = { existsSync: key => files.has(key), mkdirSync() {}, writeFileSync: (key, value) => files.set(key, value), readFileSync: key => Buffer.from(files.get(key)), readdirSync: dir => [...files.keys()].filter(key => path.dirname(key) === dir).map(key => ({ name: path.basename(key), isFile: () => true })) };
  const dependencies = {
    express: () => app, path, fs: fakeFs, 'crypto-js': CryptoJS,
    './utils/logger': quiet, cors: () => () => {}, compression: () => () => {},
    multer: () => ({ array: () => () => {} }),
    'body-parser': { json: () => () => {}, urlencoded: () => () => {} },
    'express-rate-limit': () => () => {},
  };
  const context = { require: name => { if (!(name in dependencies)) throw new Error(name); return dependencies[name]; }, __dirname: path.dirname(file), process: { env: {}, on() {} }, console: quiet, Buffer };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context);
  function request(url, body = {}, query = {}) {
    let result;
    let status = 200;
    const res = { set() {}, json(value) { result = JSON.parse(JSON.stringify(value)); }, send(value) { result = value; }, status(code) { status = code; return res; } };
    routes[url]({ body, query, params: { uuid: 'test-user' } }, res);
    if (status >= 400) throw new Error(`HTTP ${status}`);
    return result;
  }
  return { request, files, context };
}

function extension(fetch, hooks = {}) {
  const local = { 'LS-example.test': JSON.stringify({ token: 'local-secret' }) };
  const restored = [];
  const exports = {};
  const browser = {
    storage: { local: { async get(key) { return key === null ? local : { [key]: local[key] }; }, async set(values) { Object.assign(local, values); } } },
    cookies: { async getAll() { return hooks.getAll ? hooks.getAll() : [cookie]; }, async set(value) { restored.push(value); const saved = hooks.set ? await hooks.set(value) : undefined; return saved || { ...value, domain: value.domain || new URL(value.url).hostname, hostOnly: !value.domain }; } },
    action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
  };
  const source = ts.transpileModule(fs.readFileSync(path.join(root, 'ext/utils/functions.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { exports, require: name => name === 'crypto-js' ? CryptoJS : { gzip }, browser, fetch, console: quiet, alert() {}, setTimeout() {}, navigator: { userAgent: 'Chrome' } });
  return { exports, local, restored };
}

test('edit server value, mirror the host-only HttpOnly cookie locally, then manually upload the edited value', async () => {
  const api = server(path.join(root, 'api/app.js'));
  const session = { ...cookie, name: '_gitlab_session', domain: 'gitlab.cmss.com', hostOnly: true, httpOnly: true, sameSite: 'unspecified', storeId: '0', expirationDate: Date.now() / 1000 + 3600 };
  api.request('/update', { uuid: 'test-user', crypto_type: 'none', encrypted: JSON.stringify({ cookie_data: { 'gitlab.cmss.com': [session] } }) });
  let localCookie = { ...session };
  const ext = extension(async (url, options) => {
    if (url.endsWith('/records')) return { ok: true, json: async () => api.request('/records') };
    if (url.includes('/get/')) return { ok: true, json: async () => api.request('/get/:uuid') };
    const payload = typeof options.body === 'string' ? JSON.parse(options.body) : JSON.parse(ungzip(options.body, { to: 'string' }));
    return { ok: true, json: async () => api.request('/update', payload) };
  }, {
    getAll() { return [localCookie]; },
    set(details) {
      localCookie = { ...details, domain: details.domain ? '.' + details.domain.replace(/^\./, '') : new URL(details.url).hostname, hostOnly: !details.domain };
      return localCookie;
    },
  });
  const config = { uuid: 'test-user', endpoint: 'http://private.test', password: '', crypto_type: 'none', domains: 'gitlab.cmss.com' };
  const [record] = await ext.exports.query_uploaded_cookies(config.endpoint, '');
  const edited = await ext.exports.update_uploaded_cookie(config.endpoint, '', '', record, 'gitlab.cmss.com', 0, 'edited-session');
  await ext.exports.apply_browser_cookie_value(edited.data.cookie_data['gitlab.cmss.com'][0], 'edited-session');
  assert.equal(localCookie.domain, 'gitlab.cmss.com');
  assert.equal(localCookie.hostOnly, true);
  assert.equal(localCookie.httpOnly, true);
  assert.equal(localCookie.storeId, '0');
  await ext.exports.upload_cookie(config);
  const [afterUpload] = await ext.exports.query_uploaded_cookies(config.endpoint, '');
  assert.equal(afterUpload.data.cookie_data['gitlab.cmss.com'].length, 1);
  assert.equal(afterUpload.data.cookie_data['gitlab.cmss.com'][0].value, 'edited-session');
  assert.equal(afterUpload.data.cookie_data['gitlab.cmss.com'][0].domain, 'gitlab.cmss.com');
});

for (const hostOnly of [true, false, undefined]) {
  test(`edit/upload/download/upload preserves a bare GitLab hostname with hostOnly=${hostOnly}`, async () => {
    const api = server(path.join(root, 'api/app.js'));
    const session = { ...cookie, domain: 'gitlab.cmss.com', name: '_gitlab_session', hostOnly };
    api.request('/update', { uuid: 'test-user', crypto_type: 'none', encrypted: JSON.stringify({ cookie_data: { 'gitlab.cmss.com': [session] }, local_storage_data: {} }) });
    const browserCookies = new Map();
    const ext = extension(async (url, options) => {
      if (url.endsWith('/records')) return { ok: true, json: async () => api.request('/records') };
      if (url.includes('/get/')) return { ok: true, json: async () => api.request('/get/:uuid') };
      const body = typeof options.body === 'string' ? JSON.parse(options.body) : JSON.parse(ungzip(options.body, { to: 'string' }));
      return { ok: true, json: async () => api.request('/update', body) };
    }, {
      set(details) {
        // Model Chrome: supplying domain creates a leading-dot domain cookie;
        // omitting domain creates a host-only cookie from the URL hostname.
        const domain = details.domain ? '.' + details.domain.replace(/^\./, '') : new URL(details.url).hostname;
        browserCookies.set(domain + ':' + details.name + ':' + details.path, { ...details, domain, hostOnly: !details.domain });
      },
      getAll() { return [...browserCookies.values()]; },
    });
    const config = { uuid: 'test-user', password: '', endpoint: 'http://private.test', crypto_type: 'none', domains: 'gitlab.cmss.com' };
    const [record] = await ext.exports.query_uploaded_cookies(config.endpoint, '');
    const edited = await ext.exports.update_uploaded_cookie(config.endpoint, '', '', record, 'gitlab.cmss.com', 0, 'edited-session');
    assert.equal(edited.data.cookie_data['gitlab.cmss.com'][0].domain, 'gitlab.cmss.com');
    assert.equal(edited.data.cookie_data['gitlab.cmss.com'][0].hostOnly, true);
    for (let round = 0; round < 2; round++) {
      assert.equal((await ext.exports.download_cookie(config)).action, 'done');
      assert.equal((await ext.exports.upload_cookie(config)).action, 'done');
    }
    const [final] = await ext.exports.query_uploaded_cookies(config.endpoint, '');
    const cookies = final.data.cookie_data['gitlab.cmss.com'];
    assert.equal(cookies.length, 1);
    assert.equal(cookies[0].domain, 'gitlab.cmss.com');
    assert.equal(cookies[0].hostOnly, true);
    assert.equal(cookies[0].value, 'edited-session');
    assert.equal(browserCookies.size, 1);
    assert.ok(ext.restored.every(details => details.domain === undefined));
  });
}

for (const file of ['api/app.js', 'docker/app.js']) {
  test(`${file}: plaintext upload, storage and cookie/LocalStorage restoration without a password`, async () => {
    const api = server(path.join(root, file));
    let uploaded;
    const ext = extension(async (url, options) => {
      if (url.endsWith('/update')) {
        uploaded = JSON.parse(ungzip(options.body, { to: 'string' }));
        return { json: async () => api.request('/update', uploaded) };
      }
      return { json: async () => api.request('/get/:uuid') };
    });
    const config = { uuid: 'test-user', password: '', endpoint: 'http://private.test', crypto_type: 'none', domains: 'example.test', with_storage: 1 };
    assert.equal((await ext.exports.upload_cookie(config)).action, 'done');
    assert.equal(uploaded.crypto_type, 'none');
    const plaintext = JSON.parse(uploaded.encrypted);
    assert.equal(plaintext.cookie_data['example.test'][0].value, cookie.value);
    assert.equal(plaintext.local_storage_data['example.test'].token, 'local-secret');
    assert.equal(JSON.parse([...api.files.values()][0]).encrypted, uploaded.encrypted);
    assert.deepEqual(api.request('/get/:uuid', { password: 'ignored' }, { crypto_type: 'legacy' }), plaintext);
    delete ext.local['LS-example.test'];
    // A stored plaintext marker must also override a stale local algorithm setting.
    assert.equal((await ext.exports.download_cookie({ ...config, crypto_type: 'legacy' })).action, 'done');
    assert.equal(ext.restored[0].value, cookie.value);
    assert.equal(JSON.parse(ext.local['LS-example.test']).token, 'local-secret');
  });
}

for (const file of ['api/app.js', 'docker/app.js']) {
  test(`${file}: bulk cleanup clears cookies across UUIDs and preserves storage, encryption and unreadable records`, async () => {
    const api = server(path.join(root, file));
    const encrypt = server(path.join(root, 'api/app.js')).context.cookie_encrypt;
    const original = { cookie_data: { 'example.test': [cookie] }, local_storage_data: { 'example.test': { token: 'keep' } }, extra_field: 'keep-extra' };
    for (const mode of ['none', 'legacy', 'aes-128-cbc-fixed']) {
      api.request('/update', { uuid: mode, crypto_type: mode, encrypted: encrypt(mode, original, 'secret', mode) });
    }
    api.request('/update', { uuid: 'other-password', crypto_type: 'legacy', encrypted: encrypt('other-password', original, 'other', 'legacy') });
    const directory = path.join(root, path.dirname(file), 'data');
    const otherPath = path.join(directory, 'other-password.json');
    const otherBefore = api.files.get(otherPath);
    api.files.set(path.join(directory, 'broken.json'), '{broken');
    api.files.set(path.join(directory, 'unrelated.txt'), 'leave-alone');
    assert.throws(() => api.request('/records/clear-cookies', { password: 'secret' }), /HTTP 400/);
    assert.equal(JSON.parse(api.files.get(path.join(directory, 'none.json'))).encrypted, JSON.stringify(original));
    const ext = extension(async (url, options) => {
      assert.equal(url, 'http://private.test/records/clear-cookies');
      assert.equal(options.headers.Authorization, 'Bearer test');
      const result = api.request('/records/clear-cookies', JSON.parse(options.body));
      return { ok: true, json: async () => result };
    });
    const result = await ext.exports.clear_uploaded_cookies('http://private.test/', 'secret', 'Authorization: Bearer test');
    assert.equal(result.cleared_uuids, 3);
    assert.equal(result.deleted_cookies, 3);
    assert.deepEqual(result.skipped.map(item => item.uuid).sort(), ['broken', 'other-password']);
    for (const mode of ['none', 'legacy', 'aes-128-cbc-fixed']) {
      const stored = JSON.parse(api.files.get(path.join(directory, mode + '.json')));
      assert.equal(stored.crypto_type, mode);
      const data = api.context.cookie_decrypt(mode, stored.encrypted, 'secret', mode);
      assert.equal(Object.keys(data.cookie_data).length, 0);
      assert.equal(data.local_storage_data['example.test'].token, 'keep');
      assert.equal(data.extra_field, 'keep-extra');
    }
    assert.equal(api.files.get(otherPath), otherBefore);
    assert.equal(api.files.get(path.join(directory, 'broken.json')), '{broken');
    assert.equal(api.files.get(path.join(directory, 'unrelated.txt')), 'leave-alone');
    assert.equal(ext.restored.length, 0);
    const repeated = api.request('/records/clear-cookies', { confirm: 'clear-all-cookies', password: 'secret' });
    assert.equal(repeated.cleared_uuids, 0);
    assert.equal(repeated.deleted_cookies, 0);
  });
}

for (const mode of ['none', 'legacy', 'aes-128-cbc-fixed']) {
  test(`${mode}: delete only the selected cookie scope, merge latest data and protect changed values`, async () => {
    const api = server(path.join(root, 'api/app.js'));
    const target = { ...cookie, hostOnly: true };
    const domain = { ...cookie, domain: '.example.test', hostOnly: false, value: 'domain-session' };
    const otherPath = { ...target, path: '/other', value: 'path-session' };
    const partitioned = { ...target, partitionKey: { topLevelSite: 'https://other.test' }, value: 'partition-session' };
    const original = { cookie_data: { 'example.test': [target, domain, otherPath, partitioned], 'overlapping-filter': [target] }, local_storage_data: { token: 'keep-storage' } };
    const store = data => api.request('/update', { uuid: 'test-user', crypto_type: mode, encrypted: api.context.cookie_encrypt('test-user', data, 'secret', mode) });
    store(original);
    let posts = 0;
    const ext = extension(async (url, options) => {
      if (url.endsWith('/records')) return { ok: true, json: async () => api.request('/records') };
      if (url.includes('/get/')) return { ok: true, json: async () => api.request('/get/:uuid') };
      posts++;
      const result = api.request('/update', JSON.parse(options.body));
      return { ok: true, json: async () => result };
    });
    const [record] = await ext.exports.query_uploaded_cookies('http://private.test', 'secret');
    store({ ...original, local_storage_data: { token: 'new-storage' } });
    const deleted = await ext.exports.delete_uploaded_cookie('http://private.test', 'secret', '', record, 'example.test', 0);
    assert.equal(deleted.data.cookie_data['example.test'].length, 3);
    assert.equal(deleted.data.cookie_data['example.test'][0].value, 'domain-session');
    assert.equal(deleted.data.cookie_data['example.test'][1].value, 'path-session');
    assert.equal(deleted.data.cookie_data['example.test'][2].value, 'partition-session');
    assert.equal(deleted.data.cookie_data['overlapping-filter'].length, 0);
    assert.equal(deleted.data.local_storage_data.token, 'new-storage');
    assert.equal(record.data.cookie_data['example.test'].length, 4);
    assert.equal(ext.restored.length, 0);
    assert.equal(posts, 1);
    if (mode !== 'none') assert.throws(() => JSON.parse(deleted.source_encrypted));
    // Repeating deletion after it was already applied is harmless.
    await ext.exports.delete_uploaded_cookie('http://private.test', 'secret', '', record, 'example.test', 0);
    assert.equal(posts, 1);
    const changed = JSON.parse(JSON.stringify(original));
    changed.cookie_data['example.test'][0].value = 'changed-session';
    store(changed);
    await assert.rejects(ext.exports.delete_uploaded_cookie('http://private.test', 'secret', '', record, 'example.test', 0), /目标 Cookie 的值已被/);
    assert.equal(posts, 1);
  });
}

test('restoring host-only cookies does not create domain cookies; domain and partition scopes stay distinct', async () => {
  const host = { ...cookie, hostOnly: true };
  const domain = { ...cookie, domain: '.example.test', hostOnly: false, value: 'domain-value' };
  const partitioned = { ...host, name: 'partitioned', partitionKey: { topLevelSite: 'https://other.test', hasCrossSiteAncestor: true } };
  const ext = extension(async () => ({ json: async () => ({ crypto_type: 'none', encrypted: JSON.stringify({ cookie_data: { 'example.test': [host, domain, partitioned] } }) }) }));
  const config = { uuid: 'test', password: '', endpoint: 'http://private.test' };
  assert.equal((await ext.exports.download_cookie(config)).action, 'done');
  assert.equal(ext.restored[0].domain, undefined);
  assert.equal(ext.restored[0].url, 'http://example.test/');
  assert.equal(ext.restored[1].domain, '.example.test');
  assert.equal(ext.restored[2].partitionKey.topLevelSite, 'https://other.test');
  await ext.exports.download_cookie(config);
  assert.equal(ext.restored[3].domain, undefined);
  assert.equal(ext.restored[4].domain, '.example.test');
});

for (const mode of ['none', 'legacy', 'aes-128-cbc-fixed']) {
  test(`${mode}: merge unrelated automatic uploads and retry concurrent writes without replacing another path`, async () => {
    const api = server(path.join(root, 'api/app.js'));
    const original = { cookie_data: { 'example.test': [{ ...cookie, hostOnly: true }, { ...cookie, path: '/other', value: 'old-other' }] }, local_storage_data: { token: 'old' } };
    const store = data => api.request('/update', { uuid: 'test-user', crypto_type: mode, encrypted: api.context.cookie_encrypt('test-user', data, 'secret', mode) });
    store(original);
    let racing = false;
    let updates = 0;
    const ext = extension(async (url, options) => {
      if (url.endsWith('/records')) return { ok: true, json: async () => api.request('/records') };
      if (url.includes('/get/')) return { ok: true, json: async () => api.request('/get/:uuid') };
      updates++;
      if (racing) {
        racing = false;
        store({ cookie_data: { 'example.test': [{ ...cookie, path: '/other', value: 'racing-other' }, { ...cookie, hostOnly: true }] }, local_storage_data: { token: 'racing-storage' } });
      }
      try { const result = api.request('/update', JSON.parse(options.body)); return { ok: true, json: async () => result }; }
      catch (error) { if (error.message === 'HTTP 409') return { ok: false, status: 409 }; throw error; }
    });
    const [record] = await ext.exports.query_uploaded_cookies('http://private.test', 'secret');
    store({ cookie_data: { 'example.test': [{ ...cookie, path: '/other', value: 'new-other' }, { ...cookie, hostOnly: true }] }, local_storage_data: { token: 'new-storage' } });
    racing = true;
    const updated = await ext.exports.update_uploaded_cookie('http://private.test', 'secret', '', record, 'example.test', 0, 'edited');
    assert.equal(updates, 2);
    assert.equal(updated.data.cookie_data['example.test'][0].value, 'racing-other');
    assert.equal(updated.data.cookie_data['example.test'][1].value, 'edited');
    assert.equal(updated.data.local_storage_data.token, 'racing-storage');
    assert.equal(record.data.cookie_data['example.test'][0].value, cookie.value);
    await assert.rejects(ext.exports.update_uploaded_cookie('http://private.test', 'secret', '', record, 'example.test', 0, 'another-edit'), /目标 Cookie 的值已被/);
    assert.equal(updates, 2);
  });
}

for (const mode of ['legacy', 'aes-128-cbc-fixed']) {
  test(`API and extension retain ${mode} encrypted sync`, async () => {
    const api = server(path.join(root, 'api/app.js'));
    let uploaded;
    const ext = extension(async (url, options) => {
      if (url.endsWith('/update')) {
        uploaded = JSON.parse(ungzip(options.body, { to: 'string' }));
        return { json: async () => api.request('/update', uploaded) };
      }
      return { json: async () => api.request('/get/:uuid') };
    });
    const config = { uuid: 'test-user', password: 'secret', endpoint: 'http://private.test', crypto_type: mode, domains: 'example.test' };
    assert.equal((await ext.exports.upload_cookie(config)).action, 'done');
    assert.throws(() => JSON.parse(uploaded.encrypted));
    assert.equal(api.request('/get/:uuid', { password: 'secret' }).cookie_data['example.test'][0].value, cookie.value);
    assert.equal((await ext.exports.download_cookie(config)).action, 'done');
    assert.equal(ext.restored[0].value, cookie.value);
    assert.equal(await ext.exports.upload_cookie({ ...config, password: '' }), false);
  });
}

for (const file of ['api/app.js', 'docker/app.js']) {
  test(`${file}: query every UUID, isolate bad records and decrypt without importing cookies`, async () => {
    const api = server(path.join(root, file));
    const data = { cookie_data: { 'example.test': [cookie] }, local_storage_data: { 'example.test': { token: 'test' } } };
    api.request('/update', { uuid: 'plain', crypto_type: 'none', encrypted: JSON.stringify(data) });
    for (const mode of ['legacy', 'aes-128-cbc-fixed']) {
      const encrypt = server(path.join(root, 'api/app.js')).context.cookie_encrypt;
      api.request('/update', { uuid: mode, crypto_type: mode, encrypted: encrypt(mode, data, 'secret', mode) });
    }
    api.files.set(path.join(root, path.dirname(file), 'data/broken.json'), '{invalid');
    api.files.set(path.join(root, path.dirname(file), 'data/ignored.txt'), 'ignore');
    let request;
    const ext = extension(async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => api.request('/records') };
    });
    const records = await ext.exports.query_uploaded_cookies('http://private.test/', 'secret', 'Authorization: Bearer abc:def');
    assert.equal(request.url, 'http://private.test/records');
    assert.equal(request.options.headers.Authorization, 'Bearer abc:def');
    assert.equal(records.length, 4);
    assert.equal(records.filter(record => record.data).length, 3);
    assert.equal(records.find(record => record.uuid === 'broken').error, '服务端记录无法读取');
    assert.equal(ext.restored.length, 0);
    const noPassword = await ext.exports.query_uploaded_cookies('http://private.test', '');
    assert.equal(noPassword.filter(record => record.data).length, 1);
    assert.match(noPassword.find(record => record.uuid === 'legacy').error, /填写对应密码/);
    const wrongPassword = await ext.exports.query_uploaded_cookies('http://private.test', 'wrong');
    assert.equal(wrongPassword.filter(record => record.data).length, 1);
    assert.match(wrongPassword.find(record => record.uuid === 'legacy').error, /无法解密/);
  });
}

test('toolbar opens a settings tab with context and reuses it without navigating away from drafts', async () => {
  let click;
  let existing = [];
  const created = [], updated = [], focused = [];
  const browser = {
    runtime: { id: 'test', getURL: url => `chrome-extension://test${url}`, onInstalled: { addListener() {} } },
    action: { onClicked: { addListener: handler => { click = handler; } } },
    alarms: { onAlarm: { addListener() {} } },
    tabs: { async query() { return existing; }, async create(options) { created.push(options); }, async update(id, options) { updated.push({ id, options }); } },
    windows: { async update(id, options) { focused.push({ id, options }); } },
  };
  const source = ts.transpileModule(fs.readFileSync(path.join(root, 'ext/entrypoints/background.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: name => name === 'webextension-polyfill' ? browser : {}, defineBackground: handler => handler(), console: quiet, URLSearchParams });
  await click({ id: 123, url: 'chrome://newtab/' });
  const url = new URL(created[0].url);
  assert.equal(url.pathname, '/popup.html');
  assert.equal(url.searchParams.get('targetTabId'), '123');
  assert.equal(url.searchParams.get('targetUrl'), 'chrome://newtab/');
  existing = [{ id: 789, windowId: 456, url: created[0].url }];
  await click({ id: 124, url: 'https://example.test' });
  assert.equal(created.length, 1);
  assert.equal(updated[0].id, 789);
  assert.equal(updated[0].options.active, true);
  assert.equal(updated[0].options.url, undefined);
  assert.equal(focused[0].id, 456);
});

test('record query reports an unsupported server endpoint', async () => {
  const ext = extension(async () => ({ ok: false, status: 404 }));
  await assert.rejects(ext.exports.query_uploaded_cookies('http://private.test', ''), /请更新服务端/);
});

for (const minutes of [-1, 0, 60]) {
  test(`cookie restoration lifetime ${minutes}: long-term, session or custom`, async () => {
    const ext = extension(async () => ({ json: async () => ({ crypto_type: 'none', encrypted: JSON.stringify({ cookie_data: { 'example.test': [cookie] } }) }) }));
    const before = Math.floor(Date.now() / 1000);
    assert.equal((await ext.exports.download_cookie({ uuid: 'test', password: '', endpoint: 'http://private.test', expire_minutes: minutes })).action, 'done');
    const restored = ext.restored[0];
    if (minutes === 0) {
      assert.equal('expirationDate' in restored, false);
    } else {
      const duration = minutes === -1 ? 400 * 24 * 60 * 60 : minutes * 60;
      assert.ok(restored.expirationDate >= before + duration);
      assert.ok(restored.expirationDate <= Math.floor(Date.now() / 1000) + duration);
    }
  });
}

for (const file of ['api/app.js', 'docker/app.js']) {
  for (const mode of ['none', 'legacy', 'aes-128-cbc-fixed']) {
    test(`${file}: edit one ${mode} cookie without losing other cookies or storage; reject stale writes`, async () => {
      const api = server(path.join(root, file));
      const encrypt = server(path.join(root, 'api/app.js')).context.cookie_encrypt;
      const original = { cookie_data: { 'example.test': [cookie, { ...cookie, path: '/other', value: 'other-value', partitionKey: { topLevelSite: 'https://example.test' } }] }, local_storage_data: { 'example.test': { token: 'keep-storage' } }, extra_field: 'preserve' };
      api.request('/update', { uuid: 'test-user', crypto_type: mode, encrypted: encrypt('test-user', original, 'secret', mode) });
      let uploaded;
      const ext = extension(async (url, options) => {
        if (url.endsWith('/records')) return { ok: true, json: async () => api.request('/records') };
        if (url.includes('/get/')) return { ok: true, json: async () => api.request('/get/:uuid') };
        uploaded = JSON.parse(options.body);
        try {
          const result = api.request('/update', uploaded);
          return { ok: true, json: async () => result };
        } catch (error) {
          if (error.message === 'HTTP 409') return { ok: false, status: 409 };
          throw error;
        }
      });
      const [record] = await ext.exports.query_uploaded_cookies('http://private.test', 'secret');
      const updated = await ext.exports.update_uploaded_cookie('http://private.test', 'secret', 'Authorization: Bearer abc:def', record, 'example.test', 0, 'new-value');
      assert.equal(uploaded.crypto_type, mode);
      assert.equal(uploaded.expected_encrypted, record.source_encrypted);
      const [stored] = await ext.exports.query_uploaded_cookies('http://private.test', 'secret');
      assert.equal(stored.data.cookie_data['example.test'][0].value, 'new-value');
      assert.equal(stored.data.cookie_data['example.test'][1].value, 'other-value');
      assert.equal(stored.data.cookie_data['example.test'][1].partitionKey.topLevelSite, 'https://example.test');
      assert.equal(stored.data.local_storage_data['example.test'].token, 'keep-storage');
      assert.equal(stored.data.extra_field, 'preserve');
      assert.equal(record.data.cookie_data['example.test'][0].value, cookie.value);
      assert.equal(ext.restored.length, 0);
      await assert.rejects(ext.exports.update_uploaded_cookie('http://private.test', 'secret', '', record, 'example.test', 0, 'stale-value'), /重新查询/);
      const empty = await ext.exports.update_uploaded_cookie('http://private.test', 'secret', '', updated, 'example.test', 0, '');
      assert.equal(empty.data.cookie_data['example.test'][0].value, '');
      if (mode !== 'none') assert.throws(() => JSON.parse(empty.source_encrypted));
      await assert.rejects(ext.exports.update_uploaded_cookie('http://private.test', 'secret', '', empty, 'example.test', 9, 'invalid'), /Cookie 不存在/);
    });
  }
}
