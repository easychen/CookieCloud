import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCookieSetFallbacks,
  normalizeCookieForSet,
} from './cookie-normalization.ts';

test('preserves a regular domain cookie and partition key', () => {
  const { details, warnings } = normalizeCookieForSet({
    name: 'sid',
    value: 'value',
    domain: '.example.com',
    path: '/',
    secure: true,
    httpOnly: true,
    hostOnly: false,
    sameSite: 'no_restriction',
    partitionKey: {
      topLevelSite: 'https://top.example',
      hasCrossSiteAncestor: true,
    },
  }, 60, 1_700_000_000);

  assert.equal(details.domain, '.example.com');
  assert.deepEqual(details.partitionKey, { topLevelSite: 'https://top.example' });
  assert.equal(details.expirationDate, 1_700_003_600);
  assert.deepEqual(warnings, []);
});

test('keeps a host-only cookie host-only and omits unspecified SameSite', () => {
  const { details } = normalizeCookieForSet({
    name: 'host-session',
    value: 'value',
    domain: 'www.douyin.com',
    path: '/',
    secure: true,
    httpOnly: false,
    hostOnly: true,
    sameSite: 'unspecified',
    session: true,
  });

  assert.equal(details.url, 'https://www.douyin.com/');
  assert.equal('domain' in details, false);
  assert.equal('sameSite' in details, false);
  assert.equal('expirationDate' in details, false);
});

test('enforces __Host- cookie constraints', () => {
  const { details } = normalizeCookieForSet({
    name: '__Host-session',
    value: 'value',
    domain: '.example.com',
    path: '/wrong',
    secure: false,
    httpOnly: true,
    hostOnly: false,
    sameSite: 'lax',
  });

  assert.equal(details.url, 'https://example.com/');
  assert.equal(details.path, '/');
  assert.equal(details.secure, true);
  assert.equal('domain' in details, false);
});

test('rejects cookies without a usable domain', () => {
  assert.throws(
    () => normalizeCookieForSet({ name: 'bad', value: 'value', domain: '' }),
    /domain is empty/,
  );
});

test('creates progressive Chromium compatibility fallbacks', () => {
  const fallbacks = createCookieSetFallbacks({
      url: 'https://account.xiaomi.com/',
      domain: '.account.xiaomi.com',
      name: 'cUserId',
      sameSite: 'no_restriction',
      expirationDate: 1_800_000_000,
    });
  assert.deepEqual(
    fallbacks[0],
    {
      url: 'https://account.xiaomi.com/',
      domain: 'account.xiaomi.com',
      name: 'cUserId',
      sameSite: 'no_restriction',
      expirationDate: 1_800_000_000,
    },
  );
  assert.equal('sameSite' in fallbacks[1], false);
  assert.equal('expirationDate' in fallbacks[2], false);
  assert.equal('domain' in fallbacks.at(-1)!, false);
});

test('upgrades an insecure cookie to HTTPS before host-only fallback', () => {
  const fallbacks = createCookieSetFallbacks({
    url: 'http://xiaomi.com/',
    domain: '.xiaomi.com',
    name: 'cUserId',
    secure: false,
    expirationDate: 1_800_000_000,
  });
  const secureFallback = fallbacks.find(item => item.secure === true);
  assert.equal(secureFallback?.url, 'https://xiaomi.com/');
  assert.equal(secureFallback?.domain, 'xiaomi.com');
});
