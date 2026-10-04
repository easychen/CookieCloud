const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const { CookieJar, Cookie } = require('tough-cookie');
const CryptoJS = require('crypto-js');
const { createKeepAlive, attachKeepAlive, requestPage } = require('../../docker/server-keep-alive.cjs');

function encrypt(uuid, data, password, mode) {
  if (mode === 'none') return JSON.stringify(data);
  const key = CryptoJS.MD5(uuid + '-' + password).toString().slice(0, 16);
  return mode === 'legacy' ? CryptoJS.AES.encrypt(JSON.stringify(data), key).toString() :
    CryptoJS.AES.encrypt(JSON.stringify(data), CryptoJS.enc.Utf8.parse(key), { iv: CryptoJS.enc.Hex.parse('00000000000000000000000000000000') }).ciphertext.toString(CryptoJS.enc.Base64);
}
function decrypt(uuid, data, password, mode) {
  if (mode === 'none') return JSON.parse(data);
  const key = CryptoJS.MD5(uuid + '-' + password).toString().slice(0, 16);
  return JSON.parse((mode === 'legacy' ? CryptoJS.AES.decrypt(data, key) : CryptoJS.AES.decrypt(data, CryptoJS.enc.Utf8.parse(key), { iv: CryptoJS.enc.Hex.parse('00000000000000000000000000000000') })).toString(CryptoJS.enc.Utf8));
}
const session = { name: 'session', value: 'logged-in', domain: 'example.com', path: '/', secure: true, httpOnly: true, hostOnly: true, sameSite: 'lax', storeId: '0', session: true };
const initial = () => ({ cookie_data: { keyword: [session], 'other.example': [{ ...session, domain: 'other.example', value: 'retained' }] }, local_storage_data: { 'example.com': { token: 'retained' } } });

function setup(t, request, mode = 'none') {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cookiecloud-keep-alive-'));
  let clock = Date.now();
  const password = 'test-secret-password';
  const record = path.join(dataDir, 'test-uuid.json');
  const write = data => fs.writeFileSync(record, JSON.stringify({ encrypted: encrypt('test-uuid', data, password, mode), crypto_type: mode }));
  const read = () => { const stored = JSON.parse(fs.readFileSync(record)); return decrypt('test-uuid', stored.encrypted, password, stored.crypto_type); };
  write(initial());
  const options = { dataDir, decrypt, encrypt, CookieJar, Cookie, request, now: () => clock };
  const service = createKeepAlive(options);
  t.after(() => { service.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const enable = rules => service.configure('test-uuid', { password, rules: rules || [{ url: 'https://example.com/account', interval: 5 }] });
  return { service, enable, read, write, options, record, dataDir, password, advance: milliseconds => { clock += milliseconds; } };
}

test('TLS exceptions are per rule, persist and do not follow cross-origin redirects', async t => {
  const calls = [];
  const state = setup(t, async (url, header, timeout, verifyTls) => {
    calls.push([url.href, verifyTls]);
    return url.pathname === '/account' ? { status: 302, headers: { location: 'https://other.example/finish' } } : { status: 200, headers: {} };
  });
  state.enable();
  await state.service.tick();
  assert.ok(calls.every(call => call[1] === true));
  calls.length = 0;
  state.enable([{ url: 'https://example.com/account', interval: 5, verify_tls: false }]);
  await state.service.tick();
  assert.deepEqual(calls, [['https://example.com/account', false], ['https://other.example/finish', true]]);
  assert.equal(state.service.status('test-uuid').rules[0].verify_tls, false);
  state.service.close();
  const restarted = createKeepAlive(state.options);
  t.after(() => restarted.close());
  assert.equal(restarted.status('test-uuid').rules[0].verify_tls, false);
  assert.throws(() => restarted.configure('test-uuid', { password: state.password, rules: [{ url: 'https://example.com', interval: 5, verify_tls: 'false' }] }), /布尔值/);
});

test('native HTTPS verifies certificates by default and bypasses only with explicit flag', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cookiecloud-tls-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(dir, 'key.pem'), '-out', path.join(dir, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  const server = https.createServer({ key: fs.readFileSync(path.join(dir, 'key.pem')), cert: fs.readFileSync(path.join(dir, 'cert.pem')) }, (req, res) => res.end('ok'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = new URL(`https://127.0.0.1:${server.address().port}/`);
  await assert.rejects(requestPage(url, ''), /self-signed certificate/);
  assert.equal((await requestPage(url, '', 20000, false)).status, 200);
  await assert.rejects(requestPage(url, ''), /self-signed certificate/);
});

for (const mode of ['none', 'legacy', 'aes-128-cbc-fixed']) {
  test(`server keep-alive rotates cookies and retains other records (${mode})`, async t => {
    const state = setup(t, async (url, header) => {
      assert.equal(url.href, 'https://example.com/account');
      assert.equal(header, 'session=logged-in');
      return { status: 200, headers: { 'set-cookie': ['session=renewed; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=3600', 'csrf=added; Path=/; Secure'] } };
    }, mode);
    state.enable();
    await state.service.tick();
    const data = state.read();
    assert.equal(data.cookie_data.keyword[0].value, 'renewed');
    assert.equal(data.cookie_data.keyword[0].hostOnly, true);
    assert.ok(data.cookie_data.keyword[0].expirationDate > Date.now() / 1000);
    assert.equal(data.cookie_data['example.com'][0].name, 'csrf');
    assert.equal(data.cookie_data['other.example'][0].value, 'retained');
    assert.equal(data.local_storage_data['example.com'].token, 'retained');
    assert.equal(JSON.parse(fs.readFileSync(state.record)).crypto_type, mode);
    assert.equal(state.service.status('test-uuid').rules[0].last_status, 200);
  });
}

test('failed requests do not block other URLs, and tasks obey the persisted interval', async t => {
  const calls = [];
  const state = setup(t, async url => {
    calls.push(url.pathname);
    if (url.pathname === '/first') throw new Error('保活请求超时');
    return { status: 200, headers: {} };
  });
  state.enable([{ url: 'https://example.com/first', interval: 5 }, { url: 'https://example.com/second', interval: 5 }]);
  await state.service.tick();
  assert.deepEqual(calls, ['/first', '/second']);
  assert.match(state.service.status('test-uuid').rules[0].last_error, /超时/);
  await state.service.tick();
  assert.equal(calls.length, 2);
  state.advance(5 * 60_000);
  await state.service.tick();
  assert.equal(calls.length, 4);
});

test('task credentials are encrypted, status omits secrets and tasks resume after restart', async t => {
  let calls = 0;
  const state = setup(t, async () => { calls++; return { status: 200, headers: {} }; }, 'legacy');
  state.enable();
  await state.service.tick();
  const persisted = fs.readFileSync(path.join(state.dataDir, '.keep-alive/test-uuid.json'), 'utf8');
  assert.equal(persisted.includes(state.password), false);
  assert.equal(JSON.stringify(state.service.status('test-uuid')).includes('secret'), false);
  state.service.close();
  const restarted = createKeepAlive(state.options);
  t.after(() => restarted.close());
  await restarted.tick();
  assert.equal(calls, 1);
  state.advance(5 * 60_000);
  await restarted.tick();
  assert.equal(calls, 2);
  restarted.configure('test-uuid', { enabled: false });
  state.advance(5 * 60_000);
  await restarted.tick();
  assert.equal(calls, 2);
  assert.equal(JSON.parse(fs.readFileSync(path.join(state.dataDir, '.keep-alive/test-uuid.json'))).secret, null);
});

test('new browser login during a request is retained instead of overwritten by an old response', async t => {
  let state;
  state = setup(t, async () => {
    const data = initial();
    data.cookie_data.keyword[0] = { ...session, value: 'new-browser-login' };
    state.write(data);
    return { status: 200, headers: { 'set-cookie': ['session=old-response; Path=/; Secure'] } };
  });
  state.enable();
  await state.service.tick();
  assert.equal(state.read().cookie_data.keyword[0].value, 'new-browser-login');
  assert.match(state.service.status('test-uuid').rules[0].last_error, /已更新/);
});

test('unrelated browser updates are merged with rotated cookies', async t => {
  let state;
  state = setup(t, async () => {
    const data = initial();
    data.local_storage_data.new_site = { latest: 'preserved' };
    state.write(data);
    return { status: 200, headers: { 'set-cookie': ['session=renewed; Path=/; Secure'] } };
  });
  state.enable();
  await state.service.tick();
  assert.equal(state.read().cookie_data.keyword[0].value, 'renewed');
  assert.equal(state.read().local_storage_data.new_site.latest, 'preserved');
});

test('a concurrent login change also rejects response cookies with new names', async t => {
  let state;
  state = setup(t, async () => {
    const data = initial();
    data.cookie_data.keyword[0] = { ...session, value: 'new-login' };
    state.write(data);
    return { status: 200, headers: { 'set-cookie': ['new_session=old-login; Path=/; Secure'] } };
  });
  state.enable();
  await state.service.tick();
  assert.equal(state.read().cookie_data['example.com'], undefined);
  assert.match(state.service.status('test-uuid').rules[0].last_error, /已更新/);
});

test('disabling an in-flight task prevents the response from changing stored cookies', async t => {
  let release;
  const state = setup(t, () => new Promise(resolve => { release = resolve; }));
  state.enable();
  const first = state.service.tick();
  await state.service.tick();
  state.service.configure('test-uuid', { enabled: false });
  release({ status: 200, headers: { 'set-cookie': ['session=stale; Path=/; Secure'] } });
  await first;
  assert.equal(state.read().cookie_data.keyword[0].value, session.value);
  assert.equal(state.service.status('test-uuid').enabled, false);
});

test('response deletion and redirects use updated cookies without leaking to another host', async t => {
  const calls = [];
  const state = setup(t, async (url, header) => {
    calls.push([url.href, header]);
    if (url.pathname === '/account') return { status: 302, headers: { location: '/next', 'set-cookie': ['session=; Max-Age=0; Path=/; Secure', 'temporary=1; Path=/; Secure'] } };
    if (url.pathname === '/next') return { status: 302, headers: { location: 'https://redirect.example/final' } };
    return { status: 200, headers: {} };
  });
  state.enable();
  await state.service.tick();
  assert.equal(calls[1][1], 'temporary=1');
  assert.equal(calls[2][1], '');
  assert.equal(state.read().cookie_data.keyword.length, 0);
  assert.equal(state.read().cookie_data['example.com'][0].name, 'temporary');
});

test('Secure, path, container and partition scopes are respected', async t => {
  const state = setup(t, async (url, header) => {
    assert.equal(header, 'plain=1');
    return { status: 200, headers: {} };
  });
  const data = initial();
  data.cookie_data.keyword.push(
    { ...session, name: 'plain', value: '1', secure: false },
    { ...session, name: 'private', secure: false, storeId: '1' },
    { ...session, name: 'partition', secure: false, partitionKey: { topLevelSite: 'https://example.com' } },
    { ...session, name: 'path', secure: false, path: '/other' },
  );
  state.write(data);
  state.enable([{ url: 'http://example.com/account', interval: 5 }]);
  await state.service.tick();
  assert.equal(state.service.status('test-uuid').rules[0].last_status, 200);
});

test('wrong passwords, invalid URLs and UUID paths cannot create tasks', t => {
  const state = setup(t, async () => {}, 'legacy');
  assert.throws(() => state.service.configure('test-uuid', { password: 'wrong', rules: [{ url: 'https://example.com', interval: 5 }] }), /解密/);
  assert.throws(() => state.service.configure('../test-uuid', { enabled: false }), /UUID/);
  for (const rule of [{ url: 'file:///tmp/test', interval: 1 }, { url: 'https://user:pass@example.com', interval: 1 }, { url: 'https://example.com', interval: 0 }]) {
    assert.throws(() => state.service.configure('test-uuid', { password: state.password, rules: [rule] }));
  }
  assert.equal(state.service.status('test-uuid').enabled, false);
});

test('HTTP client handles Set-Cookie arrays and has an absolute timeout', async t => {
  const server = http.createServer((req, res) => {
    if (req.url === '/hang') return;
    assert.equal(req.headers.cookie, 'session=logged-in');
    res.setHeader('Set-Cookie', ['session=renewed; Path=/', 'csrf=1; Path=/']);
    res.end('ok');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await requestPage(new URL(base), 'session=logged-in');
  assert.equal(response.status, 200);
  assert.equal(response.headers['set-cookie'].length, 2);
  await assert.rejects(requestPage(new URL(base + '/hang'), '', 30), /超时/);
});

test('task API supports prefixed URLs and disabling without a decrypt password', async t => {
  const state = setup(t, async () => ({ status: 200, headers: {} }));
  const express = require('express');
  const app = express();
  app.use(express.json());
  const service = attachKeepAlive(app, state.options, '/cookie');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { service.close(); server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/cookie/keep-alive/test-uuid`;
  const post = body => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await (await post({ password: state.password, rules: [{ url: 'https://example.com', interval: 5 }] })).json()).enabled, true);
  const status = await (await fetch(url)).json();
  assert.equal(status.rules.length, 1);
  assert.equal(status.secret, undefined);
  assert.equal((await (await post({ enabled: false })).json()).enabled, false);
});
