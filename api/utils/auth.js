const crypto = require('crypto');
let logger = console;
try {
  logger = require('./logger');
} catch (error) {
  logger = console;
}

const DEFAULT_HMAC_TTL_SEC = 300;
const DEFAULT_NONCE_TTL_MS = 10 * 60 * 1000;

function parseHmacKeys(raw) {
  const result = new Map();
  const pairs = String(raw || '').split(',').map((item) => item.trim()).filter(Boolean);

  for (const pair of pairs) {
    const separatorIndex = pair.indexOf(':');
    if (separatorIndex <= 0) continue;

    const keyId = pair.slice(0, separatorIndex).trim();
    const secret = pair.slice(separatorIndex + 1).trim();
    if (!keyId || !secret) continue;

    result.set(keyId, secret);
  }

  return result;
}

function stableStringify(value) {
  if (value === null || value === undefined) return 'null';

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }

  return JSON.stringify(value);
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function computeBodyHash(body) {
  if (body === undefined || body === null || body === '') return sha256Hex('');
  if (Buffer.isBuffer(body)) return sha256Hex(body);
  if (typeof body === 'string') return sha256Hex(body);
  return sha256Hex(stableStringify(body));
}

function buildSignatureString({ method, path, uuid, timestamp, nonce, bodyHash }) {
  return [
    String(method || '').toUpperCase(),
    String(path || '/'),
    String(uuid || ''),
    String(timestamp || ''),
    String(nonce || ''),
    String(bodyHash || sha256Hex(''))
  ].join('\n');
}

function signSignatureString(signatureString, secret) {
  return crypto.createHmac('sha256', secret).update(signatureString).digest('hex');
}

function createNonceStore(ttlMs = DEFAULT_NONCE_TTL_MS) {
  const store = new Map();

  function cleanup(now) {
    if (store.size < 1000) return;

    for (const [key, expireAt] of store.entries()) {
      if (expireAt <= now) store.delete(key);
    }
  }

  function claim(key, now = Date.now()) {
    cleanup(now);

    const existsUntil = store.get(key);
    if (existsUntil && existsUntil > now) return false;

    store.set(key, now + ttlMs);
    return true;
  }

  return { claim };
}

function createHmacAuthMiddleware(options = {}) {
  const hmacKeys = options.keys instanceof Map
    ? options.keys
    : parseHmacKeys(options.keys || process.env.CC_HMAC_KEYS);

  const ttlSec = toSafeInt(options.ttlSec || process.env.CC_HMAC_TTL_SEC, DEFAULT_HMAC_TTL_SEC, 30, 3600);
  const nonceTtlMs = toSafeInt(options.nonceTtlMs, DEFAULT_NONCE_TTL_MS, 60 * 1000, 60 * 60 * 1000);
  const nonceStore = createNonceStore(nonceTtlMs);
  const log = options.logger || logger;

  return function hmacAuthMiddleware(req, res, next) {
    if (hmacKeys.size === 0) {
      log.error('CC_HMAC_KEYS is not configured. Request rejected.');
      res.status(503).json({ error: 'Service Unavailable', message: 'HMAC keys are not configured on server' });
      return;
    }

    const keyId = String(req.headers['x-cc-key-id'] || '').trim();
    const timestamp = String(req.headers['x-cc-timestamp'] || '').trim();
    const nonce = String(req.headers['x-cc-nonce'] || '').trim();
    const signature = String(req.headers['x-cc-signature'] || '').trim().toLowerCase();

    if (!keyId || !timestamp || !nonce || !signature) {
      res.status(401).json({ error: 'Unauthorized', message: 'Missing signature headers' });
      return;
    }

    const secret = hmacKeys.get(keyId);
    if (!secret) {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid key id' });
      return;
    }

    const unixTimestamp = Number.parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(unixTimestamp) || Math.abs(now - unixTimestamp) > ttlSec) {
      res.status(401).json({ error: 'Unauthorized', message: 'Signature timestamp expired or invalid' });
      return;
    }

    if (nonce.length < 16 || nonce.length > 128) {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid nonce length' });
      return;
    }

    if (!/^[a-f0-9]{64}$/.test(signature)) {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid signature format' });
      return;
    }

    const uuid = extractUuid(req);
    if (!uuid) {
      res.status(400).json({ error: 'Bad Request', message: 'Missing uuid for signature verification' });
      return;
    }

    const bodyForHash = req.method === 'GET' || req.method === 'HEAD' ? '' : (req.body || '');
    const bodyHash = computeBodyHash(bodyForHash);

    const signatureString = buildSignatureString({
      method: req.method,
      path: req.path,
      uuid,
      timestamp,
      nonce,
      bodyHash
    });

    const expectedSignature = signSignatureString(signatureString, secret);
    if (!safeCompare(expectedSignature, signature)) {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid signature' });
      return;
    }

    if (!nonceStore.claim(`${keyId}:${nonce}`)) {
      res.status(409).json({ error: 'Conflict', message: 'Nonce already used' });
      return;
    }

    next();
  };
}

function extractUuid(req) {
  if (req.params && req.params.uuid) return String(req.params.uuid);
  if (req.body && req.body.uuid) return String(req.body.uuid);
  if (req.query && req.query.uuid) return String(req.query.uuid);
  return '';
}

function safeCompare(expected, actual) {
  const a = Buffer.from(String(expected || ''), 'utf8');
  const b = Buffer.from(String(actual || ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function toSafeInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

module.exports = {
  parseHmacKeys,
  stableStringify,
  sha256Hex,
  computeBodyHash,
  buildSignatureString,
  signSignatureString,
  createHmacAuthMiddleware
};
