import CryptoJS from 'crypto-js';
import { gzip } from 'pako';

interface CookieData {
  [domain: string]: any[];
}

interface LocalStorageData {
  [key: string]: any;
}

interface UploadPayload {
  uuid: string;
  password: string;
  endpoint: string;
  domains?: string;
  blacklist?: string;
  with_storage?: number;
  headers?: string;
  no_cache?: number;
  expire_minutes?: number;
  crypto_type?: string;
  auth_key_id?: string;
  auth_secret?: string;
}

interface DownloadPayload {
  uuid: string;
  password: string;
  endpoint: string;
  expire_minutes?: number;
  crypto_type?: string;
  auth_key_id?: string;
  auth_secret?: string;
}

const AES_GCM_TYPE = 'aes-256-gcm-v1';
const FIXED_IV_TYPE = 'aes-128-cbc-fixed';
const LEGACY_TYPE = 'legacy';
const PBKDF2_ITERATIONS = 120000;
const FETCH_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const id = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(id);
  }
}

function is_firefox(): boolean {
  return navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
}

export async function browser_set(key: string, value: any): Promise<void> {
  return await browser.storage.local.set({ [key]: value });
}

export async function browser_get(key: string): Promise<any> {
  const result = await browser.storage.local.get(key);
  if (result[key] === undefined) return null;
  else return result[key];
}

export async function browser_remove(key: string): Promise<void> {
  return await browser.storage.local.remove(key);
}

export async function storage_set(key: string, value: any): Promise<boolean> {
  try {
    await browser.storage.local.set({ [key]: value });
    return true;
  } catch (error) {
    return false;
  }
}

export async function storage_get(key: string): Promise<any> {
  try {
    const result = await browser.storage.local.get([key]);
    return result[key] === undefined ? null : result[key];
  } catch (error) {
    return null;
  }
}

export async function storage_remove(key: string): Promise<any> {
  try {
    await browser.storage.local.remove([key]);
    return true;
  } catch (error) {
    return false;
  }
}

export async function browser_load_all(prefix: string | null = null): Promise<any> {
  const result = await browser.storage.local.get(null);
  let ret = result;
  if (prefix) {
    ret = {};
    for (let key in result) {
      if (key.startsWith(prefix)) {
        ret[key.substring(prefix.length)] = JSON.parse(result[key] as string) ?? result[key];
      }
    }
  }
  return ret;
}

export async function load_all(prefix: string | null = null): Promise<any> {
  try {
    const result = await browser.storage.local.get(null);
    let ret = result;
    if (prefix) {
      ret = {};
      for (let key in result) {
        if (key.startsWith(prefix)) {
          const value = result[key];
          ret[key.substring(prefix.length)] = typeof value === 'string' ? (JSON.parse(value) ?? value) : value;
        }
      }
    }
    return ret;
  } catch (error) {
    return {};
  }
}

export async function load_data(key: string): Promise<any> {
  const data = browser?.storage ? await browser_get(key) : window.localStorage.getItem(key);
  try {
    return JSON.parse(data as string);
  } catch (error) {
    return data || [];
  }
}

export async function remove_data(key: string): Promise<any> {
  const ret = browser?.storage ? await browser_remove(key) : window.localStorage.removeItem(key);
  return ret;
}

export async function save_data(key: string, data: any): Promise<any> {
  const ret = browser?.storage ? await browser_set(key, JSON.stringify(data)) : window.localStorage.setItem(key, JSON.stringify(data));
  return ret;
}

export async function upload_cookie(payload: UploadPayload): Promise<any> {
  const { uuid, password } = payload;

  if (!password || !uuid) {
    showBadge("err");
    return { action: 'error', note: 'Invalid parameters' };
  }

  if (!payload.auth_key_id || !payload.auth_secret) {
    showBadge('err');
    return { action: 'error', note: browser.i18n.getMessage('authConfigRequired') || 'Auth Key ID and Auth Secret are required' };
  }

  const domains = payload.domains?.trim().length ? payload.domains.trim().split("\n") : [];
  const blacklist = payload.blacklist?.trim().length ? payload.blacklist.trim().split("\n") : [];

  const cookies = await get_cookie_by_domains(domains, blacklist);
  const with_storage = payload['with_storage'] || 0;
  const local_storages = with_storage ? await get_local_storage_by_domains(domains) : {};

  const data_to_encrypt = JSON.stringify({ "cookie_data": cookies, "local_storage_data": local_storages, "update_time": new Date() });
  const crypto_type = payload.crypto_type || AES_GCM_TYPE;
  const encrypted = await cookie_encrypt(payload.uuid, data_to_encrypt, payload.password, crypto_type);
  const endpoint = payload.endpoint.trim().replace(/\/+$/, '') + '/update';

  const sha256 = CryptoJS.SHA256(uuid + "-" + password + "-" + endpoint + "-" + data_to_encrypt).toString();
  const last_uploaded_info = await load_data('LAST_UPLOADED_COOKIE');
  if ((!payload.no_cache || parseInt(payload.no_cache.toString()) < 1) && last_uploaded_info && last_uploaded_info.sha256 === sha256 && new Date().getTime() - last_uploaded_info.timestamp < 1000 * 60 * 60 * 24) {
    return { action: 'done', note: 'Local Cookie data unchanged, not uploading' };
  }

  const payload2 = {
    uuid: payload.uuid,
    encrypted: encrypted,
    crypto_type: crypto_type
  };

  try {
    showBadge("↑", "green");

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip',
      ...parseExtraHeaders(payload.headers),
      ...buildSignedHeaders(payload, 'POST', endpoint, uuid, payload2)
    };

    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers,
      body: gzip(JSON.stringify(payload2)) as any
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      if (result && typeof result === 'object') return result;
      return { action: 'error', note: `HTTP ${response.status}` };
    }
    if (!result || typeof result !== 'object') {
      return { action: 'error', note: 'Invalid server response' };
    }

    if (result && result.action === 'done') {
      await save_data('LAST_UPLOADED_COOKIE', { "timestamp": new Date().getTime(), "sha256": sha256 });
    }

    return result;
  } catch (error) {
    console.log("error", error);
    showBadge("err");
    const isAbort = !!error && typeof error === 'object' && (error as any).name === 'AbortError';
    const message = isAbort ? 'Request timeout' : (error instanceof Error ? error.message : String(error || ''));
    return { action: 'error', note: message || 'Network error' };
  }
}

export async function download_cookie(payload: DownloadPayload): Promise<any> {
  const { uuid, password, expire_minutes, crypto_type } = payload;

  if (!payload.auth_key_id || !payload.auth_secret) {
    showBadge('err');
    return { action: 'error', note: browser.i18n.getMessage('authConfigRequired') || 'Auth Key ID and Auth Secret are required' };
  }

  let endpoint = payload.endpoint.trim().replace(/\/+$/, '') + '/get/' + uuid;
  if (crypto_type) {
    endpoint += `?crypto_type=${crypto_type}`;
  }

  try {
    showBadge("↓", "blue");

    const response = await fetchWithTimeout(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...buildSignedHeaders(payload, 'GET', endpoint, uuid, '')
      }
    });

    const result = await response.json().catch(() => null);
    if (!response.ok || !result) {
      return { action: 'error', note: result?.message || `HTTP ${response.status}` };
    }

    if (result && result.encrypted) {
      const useCryptoType = normalizeCryptoType(crypto_type || result.crypto_type || LEGACY_TYPE);
      const { cookie_data, local_storage_data } = await cookie_decrypt(uuid, result.encrypted, password, useCryptoType);
      let action = 'done';
      if (cookie_data) {
        for (let domain in cookie_data) {
          if (Array.isArray(cookie_data[domain])) {
            for (let cookie of cookie_data[domain]) {
              let new_cookie: any = {};
              ['name', 'value', 'domain', 'path', 'secure', 'httpOnly', 'sameSite'].forEach(key => {
                if (key == 'sameSite' && cookie[key].toLowerCase() == 'unspecified' && is_firefox()) {
                  new_cookie['sameSite'] = 'no_restriction';
                } else {
                  new_cookie[key] = cookie[key];
                }
              });
              if (expire_minutes) {
                const now = parseInt((new Date().getTime() / 1000).toString());
                new_cookie.expirationDate = now + parseInt(expire_minutes.toString()) * 60;
              }
              new_cookie.url = buildUrl(cookie.secure, cookie.domain, cookie.path);
              try {
                await browser.cookies.set(new_cookie);
              } catch (error) {
                showBadge("err");
                console.log("set cookie error", error);
              }
            }
          }
        }
      } else {
        action = 'false';
      }

      if (local_storage_data) {
        for (let domain in local_storage_data) {
          const key = 'LS-' + domain;
          await save_data(key, local_storage_data[domain]);
        }
      }

      return { action };
    }
  } catch (error) {
    console.log("error", error);
    showBadge("err");
    const isAbort = !!error && typeof error === 'object' && (error as any).name === 'AbortError';
    const message = isAbort ? 'Request timeout' : (error instanceof Error ? error.message : String(error || ''));
    return { action: 'error', note: message || 'Network error' };
  }
}

function normalizeCryptoType(cryptoType: string | undefined): string {
  return String(cryptoType || '').trim().toLowerCase() || LEGACY_TYPE;
}

async function cookie_decrypt(uuid: string, encrypted: string, password: string, crypto_type: string = LEGACY_TYPE): Promise<any> {
  const normalized = normalizeCryptoType(crypto_type);

  if (normalized === AES_GCM_TYPE) {
    const payload = JSON.parse(encrypted);
    const iterations = Number.parseInt(String(payload.i), 10);
    if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 1000000) {
      throw new Error('Invalid PBKDF2 iterations');
    }

    const salt = base64ToBytes(payload.s);
    const iv = base64ToBytes(payload.n);
    const cipherBytes = base64ToBytes(payload.c);
    const key = await deriveAesGcmKey(uuid, password, salt, iterations);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBytes);
    return JSON.parse(new TextDecoder().decode(decrypted));
  }

  const hash = CryptoJS.MD5(uuid + '-' + password).toString();
  const the_key = hash.substring(0, 16);

  if (normalized === FIXED_IV_TYPE) {
    const fixedIv = CryptoJS.enc.Hex.parse('00000000000000000000000000000000');
    const options = {
      iv: fixedIv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    };
    const decrypted = CryptoJS.AES.decrypt(encrypted, CryptoJS.enc.Utf8.parse(the_key), options).toString(CryptoJS.enc.Utf8);
    return JSON.parse(decrypted);
  }

  const decrypted = CryptoJS.AES.decrypt(encrypted, the_key).toString(CryptoJS.enc.Utf8);
  return JSON.parse(decrypted);
}

async function cookie_encrypt(uuid: string, data: string, password: string, crypto_type: string = AES_GCM_TYPE): Promise<string> {
  const normalized = normalizeCryptoType(crypto_type);

  if (normalized === AES_GCM_TYPE) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveAesGcmKey(uuid, password, salt, PBKDF2_ITERATIONS);
    const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(data));

    return JSON.stringify({
      v: AES_GCM_TYPE,
      i: PBKDF2_ITERATIONS,
      s: bytesToBase64(salt),
      n: bytesToBase64(iv),
      c: bytesToBase64(new Uint8Array(cipherBuffer))
    });
  }

  const hash = CryptoJS.MD5(uuid + '-' + password).toString();
  const the_key = hash.substring(0, 16);

  if (normalized === FIXED_IV_TYPE) {
    const fixedIv = CryptoJS.enc.Hex.parse('00000000000000000000000000000000');
    const options = {
      iv: fixedIv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    };
    const encrypted = CryptoJS.AES.encrypt(data, CryptoJS.enc.Utf8.parse(the_key), options);
    return encrypted.ciphertext.toString(CryptoJS.enc.Base64);
  }

  const encrypted = CryptoJS.AES.encrypt(data, the_key).toString();
  return encrypted;
}

async function deriveAesGcmKey(uuid: string, password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`${uuid}-${password}`),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256'
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function buildSignedHeaders(payload: UploadPayload | DownloadPayload, method: string, endpoint: string, uuid: string, body: any): Record<string, string> {
  const keyId = String(payload.auth_key_id || '').trim();
  const secret = String(payload.auth_secret || '').trim();

  if (!keyId || !secret) {
    throw new Error('missing auth config');
  }

  const target = new URL(endpoint);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = generateNonce(16);
  const bodyHash = method.toUpperCase() === 'GET' ? CryptoJS.SHA256('').toString() : hashBody(body);

  const signaturePayload = [
    method.toUpperCase(),
    target.pathname || '/',
    uuid,
    timestamp,
    nonce,
    bodyHash
  ].join('\n');

  const signature = CryptoJS.HmacSHA256(signaturePayload, secret).toString();

  return {
    'X-CC-Key-Id': keyId,
    'X-CC-Timestamp': timestamp,
    'X-CC-Nonce': nonce,
    'X-CC-Signature': signature
  };
}

function parseExtraHeaders(rawHeaders?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!rawHeaders || !rawHeaders.trim()) return headers;

  const rows = rawHeaders.trim().split('\n');
  for (const row of rows) {
    const index = row.indexOf(':');
    if (index <= 0) continue;
    const key = row.slice(0, index).trim();
    const value = row.slice(index + 1).trim();
    if (!key || !value) continue;
    headers[key] = value;
  }

  return headers;
}

function hashBody(body: any): string {
  if (body === null || body === undefined || body === '') return CryptoJS.SHA256('').toString();
  if (typeof body === 'string') return CryptoJS.SHA256(body).toString();
  return CryptoJS.SHA256(stableStringify(body)).toString();
}

function stableStringify(value: any): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;

  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }

  return JSON.stringify(value);
}

function generateNonce(length: number = 16): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes).map((item) => item.toString(16).padStart(2, '0')).join('');
}

export async function get_local_storage_by_domains(domains: string[] = []): Promise<LocalStorageData> {
  let ret_storage: LocalStorageData = {};
  const local_storages = await browser_load_all('LS-');
  if (Array.isArray(domains) && domains.length > 0) {
    for (const domain of domains) {
      for (const key in local_storages) {
        if (key.indexOf(domain) >= 0) {
          ret_storage[key] = local_storages[key];
        }
      }
    }
  }
  return ret_storage;
}

async function get_cookie_by_domains(domains: string[] = [], blacklist: string[] = []): Promise<CookieData> {
  let ret_cookies: CookieData = {};
  if (browser.cookies) {
    const cookies = await browser.cookies.getAll({ partitionKey: {} });
    if (Array.isArray(domains) && domains.length > 0) {
      for (const domain of domains) {
        ret_cookies[domain] = [];
        for (const cookie of cookies) {
          if (cookie.domain?.includes(domain)) {
            ret_cookies[domain].push(cookie);
          }
        }
      }
    }
    else {
      for (const cookie of cookies) {
        if (cookie.domain) {
          let in_blacklist = false;
          for (const black of blacklist) {
            if (cookie.domain.includes(black)) {
              in_blacklist = true;
            }
          }

          if (!in_blacklist) {
            if (!ret_cookies[cookie.domain]) {
              ret_cookies[cookie.domain] = [];
            }
            ret_cookies[cookie.domain].push(cookie);
          }
        }
      }
    }
  }

  return ret_cookies;
}

function buildUrl(secure: boolean, domain: string, path: string): string {
  if (domain.startsWith('.')) {
    domain = domain.substr(1);
  }
  return `http${secure ? 's' : ''}://${domain}${path}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function showBadge(text: string, color: string = "red", delay: number = 5000): void {
  (browser.action ?? browser.browserAction).setBadgeText({ text: text });
  (browser.action ?? browser.browserAction).setBadgeBackgroundColor({ color: color });
  setTimeout(() => {
    (browser.action ?? browser.browserAction).setBadgeText({ text: '' });
  }, delay);
}
