const crypto = require('crypto');
let CryptoJS = null;
try {
  CryptoJS = require('crypto-js');
} catch (error) {
  CryptoJS = null;
}

const AES_GCM_TYPE = 'aes-256-gcm-v1';
const LEGACY_TYPE = 'legacy';
const FIXED_IV_TYPE = 'aes-128-cbc-fixed';
const DEFAULT_PBKDF2_ITERATIONS = 120000;

function normalizeCryptoType(cryptoType) {
  return String(cryptoType || '').trim().toLowerCase() || LEGACY_TYPE;
}

function cookieEncrypt(uuid, data, password, cryptoType = AES_GCM_TYPE) {
  const dataToEncrypt = typeof data === 'string' ? data : JSON.stringify(data);
  const normalized = normalizeCryptoType(cryptoType);

  if (normalized === AES_GCM_TYPE) {
    return encryptAes256Gcm(uuid, dataToEncrypt, password);
  }

  if (normalized === FIXED_IV_TYPE) {
    return encryptFixedIv(uuid, dataToEncrypt, password);
  }

  return encryptLegacy(uuid, dataToEncrypt, password);
}

function cookieDecrypt(uuid, encrypted, password, cryptoType = LEGACY_TYPE, options = {}) {
  const data = decryptToString(uuid, encrypted, password, cryptoType, options);
  return JSON.parse(data);
}

function decryptToString(uuid, encrypted, password, cryptoType = LEGACY_TYPE, options = {}) {
  const normalized = normalizeCryptoType(cryptoType);
  const enableLegacyRead = options.enableLegacyRead !== false;

  if (normalized === AES_GCM_TYPE) {
    return decryptAes256Gcm(uuid, encrypted, password);
  }

  if (!enableLegacyRead) {
    throw new Error('Legacy crypto is disabled by server config');
  }

  if (normalized === FIXED_IV_TYPE) {
    return decryptFixedIv(uuid, encrypted, password);
  }

  return decryptLegacy(uuid, encrypted, password);
}

function encryptAes256Gcm(uuid, plainText, password, iterations = DEFAULT_PBKDF2_ITERATIONS) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveAesGcmKey(uuid, password, salt, iterations);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plainText, 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    v: AES_GCM_TYPE,
    i: iterations,
    s: salt.toString('base64'),
    n: iv.toString('base64'),
    c: Buffer.concat([encrypted, tag]).toString('base64')
  });
}

function decryptAes256Gcm(uuid, encrypted, password) {
  const payload = parseAesGcmPayload(encrypted);
  const salt = Buffer.from(payload.s, 'base64');
  const iv = Buffer.from(payload.n, 'base64');
  const cipherAndTag = Buffer.from(payload.c, 'base64');

  if (cipherAndTag.length <= 16) {
    throw new Error('Invalid AES-GCM payload length');
  }

  const tag = cipherAndTag.subarray(cipherAndTag.length - 16);
  const cipherText = cipherAndTag.subarray(0, cipherAndTag.length - 16);
  const key = deriveAesGcmKey(uuid, password, salt, payload.i);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const plain = Buffer.concat([decipher.update(cipherText), decipher.final()]);
  return plain.toString('utf8');
}

function parseAesGcmPayload(encrypted) {
  const payload = typeof encrypted === 'string' ? JSON.parse(encrypted) : encrypted;
  if (!payload || typeof payload !== 'object') throw new Error('Invalid AES-GCM payload');

  if (payload.v !== AES_GCM_TYPE) throw new Error(`Unsupported AES-GCM version: ${payload.v}`);
  if (typeof payload.s !== 'string' || typeof payload.n !== 'string' || typeof payload.c !== 'string') {
    throw new Error('Malformed AES-GCM payload');
  }

  const iterations = Number.parseInt(payload.i, 10);
  if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 1000000) {
    throw new Error('Invalid PBKDF2 iterations');
  }

  return {
    v: payload.v,
    i: iterations,
    s: payload.s,
    n: payload.n,
    c: payload.c
  };
}

function deriveAesGcmKey(uuid, password, salt, iterations) {
  const material = `${uuid}-${password}`;
  return crypto.pbkdf2Sync(material, salt, iterations, 32, 'sha256');
}

function encryptFixedIv(uuid, plainText, password) {
  ensureCryptoJs();
  const hash = CryptoJS.MD5(`${uuid}-${password}`).toString();
  const theKey = hash.substring(0, 16);
  const fixedIv = CryptoJS.enc.Hex.parse('00000000000000000000000000000000');
  const options = {
    iv: fixedIv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  };
  const encrypted = CryptoJS.AES.encrypt(plainText, CryptoJS.enc.Utf8.parse(theKey), options);
  return encrypted.ciphertext.toString(CryptoJS.enc.Base64);
}

function decryptFixedIv(uuid, encrypted, password) {
  ensureCryptoJs();
  const hash = CryptoJS.MD5(`${uuid}-${password}`).toString();
  const theKey = hash.substring(0, 16);
  const fixedIv = CryptoJS.enc.Hex.parse('00000000000000000000000000000000');
  const options = {
    iv: fixedIv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  };
  return CryptoJS.AES.decrypt(encrypted, CryptoJS.enc.Utf8.parse(theKey), options).toString(CryptoJS.enc.Utf8);
}

function encryptLegacy(uuid, plainText, password) {
  ensureCryptoJs();
  const theKey = CryptoJS.MD5(`${uuid}-${password}`).toString().substring(0, 16);
  return CryptoJS.AES.encrypt(plainText, theKey).toString();
}

function decryptLegacy(uuid, encrypted, password) {
  ensureCryptoJs();
  const theKey = CryptoJS.MD5(`${uuid}-${password}`).toString().substring(0, 16);
  return CryptoJS.AES.decrypt(encrypted, theKey).toString(CryptoJS.enc.Utf8);
}

function ensureCryptoJs() {
  if (!CryptoJS) {
    throw new Error('crypto-js dependency is required for legacy crypto support');
  }
}

module.exports = {
  AES_GCM_TYPE,
  LEGACY_TYPE,
  FIXED_IV_TYPE,
  normalizeCryptoType,
  cookieEncrypt,
  cookieDecrypt,
  decryptToString,
  encryptAes256Gcm,
  decryptAes256Gcm
};
