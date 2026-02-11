const assert = require('assert');
const {
  computeBodyHash,
  buildSignatureString,
  signSignatureString,
  createHmacAuthMiddleware
} = require('../utils/auth');
const {
  AES_GCM_TYPE,
  cookieEncrypt,
  cookieDecrypt
} = require('../utils/crypto');

async function runMiddleware(middleware, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      payload: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.payload = payload;
        resolve({ ok: false, statusCode: this.statusCode, payload });
      },
      send(payload) {
        this.payload = payload;
        resolve({ ok: false, statusCode: this.statusCode, payload });
      }
    };

    middleware(req, res, () => resolve({ ok: true, statusCode: 200 }));
  });
}

function buildSignedRequest({
  method,
  path,
  uuid,
  body,
  keyId,
  secret,
  timestamp,
  nonce
}) {
  const bodyHash = method === 'GET' ? computeBodyHash('') : computeBodyHash(body);
  const signaturePayload = buildSignatureString({
    method,
    path,
    uuid,
    timestamp,
    nonce,
    bodyHash
  });

  const signature = signSignatureString(signaturePayload, secret);

  return {
    method,
    path,
    params: method === 'GET' ? { uuid } : {},
    body: method === 'GET' ? {} : body,
    headers: {
      'x-cc-key-id': keyId,
      'x-cc-timestamp': String(timestamp),
      'x-cc-nonce': nonce,
      'x-cc-signature': signature
    }
  };
}

(async () => {
  const middleware = createHmacAuthMiddleware({
    keys: 'default:test-secret-key',
    ttlSec: 300,
    nonceTtlMs: 10 * 60 * 1000,
    logger: {
      error() {},
      warn() {},
      info() {}
    }
  });

  const now = Math.floor(Date.now() / 1000);
  const body = {
    uuid: 'test_user_001',
    encrypted: 'demo-encrypted',
    crypto_type: AES_GCM_TYPE
  };

  const validReq = buildSignedRequest({
    method: 'POST',
    path: '/update',
    uuid: body.uuid,
    body,
    keyId: 'default',
    secret: 'test-secret-key',
    timestamp: now,
    nonce: '00112233445566778899aabbccddeeff'
  });

  const pass = await runMiddleware(middleware, validReq);
  assert.strictEqual(pass.ok, true, 'valid signed request should pass');

  const replay = await runMiddleware(middleware, validReq);
  assert.strictEqual(replay.ok, false, 'replay request should fail');
  assert.strictEqual(replay.statusCode, 409, 'replay should return 409');

  const expiredReq = buildSignedRequest({
    method: 'POST',
    path: '/update',
    uuid: body.uuid,
    body,
    keyId: 'default',
    secret: 'test-secret-key',
    timestamp: now - 1000,
    nonce: '11112222333344445555666677778888'
  });
  const expired = await runMiddleware(middleware, expiredReq);
  assert.strictEqual(expired.ok, false, 'expired request should fail');
  assert.strictEqual(expired.statusCode, 401, 'expired request should return 401');

  const badSignatureReq = buildSignedRequest({
    method: 'GET',
    path: '/get/test_user_001',
    uuid: 'test_user_001',
    body: '',
    keyId: 'default',
    secret: 'test-secret-key',
    timestamp: now,
    nonce: '99990000aaaabbbbccccddddeeeeffff'
  });
  badSignatureReq.params = { uuid: 'test_user_001' };
  badSignatureReq.headers['x-cc-signature'] = 'a'.repeat(64);
  const bad = await runMiddleware(middleware, badSignatureReq);
  assert.strictEqual(bad.ok, false, 'invalid signature should fail');
  assert.strictEqual(bad.statusCode, 401, 'invalid signature should return 401');

  const sample = {
    cookie_data: {
      'example.com': [{ name: 'sid', value: 'abc' }]
    },
    local_storage_data: {
      'LS-example.com': { token: 'xyz' }
    },
    update_time: '2026-02-11T00:00:00.000Z'
  };

  const encryptedGcm = cookieEncrypt('test_user_001', sample, 'test_password', AES_GCM_TYPE);
  const decryptedGcm = cookieDecrypt('test_user_001', encryptedGcm, 'test_password', AES_GCM_TYPE, { enableLegacyRead: true });
  assert.deepStrictEqual(decryptedGcm, sample, 'aes-gcm payload should round-trip');

  try {
    const encryptedLegacy = cookieEncrypt('test_user_001', sample, 'test_password', 'legacy');
    const decryptedLegacy = cookieDecrypt('test_user_001', encryptedLegacy, 'test_password', 'legacy', { enableLegacyRead: true });
    assert.deepStrictEqual(decryptedLegacy, sample, 'legacy payload should still round-trip when enabled');

    assert.throws(() => {
      cookieDecrypt('test_user_001', encryptedLegacy, 'test_password', 'legacy', { enableLegacyRead: false });
    }, /Legacy crypto is disabled/, 'legacy decrypt should fail when disabled');
  } catch (error) {
    if (!String(error.message || '').includes('crypto-js dependency is required')) throw error;
    console.log('legacy crypto test skipped: crypto-js dependency is not installed in current environment');
  }

  console.log('security.test.js passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
