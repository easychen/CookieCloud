import assert from 'node:assert/strict';
import { createCipheriv, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import CryptoJS from 'crypto-js';
import { download_cookie } from '../utils/functions.ts';

const messages = {};
for (const locale of ['en', 'zh_CN']) {
  messages[locale] = JSON.parse(await readFile(new URL(`../public/_locales/${locale}/messages.json`, import.meta.url), 'utf8'));
}
const payload = { uuid: 'restore-regression', password: 'synthetic-test-password', endpoint: 'https://sync.invalid' };
const cookie = (name, overrides = {}) => ({
  name, value: `synthetic-${name}`, domain: 'example.invalid', hostOnly: true,
  path: '/', secure: true, httpOnly: true, sameSite: 'lax', ...overrides,
});
const domainMatches = (host, domain) => host === domain || host.endsWith(`.${domain}`);
const partition = key => JSON.stringify(key ?? null);

// Boundary substitute: a small cookie jar enforcing the browser rules relevant to restore.
// Assertions below query request-visible cookies, not the arguments passed to cookies.set.
function cookieJar() {
  const entries = new Map();
  return {
    async set(details) {
      const url = new URL(details.url);
      const domain = details.domain?.replace(/^\./, '') ?? url.hostname;
      const hostOnly = details.domain === undefined;
      if (!domainMatches(url.hostname, domain)) throw new Error('Invalid domain');
      if (details.secure && url.protocol !== 'https:') throw new Error('Secure cookie requires HTTPS');
      if (details.name.startsWith('__Host-') && (!hostOnly || !details.secure || details.path !== '/')) {
        throw new Error('Invalid __Host- cookie');
      }
      if (details.name.startsWith('__Secure-') && !details.secure) throw new Error('Invalid __Secure- cookie');
      if (details.partitionKey && !details.secure) throw new Error('Partitioned cookie requires Secure');
      if (url.protocol === 'http:' && [...entries.values()].some(existing =>
        existing.name === details.name && existing.secure && existing.path === details.path &&
        partition(existing.partitionKey) === partition(details.partitionKey) &&
        (domainMatches(domain, existing.domain) || domainMatches(existing.domain, domain)))) {
        throw new Error('Insecure overwrite of Secure cookie');
      }
      if (details.name === 'null-result') return null;
      if (details.name === 'undefined-result') return undefined;
      const stored = { ...details, domain, hostOnly };
      entries.set(JSON.stringify([domain, details.path, details.name, partition(details.partitionKey)]), stored);
      return stored;
    },
    forRequest(address, partitionKey) {
      const url = new URL(address);
      return Object.fromEntries([...entries.values()].filter(entry =>
        (entry.hostOnly ? entry.domain === url.hostname : domainMatches(url.hostname, entry.domain)) &&
        (!entry.secure || url.protocol === 'https:') && url.pathname.startsWith(entry.path) &&
        (!entry.partitionKey || partition(entry.partitionKey) === partition(partitionKey))
      ).map(entry => [entry.name, entry.value]));
    },
  };
}

function encrypt(snapshot, cryptoType) {
  const key = createHash('md5').update(`${payload.uuid}-${payload.password}`).digest('hex').slice(0, 16);
  const text = JSON.stringify(snapshot);
  if (cryptoType === 'legacy') return CryptoJS.AES.encrypt(text, key).toString();
  const cipher = createCipheriv('aes-128-cbc', Buffer.from(key), Buffer.alloc(16));
  return Buffer.concat([cipher.update(text), cipher.final()]).toString('base64');
}

test('download_cookie restores encrypted snapshots without broadening scope or hiding failures', async t => {
  const original = new Map(['browser', 'fetch', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  // Badge timers do not affect restoration and should not keep the test process alive.
  t.mock.method(globalThis, 'setTimeout', () => 0);
  const logs = [];
  t.mock.method(console, 'log', (...args) => logs.push(args));
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Synthetic Chromium' } });

  function setup(locale = 'en') {
    const jar = cookieJar();
    const storage = {};
    const badges = [];
    globalThis.browser = {
      cookies: { set: details => jar.set(details) },
      storage: { local: { async set(data) { Object.assign(storage, data); } } },
      action: { setBadgeText({ text }) { badges.push(text); }, setBadgeBackgroundColor() {} },
      i18n: { getMessage(key, substitutions) {
        return messages[locale][key]?.message.replace(/\$(\d+)/g, (_, index) => substitutions[Number(index) - 1]) ?? '';
      } },
    };
    return { jar, storage, badges };
  }

  async function restore(cookies, { localStorage = {}, cryptoType = 'aes-128-cbc-fixed', ...options } = {}) {
    const encrypted = encrypt({ cookie_data: { 'example.invalid': cookies }, local_storage_data: localStorage }, cryptoType);
    globalThis.fetch = async () => ({ json: async () => ({ encrypted, crypto_type: cryptoType }) });
    return download_cookie({ ...payload, ...options });
  }

  await t.test('host-only and prefixed cookies stay on their host; domain and old snapshot cookies keep domain scope', async () => {
    for (const cryptoType of ['legacy', 'aes-128-cbc-fixed']) {
      const { jar } = setup();
      const result = await restore([
        cookie('host'), cookie('__Host-session'), cookie('__Secure-session'),
        cookie('domain', { domain: '.example.invalid', hostOnly: false }),
        cookie('old-snapshot', { hostOnly: undefined }),
      ], { cryptoType, expire_minutes: 30 });
      assert.equal(result.action, 'done');
      assert.deepEqual([result.attempted, result.succeeded, result.failed], [5, 5, 0]);
      assert.deepEqual(jar.forRequest('https://example.invalid/'), {
        host: 'synthetic-host', '__Host-session': 'synthetic-__Host-session',
        '__Secure-session': 'synthetic-__Secure-session', domain: 'synthetic-domain', 'old-snapshot': 'synthetic-old-snapshot',
      });
      assert.deepEqual(jar.forRequest('https://child.example.invalid/'), { domain: 'synthetic-domain', 'old-snapshot': 'synthetic-old-snapshot' });
      assert.deepEqual(jar.forRequest('http://example.invalid/'), {});
    }
  });

  await t.test('same-name cookies remain isolated by top-level site and cross-site ancestry', async () => {
    const { jar } = setup();
    const first = { topLevelSite: 'https://first.invalid', hasCrossSiteAncestor: false };
    const ancestor = { ...first, hasCrossSiteAncestor: true };
    const second = { topLevelSite: 'https://second.invalid', hasCrossSiteAncestor: false };
    const result = await restore([
      cookie('session', { value: 'first', partitionKey: first }),
      cookie('session', { value: 'ancestor', partitionKey: ancestor }),
      cookie('session', { value: 'second', partitionKey: second }),
    ]);
    assert.equal(result.action, 'done');
    assert.deepEqual(jar.forRequest('https://example.invalid/', first), { session: 'first' });
    assert.deepEqual(jar.forRequest('https://example.invalid/', ancestor), { session: 'ancestor' });
    assert.deepEqual(jar.forRequest('https://example.invalid/', second), { session: 'second' });
    assert.deepEqual(jar.forRequest('https://example.invalid/'), {});
    assert.deepEqual(jar.forRequest('https://child.example.invalid/', first), {});
  });

  await t.test('Secure conflicts, null and undefined results produce partial status while later cookies and localStorage continue', async () => {
    const { jar, storage, badges } = setup();
    await jar.set({ ...cookie('protected'), domain: '.example.invalid', url: 'https://example.invalid/' });
    const result = await restore([
      cookie('protected', { secure: false, domain: 'child.example.invalid' }),
      cookie('null-result'), cookie('undefined-result'), cookie('after-rejection', { secure: false }),
    ], { localStorage: { 'https://example.invalid': { setting: 'synthetic-storage' } } });
    assert.equal(result.action, 'partial');
    assert.deepEqual([result.attempted, result.succeeded, result.failed], [4, 1, 3]);
    assert.equal(jar.forRequest('https://example.invalid/').protected, 'synthetic-protected');
    assert.equal(jar.forRequest('http://example.invalid/')['after-rejection'], 'synthetic-after-rejection');
    assert.equal(jar.forRequest('http://child.example.invalid/').protected, undefined);
    assert.equal(storage['LS-https://example.invalid'], JSON.stringify({ setting: 'synthetic-storage' }));
    assert.equal(badges.at(-1), 'err');
  });

  await t.test('total rejection is an error, not done, and still stages localStorage', async () => {
    const { jar, storage, badges } = setup('zh_CN');
    const result = await restore([
      cookie('__Host-invalid', { hostOnly: false }),
      cookie('insecure-partition', { secure: false, partitionKey: { topLevelSite: 'https://first.invalid' } }),
    ], { localStorage: { 'https://example.invalid': { setting: 'still-staged' } } });
    assert.equal(result.action, 'error');
    assert.deepEqual([result.attempted, result.succeeded, result.failed], [2, 0, 2]);
    assert.deepEqual(jar.forRequest('https://example.invalid/'), {});
    assert.equal(storage['LS-https://example.invalid'], JSON.stringify({ setting: 'still-staged' }));
    assert.equal(badges.at(-1), 'err');
  });

  assert.doesNotMatch(JSON.stringify(logs), /synthetic-|still-staged|restore-regression/);
});
