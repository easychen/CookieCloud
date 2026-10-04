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
}

interface DownloadPayload {
  uuid: string;
  password: string;
  endpoint: string;
  expire_minutes?: number;
  crypto_type?: string;
  headers?: string;
}

export interface UploadedRecord {
  uuid: string;
  crypto_type: string;
  data?: { cookie_data: CookieData; local_storage_data?: LocalStorageData; update_time?: string };
  error?: string;
  source_encrypted?: string;
}

export function is_host_only_cookie(cookie: { domain?: string; hostOnly?: boolean }): boolean {
  // Chrome exports domain cookies with a leading dot. Never broaden a stored
  // bare hostname because an old or imported hostOnly flag is inconsistent.
  return cookie.hostOnly === true || !String(cookie.domain || '').startsWith('.');
}

export function cookie_identity(cookie: any): string {
  return JSON.stringify([
    cookie.name, cookie.domain, cookie.path || '/', is_host_only_cookie(cookie), cookie.storeId || '',
    cookie.partitionKey?.topLevelSite || '', cookie.partitionKey?.hasCrossSiteAncestor ?? null, cookie.firstPartyDomain || '',
  ]);
}

export async function apply_browser_cookie_value(cookie: any, value: string): Promise<void> {
  const details: any = { url: buildUrl(cookie.secure, cookie.domain, cookie.path || '/'), name: cookie.name, value };
  for (const key of ['path', 'secure', 'httpOnly', 'sameSite', 'partitionKey', 'storeId', 'expirationDate', 'firstPartyDomain']) {
    if (cookie[key] !== undefined && cookie[key] !== null) details[key] = cookie[key];
  }
  if (!is_host_only_cookie(cookie)) details.domain = cookie.domain;
  const saved = await browser.cookies.set(details);
  if (!saved || saved.value !== value || is_host_only_cookie(saved) !== is_host_only_cookie(cookie) || saved.domain !== cookie.domain) {
    throw new Error('浏览器未按原域名和范围保存 Cookie，请检查本地 Cookie');
  }
}

export async function read_page_cookies(tabId: number): Promise<{ url: string; storeId: string; cookies: any[] }> {
  if (!Number.isSafeInteger(tabId) || tabId < 0) throw new Error('页面标签 ID 无效');
  const tab = await browser.tabs.get(tabId);
  const url = new URL(tab.url || '');
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('当前页面不是可读取 Cookie 的 HTTP/HTTPS 网页');
  const stores = await browser.cookies.getAllCookieStores();
  const storeId = stores.find(store => store.tabIds.includes(tabId))?.id;
  if (!storeId) throw new Error('无法确定当前页面的 Cookie 存储，请刷新网站页面后重试');
  return { url: url.href, storeId, cookies: await browser.cookies.getAll({ url: url.href, storeId }) };
}

export interface ServerKeepAliveStatus {
  enabled: boolean;
  rules: { url: string; interval: number; verify_tls?: boolean; next_run: number; last_run: number | null; last_status: number | null; last_error: string | null }[];
}

export async function server_keep_alive(payload: UploadPayload, rules?: { url: string; interval: number; verify_tls?: boolean }[], enabled = true): Promise<ServerKeepAliveStatus> {
  if (!payload.endpoint.trim() || !payload.uuid) throw new Error('请先填写服务器地址和 UUID');
  const response = await fetch(`${payload.endpoint.trim().replace(/\/+$/, '')}/keep-alive/${encodeURIComponent(payload.uuid)}`, {
    method: rules ? 'POST' : 'GET',
    headers: { ...request_headers(payload.headers || ''), 'Content-Type': 'application/json' },
    cache: 'no-store',
    ...(rules ? { body: JSON.stringify({ password: payload.password, rules, enabled }) } : {}),
  });
  let result: any;
  try { result = await response.json(); } catch { throw new Error('服务端尚未支持保活任务，请更新服务端'); }
  if (!response.ok) throw new Error(result.error || `服务端保活配置失败：HTTP ${response.status}`);
  if (typeof result.enabled !== 'boolean' || !Array.isArray(result.rules)) throw new Error('服务端返回的保活任务格式无效');
  return result;
}

export async function upload_page_cookies(payload: UploadPayload, cookies: any[]): Promise<void> {
  if (!payload.endpoint || !payload.uuid || (payload.crypto_type !== 'none' && !payload.password)) throw new Error('请先填写服务器地址、UUID 和密码');
  if (!cookies.length) throw new Error('当前页面没有可上传的 Cookie');
  if (!['none', 'legacy', 'aes-128-cbc-fixed'].includes(payload.crypto_type || 'legacy')) throw new Error('不支持的加密算法');
  const base = payload.endpoint.trim().replace(/\/+$/, '');
  const headers = request_headers(payload.headers || '');
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`${base}/get/${encodeURIComponent(payload.uuid)}`, { headers, cache: 'no-store' });
    let data: any = { cookie_data: {}, local_storage_data: {} };
    let expected: string | undefined;
    let mode = payload.crypto_type || 'legacy';
    if (response.ok) {
      const record = await response.json();
      mode = record.crypto_type || 'legacy';
      if (!['none', 'legacy', 'aes-128-cbc-fixed'].includes(mode)) throw new Error('不支持服务端记录的加密算法');
      if (mode !== 'none' && !payload.password) throw new Error('服务端记录已加密，请填写对应密码');
      try { data = cookie_decrypt(payload.uuid, record.encrypted, payload.password, mode); }
      catch { throw new Error('无法解密服务端已有记录，请检查密码'); }
      if (!data?.cookie_data || typeof data.cookie_data !== 'object' || Array.isArray(data.cookie_data)) throw new Error('服务端 Cookie 数据格式无效');
      expected = record.encrypted;
    } else if (response.status !== 404) {
      throw new Error(`读取服务端记录失败：HTTP ${response.status}`);
    }
    // Replace only matching identities, including copies in keyword groups.
    const updates = new Map(cookies.map(cookie => [cookie_identity(cookie), cookie]));
    for (const entries of Object.values(data.cookie_data)) {
      if (!Array.isArray(entries)) throw new Error('服务端 Cookie 数据格式无效');
      for (let i = 0; i < entries.length; i++) {
        const updated = updates.get(cookie_identity(entries[i]));
        if (updated) entries[i] = { ...updated };
      }
    }
    for (const cookie of cookies) {
      const exists = Object.values(data.cookie_data).some((entries: any) => entries.some((item: any) => cookie_identity(item) === cookie_identity(cookie)));
      if (!exists) (data.cookie_data[cookie.domain] ||= []).push({ ...cookie });
    }
    data.update_time = new Date().toISOString();
    const encrypted = cookie_encrypt(payload.uuid, JSON.stringify(data), payload.password, mode);
    const saved = await fetch(base + '/update', {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid: payload.uuid, crypto_type: mode, encrypted, expected_encrypted: expected }),
    });
    if (saved.status === 409) continue;
    if (!saved.ok) throw new Error(`上传失败：HTTP ${saved.status}`);
    if ((await saved.json()).action !== 'done') throw new Error('服务器未确认保存成功');
    return;
  }
  throw new Error('服务端记录正在频繁更新，请稍后重试');
}

export interface ClearCookiesResult {
  action: string;
  cleared_uuids: number;
  deleted_cookies: number;
  skipped: { uuid: string; error: string }[];
}

export async function clear_uploaded_cookies(endpoint: string, password: string, extraHeaders: string = ''): Promise<ClearCookiesResult> {
  const response = await fetch(endpoint.trim().replace(/\/+$/, '') + '/records/clear-cookies', {
    method: 'POST',
    headers: { ...request_headers(extraHeaders), 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: 'clear-all-cookies', password }),
  });
  if (!response.ok) throw new Error(response.status === 404 ? '服务端尚未支持清理，请更新服务端。' : `清理失败：HTTP ${response.status}`);
  const result = await response.json();
  if (result.action !== 'done' || !Array.isArray(result.skipped)) throw new Error('服务器未确认清理结果');
  return result;
}

function request_headers(extraHeaders: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of extraHeaders.split('\n')) {
    if (!line.trim()) continue;
    const colon = line.indexOf(':');
    if (colon < 1) throw new Error('请求 Header 格式应为 Key:Value');
    headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return headers;
}

export async function query_uploaded_cookies(endpoint: string, password: string, extraHeaders: string = ''): Promise<UploadedRecord[]> {
  const headers = request_headers(extraHeaders);
  const response = await fetch(endpoint.trim().replace(/\/+$/, '') + '/records', { headers, cache: 'no-store' });
  if (!response.ok) throw new Error(response.status === 404 ? '服务端尚未支持查询，请更新服务端。' : `查询失败：HTTP ${response.status}`);
  const result = await response.json();
  if (!Array.isArray(result.records)) throw new Error('服务端返回的记录格式无效');
  return result.records.map((record: any) => {
    const crypto_type = record.crypto_type || 'legacy';
    if (!record.error && crypto_type !== 'none' && !password) {
      return { uuid: record.uuid, crypto_type, error: '此记录已加密，请填写对应密码后重新查询' };
    }
    try {
      if (record.error) throw new Error('服务端记录无法读取');
      if (!['none', 'legacy', 'aes-128-cbc-fixed'].includes(crypto_type)) throw new Error('不支持的加密算法');
      const data = cookie_decrypt(record.uuid, record.encrypted, password, crypto_type);
      if (!data || typeof data.cookie_data !== 'object' || data.cookie_data === null) throw new Error('Cookie 数据格式无效');
      return { uuid: record.uuid, crypto_type, data, source_encrypted: record.encrypted };
    } catch (error) {
      return { uuid: record.uuid, crypto_type, error: record.error ? '服务端记录无法读取' : (crypto_type === 'none' ? '明文数据格式无效' : '无法解密，请检查此 UUID 对应的密码') };
    }
  });
}

export async function update_uploaded_cookie(endpoint: string, password: string, extraHeaders: string, record: UploadedRecord, domain: string, index: number, value: string): Promise<UploadedRecord> {
  return change_uploaded_cookie(endpoint, password, extraHeaders, record, domain, index, value);
}

export async function delete_uploaded_cookie(endpoint: string, password: string, extraHeaders: string, record: UploadedRecord, domain: string, index: number): Promise<UploadedRecord> {
  return change_uploaded_cookie(endpoint, password, extraHeaders, record, domain, index, null);
}

async function change_uploaded_cookie(endpoint: string, password: string, extraHeaders: string, record: UploadedRecord, domain: string, index: number, value: string | null): Promise<UploadedRecord> {
  if (!record.data || record.source_encrypted === undefined) throw new Error('请先重新查询记录');
  if (!['none', 'legacy', 'aes-128-cbc-fixed'].includes(record.crypto_type)) throw new Error('不支持的加密算法');
  if (record.crypto_type !== 'none' && !password) throw new Error('请填写此 UUID 对应的密码');
  const cookies = record.data.cookie_data[domain];
  if (!Array.isArray(cookies) || !Number.isInteger(index) || index < 0 || !cookies[index]) throw new Error('Cookie 不存在，请重新查询');
  const original = cookies[index];
  const identity = cookie_identity;
  const key = identity(original);
  const headers = request_headers(extraHeaders);
  const base = endpoint.trim().replace(/\/+$/, '');
  for (let attempt = 0; attempt < 3; attempt++) {
    const latestResponse = await fetch(base + '/get/' + encodeURIComponent(record.uuid), { headers, cache: 'no-store' });
    if (!latestResponse.ok) throw new Error(`读取最新记录失败：HTTP ${latestResponse.status}`);
    const latest = await latestResponse.json();
    const mode = latest.crypto_type || 'legacy';
    if (!['none', 'legacy', 'aes-128-cbc-fixed'].includes(mode)) throw new Error('不支持的加密算法');
    if (mode !== 'none' && !password) throw new Error('请填写此 UUID 对应的密码');
    let data: any;
    try { data = cookie_decrypt(record.uuid, latest.encrypted, password, mode); }
    catch { throw new Error('无法读取最新数据，请检查密码并重新查询'); }
    // Locate the cookie by scope, path, store and partition, rather than an old array position.
    const matches = Object.values(data.cookie_data || {}).flatMap((entries: any) => Array.isArray(entries) ? entries.filter((cookie: any) => identity(cookie) === key) : []);
    const current: UploadedRecord = { uuid: record.uuid, crypto_type: mode, data, source_encrypted: latest.encrypted };
    if (value === null && !matches.length) return current;
    if (!matches.length) throw new Error('目标 Cookie 已不存在，请重新查询');
    if (matches.some(cookie => cookie.value !== original.value && cookie.value !== value)) throw new Error('目标 Cookie 的值已被其他同步修改，请重新查询后再操作');
    if (matches.every(cookie => cookie.value === value)) return current;
    if (value === null) {
      for (const [group, entries] of Object.entries(data.cookie_data)) {
        if (Array.isArray(entries)) data.cookie_data[group] = entries.filter(cookie => identity(cookie) !== key);
      }
    } else {
      for (const cookie of matches) {
        cookie.value = value;
        cookie.hostOnly = is_host_only_cookie(cookie);
      }
    }
    data.update_time = new Date().toISOString();
    const encrypted = cookie_encrypt(record.uuid, JSON.stringify(data), password, mode);
    const response = await fetch(base + '/update', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid: record.uuid, crypto_type: mode, encrypted, expected_encrypted: latest.encrypted }),
    });
    if (response.status === 409) continue;
    if (!response.ok) throw new Error(`上传失败：HTTP ${response.status}`);
    const result = await response.json();
    if (result.action !== 'done') throw new Error('服务器未确认保存成功');
    return { ...current, data, source_encrypted: encrypted };
  }
  throw new Error('自动上传正在频繁更新此记录，请稍后重试或暂停上传后操作');
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
  // Only return properties with keys starting with prefix
  if (prefix) {
    ret = {};
    for (let key in result) {
      if (key.startsWith(prefix)) {
        // remove prefix from key
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
    // Only return properties with keys starting with prefix
    if (prefix) {
      ret = {};
      for (let key in result) {
        if (key.startsWith(prefix)) {
           // remove prefix from key
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
  // console.log("load",key,data);
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
  // chrome.storage.local.set({key:JSON.stringify(data)});
  const ret = browser?.storage ? await browser_set(key, JSON.stringify(data)) : window.localStorage.setItem(key, JSON.stringify(data));
  return ret;
}

export async function upload_cookie(payload: UploadPayload): Promise<any> {
  const { uuid, password } = payload;
  // console.log( payload );
  // none of the fields can be empty
  if (!uuid || (payload.crypto_type !== 'none' && !password)) {
    alert("Invalid parameters");
    showBadge("err");
    return false;
  }
  const domains = payload.domains?.trim().length ? payload.domains.trim().split("\n") : [];

  const blacklist = payload.blacklist?.trim().length ? payload.blacklist.trim().split("\n") : [];

  const cookies = await get_cookie_by_domains(domains, blacklist);
  const with_storage = payload['with_storage'] || 0;
  const local_storages = with_storage ? await get_local_storage_by_domains(domains) : {};

  let headers: Record<string, string>;
  // Add authentication header
  try {
    headers = { ...request_headers(payload.headers || ''), 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' };
  } catch (error) {
    console.log("error", error);
    showBadge("err");
    return { action: 'failed', note: error instanceof Error ? error.message : String(error) };
  }
  // Encode cookie data using the selected mode
  const data_to_encrypt = JSON.stringify({ "cookie_data": cookies, "local_storage_data": local_storages, "update_time": new Date() });
  const crypto_type = payload.crypto_type || 'legacy';
  const encrypted = cookie_encrypt(payload.uuid, data_to_encrypt, payload.password, crypto_type);
  const endpoint = payload.endpoint.trim().replace(/\/+$/, '') + '/update';

  // get sha256 of the encrypted data
  const sha256 = CryptoJS.SHA256(uuid + "-" + password + "-" + endpoint + "-" + crypto_type + "-" + data_to_encrypt).toString();
  console.log("sha256", sha256);
  const last_uploaded_info = await load_data('LAST_UPLOADED_COOKIE');
  // If same content has been uploaded within 24 hours, don't upload again
  if ((!payload.no_cache || parseInt(payload.no_cache.toString()) < 1) && last_uploaded_info && last_uploaded_info.sha256 === sha256 && new Date().getTime() - last_uploaded_info.timestamp < 1000 * 60 * 60 * 24) {
    console.log("same data in 24 hours, skip1");
    return { action: 'done', note: 'Local Cookie data unchanged, not uploading' };
  }

  const payload2 = {
    uuid: payload.uuid,
    encrypted: encrypted,
    crypto_type: crypto_type
  };
  // console.log( endpoint, payload2 );
  try {
    showBadge("↑", "green");
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: gzip(JSON.stringify(payload2)) as any
    });
    if (!response.ok) throw new Error(`上传失败：HTTP ${response.status}`);
    const result = await response.json();

    if (result && result.action === 'done')
      await save_data('LAST_UPLOADED_COOKIE', { "timestamp": new Date().getTime(), "sha256": sha256 });

    return result;
  } catch (error) {
    console.log("error", error);
    showBadge("err");
    return { action: 'failed', note: error instanceof Error ? error.message : String(error) };
  }
}

export async function download_cookie(payload: DownloadPayload): Promise<any> {
  const { uuid, password, expire_minutes, crypto_type } = payload;
  let endpoint = payload.endpoint.trim().replace(/\/+$/, '') + '/get/' + encodeURIComponent(uuid);
  // 如果指定了加密算法，添加查询参数
  if (crypto_type) {
    endpoint += `?crypto_type=${crypto_type}`;
  }
  try {
    showBadge("↓", "blue");
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        ...request_headers(payload.headers || ''),
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`);
    const result = await response.json();
    if (result && result.encrypted) {
      const useCryptoType = result.crypto_type === 'none' ? 'none' : (crypto_type || result.crypto_type || 'legacy');
      const { cookie_data, local_storage_data } = cookie_decrypt(uuid, result.encrypted, password, useCryptoType);
      let action = 'done';
      const cookieErrors: string[] = [];
      if (cookie_data) {
        for (let domain in cookie_data) {
          // console.log( "domain" , cookies[domain] );
          if (Array.isArray(cookie_data[domain])) {
            for (let cookie of cookie_data[domain]) {
              let new_cookie: any = {};
              ['name', 'value', 'path', 'secure', 'httpOnly', 'sameSite', 'partitionKey'].forEach(key => {
                if (cookie[key] === undefined || cookie[key] === null) return;
                // Firefox 140+ supports unspecified. Keep it distinct from
                // no_restriction (SameSite=None), which requires Secure.
                new_cookie[key] = cookie[key];
              });
              // Chrome creates a domain cookie whenever domain is supplied.
              // Omit it for host-only cookies so restoration replaces the original scope.
              const hostOnly = is_host_only_cookie(cookie);
              if (!hostOnly) new_cookie.domain = cookie.domain;
              if (expire_minutes) {
                // Current timestamp (seconds)
                const now = parseInt((new Date().getTime() / 1000).toString());
                console.log("now", now);
                // -1 requests long-term persistence within Chrome's 400-day limit.
                const minutes = expire_minutes === -1 ? 400 * 24 * 60 : parseInt(expire_minutes.toString());
                new_cookie.expirationDate = now + minutes * 60;
                console.log("new_cookie.expirationDate", new_cookie.expirationDate);

              }
              new_cookie.url = buildUrl(cookie.secure, cookie.domain, cookie.path);

              try {
                await browser.cookies.set(new_cookie);
              } catch (error) {
                action = 'false';
                cookieErrors.push(error instanceof Error ? error.message : String(error));
                showBadge("err");
                console.log("set cookie error", error);
              }


            }
          }
        }
      } else {
        action = 'false';
      }

      console.log("local_storage_data", local_storage_data);
      if (local_storage_data) {
        for (let domain in local_storage_data) {
          const key = 'LS-' + domain;
          await save_data(key, local_storage_data[domain]);
          console.log("save local storage", key, local_storage_data[domain]);
        }
      }

      return { action, note: cookieErrors.length ? `${cookieErrors.length} 个 Cookie 写入失败：${cookieErrors[0]}` : (action !== 'done' ? '服务器数据缺少 cookie_data' : undefined) };
    }
    return { action: 'failed', note: '服务器未返回 Cookie 数据，请确认此 UUID 已上传数据' };
  } catch (error) {
    console.log("error", error);
    showBadge("err");
    return { action: 'failed', note: error instanceof Error ? error.message : String(error) };
  }
}

function cookie_decrypt(uuid: string, encrypted: string, password: string, crypto_type: string = 'legacy'): any {
  if (crypto_type === 'none') return JSON.parse(encrypted);
  const hash = CryptoJS.MD5(uuid + '-' + password).toString();
  const the_key = hash.substring(0, 16);
  
  if (crypto_type === 'aes-128-cbc-fixed') {
    // 新的标准 AES-128-CBC 算法，使用固定 IV
    const fixedIv = CryptoJS.enc.Hex.parse('00000000000000000000000000000000'); // 16字节的0
    const options = {
      iv: fixedIv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    };
    // 直接解密原始加密数据
    const decrypted = CryptoJS.AES.decrypt(encrypted, CryptoJS.enc.Utf8.parse(the_key), options).toString(CryptoJS.enc.Utf8);
    const parsed = JSON.parse(decrypted);
    return parsed;
  } else {
    // 原有的 legacy 算法
    const decrypted = CryptoJS.AES.decrypt(encrypted, the_key).toString(CryptoJS.enc.Utf8);
    const parsed = JSON.parse(decrypted);
    return parsed;
  }
}

function cookie_encrypt(uuid: string, data: string, password: string, crypto_type: string = 'legacy'): string {
  if (crypto_type === 'none') return data;
  const hash = CryptoJS.MD5(uuid + '-' + password).toString();
  const the_key = hash.substring(0, 16);
  
  if (crypto_type === 'aes-128-cbc-fixed') {
    // 新的标准 AES-128-CBC 算法，使用固定 IV
    const fixedIv = CryptoJS.enc.Hex.parse('00000000000000000000000000000000'); // 16字节的0
    const options = {
      iv: fixedIv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    };
    // 使用原始加密数据，不包含 CryptoJS 格式包装
    const encrypted = CryptoJS.AES.encrypt(data, CryptoJS.enc.Utf8.parse(the_key), options);
    return encrypted.ciphertext.toString(CryptoJS.enc.Base64);
  } else {
    // 原有的 legacy 算法
    const encrypted = CryptoJS.AES.encrypt(data, the_key).toString();
    return encrypted;
  }
}

export async function get_local_storage_by_domains(domains: string[] = []): Promise<LocalStorageData> {
  let ret_storage: LocalStorageData = {};
  const local_storages = await browser_load_all('LS-');
  if (Array.isArray(domains) && domains.length > 0) {
    for (const domain of domains) {
      for (const key in local_storages) {
        if (key.indexOf(domain) >= 0) {
          console.log("domain matched", domain, key);
          ret_storage[key] = local_storages[key];
        }
      }
    }
  }
  return ret_storage;
}

async function get_cookie_by_domains(domains: string[] = [], blacklist: string[] = []): Promise<CookieData> {
  let ret_cookies: CookieData = {};
  // Get cookies
  if (browser.cookies) {
    const cookies = await browser.cookies.getAll({ partitionKey: {} });
    // console.log("cookies", cookies);
    if (Array.isArray(domains) && domains.length > 0) {
      console.log("domains", domains);
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
      console.log("domains is empty");
      for (const cookie of cookies) {
        // console.log("the cookie", cookie);
        if (cookie.domain) {

          let in_blacklist = false;
          for (const black of blacklist) {
            if (cookie.domain.includes(black)) {
              console.log("blacklist matched", cookie.domain, black);
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
  // console.log( "ret_cookies", ret_cookies );
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
