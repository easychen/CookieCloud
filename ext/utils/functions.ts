import CryptoJS from 'crypto-js';
import { gzip } from 'pako';

interface CookieData {
  [domain: string]: any[];
}

export type DomainFilterType = 'sync' | 'all' | 'blacklist';

export interface DomainStatus {
  isInBlacklist: boolean;
  isInSyncList: boolean;
}

export interface ConfigData {
  endpoint: string;
  password: string;
  interval: number;
  domains: string;
  uuid: string;
  type: string;
  keep_live: string;
  with_storage: number;
  blacklist: string;
  headers: string;
  expire_minutes: number;
  crypto_type: string;
}

export interface ManagedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: string;
  expirationDate?: number;
  storeId?: string;
  session?: boolean;
  partitionKey?: any;
}

export type CookieIdentityFields = Pick<ManagedCookie, 'name' | 'domain' | 'path' | 'storeId' | 'partitionKey'>;

export interface SyncLogEntry {
  id: string;
  timestamp: number;
  direction: 'upload' | 'download';
  success: boolean;
  trigger: string;
  note: string;
  domainCount: number;
  cookieCount: number;
}

export interface RemoteCookieSnapshot {
  cookie_data: CookieData;
  local_storage_data: any;
  update_time?: string;
  crypto_type?: string;
}

export const DEFAULT_CONFIG: ConfigData = {
  endpoint: 'https://ccc.ft07.com',
  password: '',
  interval: 10,
  domains: '',
  uuid: '',
  type: 'up',
  keep_live: '',
  with_storage: 1,
  blacklist: 'google.com',
  headers: '',
  expire_minutes: 60 * 24 * 365,
  crypto_type: 'legacy'
};

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
  trigger?: string;
}

interface DownloadPayload {
  uuid: string;
  password: string;
  endpoint: string;
  expire_minutes?: number;
  crypto_type?: string;
  trigger?: string;
}

const SYNC_LOG_STORAGE_KEY = 'COOKIE_SYNC_LOGS';

function is_firefox(): boolean {
  return navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
}

export function normalize_config(data: Partial<ConfigData> | null | undefined): ConfigData {
  const merged = { ...DEFAULT_CONFIG, ...(data || {}) };
  const asString = <K extends keyof ConfigData>(key: K): ConfigData[K] => {
    const value = merged[key];
    return (typeof value === 'string' ? value : DEFAULT_CONFIG[key]) as ConfigData[K];
  };

  return {
    ...merged,
    interval: Number(merged.interval) || DEFAULT_CONFIG.interval,
    with_storage: Number(merged.with_storage) || 0,
    expire_minutes: Number(merged.expire_minutes) || 0,
    uuid: asString('uuid'),
    password: asString('password'),
    endpoint: asString('endpoint'),
    type: asString('type'),
    domains: asString('domains'),
    keep_live: asString('keep_live'),
    blacklist: asString('blacklist'),
    headers: asString('headers'),
    crypto_type: asString('crypto_type')
  };
}

export function split_lines(value: string = ''): string[] {
  return value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

export function normalize_domain(domain: string): string {
  return domain.replace(/^\./, '').trim().toLowerCase();
}

export function get_domain_status(domain: string, config: Pick<ConfigData, 'domains' | 'blacklist'>): DomainStatus {
  const normalizedDomain = normalize_domain(domain);
  const syncDomains = split_lines(config.domains);
  const blacklistDomains = split_lines(config.blacklist);

  return {
    isInBlacklist: blacklistDomains.some(item => normalizedDomain.includes(normalize_domain(item))),
    isInSyncList: syncDomains.some(item => normalizedDomain.includes(normalize_domain(item))),
  };
}

export function get_default_domain_filter(config: Pick<ConfigData, 'domains'>): DomainFilterType {
  return split_lines(config.domains).length > 0 ? 'sync' : 'all';
}

export function filter_domains_by_type(cookieData: CookieData, filterType: DomainFilterType, config: Pick<ConfigData, 'domains' | 'blacklist'>): CookieData {
  if (filterType === 'all') {
    return cookieData;
  }

  const filtered: CookieData = {};
  for (const domain of Object.keys(cookieData)) {
    const status = get_domain_status(domain, config);
    if (filterType === 'sync' && status.isInSyncList) {
      filtered[domain] = cookieData[domain];
    }
    if (filterType === 'blacklist' && status.isInBlacklist) {
      filtered[domain] = cookieData[domain];
    }
  }

  return filtered;
}

export function cookie_list_to_header_string(cookies: ManagedCookie[]): string {
  return cookies
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join(';');
}

export function get_cookie_identity_key(cookie: CookieIdentityFields): string {
  return [
    normalize_domain(cookie.domain || ''),
    cookie.path || '',
    cookie.name || '',
    cookie.storeId || '',
    cookie.partitionKey ? JSON.stringify(cookie.partitionKey) : '',
  ].join('|');
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
  const trigger = payload.trigger || (payload.no_cache ? 'manual' : 'scheduled');
  // console.log( payload );
  // none of the fields can be empty
  if (!password || !uuid) {
    alert("Invalid parameters");
    showBadge("err");
    await append_sync_log({
      direction: 'upload',
      success: false,
      trigger,
      note: 'Invalid parameters',
      domainCount: 0,
      cookieCount: 0,
    });
    return false;
  }
  const domains = payload.domains?.trim().length ? payload.domains.trim().split("\n") : [];

  const blacklist = payload.blacklist?.trim().length ? payload.blacklist.trim().split("\n") : [];

  const cookies = await get_cookie_by_domains(domains, blacklist);
  const domainCount = Object.keys(cookies).length;
  const cookieCount = Object.values(cookies).reduce((sum, items) => sum + items.length, 0);
  const with_storage = payload['with_storage'] || 0;
  const local_storages = with_storage ? await get_local_storage_by_domains(domains) : {};

  let headers: any = { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }
  // Add authentication header
  try {
    if (payload.headers?.trim().length) {
      let extraHeaderPairs = payload.headers.trim().split("\n");
      extraHeaderPairs.forEach((extraHeaderPair, index) => {
        let extraHeaderPairKV = String(extraHeaderPair).split(":");
        if (extraHeaderPairKV?.length > 1) {
          headers[extraHeaderPairKV[0]] = extraHeaderPairKV[1];
        } else {
          console.log("error", "Header parsing error: ", extraHeaderPair);
          showBadge("fail", "orange");
        }
      })
    }
  } catch (error) {
    console.log("error", error);
    showBadge("err");
    await append_sync_log({
      direction: 'upload',
      success: false,
      trigger,
      note: 'Header parsing error',
      domainCount,
      cookieCount,
    });
    return false;
  }
  // Encrypt cookie with AES
  const data_to_encrypt = JSON.stringify({ "cookie_data": cookies, "local_storage_data": local_storages, "update_time": new Date() });
  const crypto_type = payload.crypto_type || 'legacy';
  const encrypted = cookie_encrypt(payload.uuid, data_to_encrypt, payload.password, crypto_type);
  const endpoint = payload.endpoint.trim().replace(/\/+$/, '') + '/update';

  // get sha256 of the encrypted data
  const sha256 = CryptoJS.SHA256(uuid + "-" + password + "-" + endpoint + "-" + data_to_encrypt).toString();
  console.log("sha256", sha256);
  const last_uploaded_info = await load_data('LAST_UPLOADED_COOKIE');
  // If same content has been uploaded within 24 hours, don't upload again
  if ((!payload.no_cache || parseInt(payload.no_cache.toString()) < 1) && last_uploaded_info && last_uploaded_info.sha256 === sha256 && new Date().getTime() - last_uploaded_info.timestamp < 1000 * 60 * 60 * 24) {
    console.log("same data in 24 hours, skip1");
    await append_sync_log({
      direction: 'upload',
      success: true,
      trigger,
      note: 'Local Cookie data unchanged, not uploading',
      domainCount,
      cookieCount,
    });
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
    const result = await response.json();

    if (result && result.action === 'done')
      await save_data('LAST_UPLOADED_COOKIE', { "timestamp": new Date().getTime(), "sha256": sha256 });

    await append_sync_log({
      direction: 'upload',
      success: result?.action === 'done',
      trigger,
      note: result?.note || result?.message || result?.action || 'upload completed',
      domainCount,
      cookieCount,
    });

    return result;
  } catch (error) {
    console.log("error", error);
    showBadge("err");
    await append_sync_log({
      direction: 'upload',
      success: false,
      trigger,
      note: error instanceof Error ? error.message : 'upload failed',
      domainCount,
      cookieCount,
    });
    return false;
  }
}

export async function fetch_remote_cookie_snapshot(payload: DownloadPayload): Promise<RemoteCookieSnapshot> {
  const { uuid, password, crypto_type } = payload;
  let endpoint = payload.endpoint.trim().replace(/\/+$/, '') + '/get/' + uuid;
  if (crypto_type) {
    endpoint += `?crypto_type=${crypto_type}`;
  }
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  });
  const result = await response.json();

  if (!result?.encrypted) {
    throw new Error('remote snapshot unavailable');
  }

  const useCryptoType = crypto_type || result.crypto_type || 'legacy';
  const snapshot = cookie_decrypt(uuid, result.encrypted, password, useCryptoType);

  return {
    ...snapshot,
    crypto_type: useCryptoType,
  };
}

export async function download_cookie(payload: DownloadPayload): Promise<any> {
  const { expire_minutes } = payload;
  const trigger = payload.trigger || 'scheduled';
  try {
    showBadge("↓", "blue");
    const { cookie_data, local_storage_data } = await fetch_remote_cookie_snapshot(payload);
    let action = 'done';
    const domainCount = Object.keys(cookie_data || {}).length;
    const cookieCount = Object.values(cookie_data || {}).reduce((sum, items) => sum + items.length, 0);

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

    await append_sync_log({
      direction: 'download',
      success: action === 'done',
      trigger,
      note: action === 'done' ? 'download completed' : 'download failed',
      domainCount,
      cookieCount,
    });

    return { action };
  } catch (error) {
    console.log("error", error);
    showBadge("err");
    await append_sync_log({
      direction: 'download',
      success: false,
      trigger,
      note: error instanceof Error ? error.message : 'download failed',
      domainCount: 0,
      cookieCount: 0,
    });
    return false;
  }
}

function cookie_decrypt(uuid: string, encrypted: string, password: string, crypto_type: string = 'legacy'): any {
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

export async function get_cookie_by_domains(domains: string[] = [], blacklist: string[] = []): Promise<CookieData> {
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

export async function list_cookies_by_domain(keyword: string = ''): Promise<CookieData> {
  const allCookies = await get_cookie_by_domains();
  const search = keyword.trim().toLowerCase();

  if (!search) {
    return sort_cookie_domains(allCookies);
  }

  const filtered: CookieData = {};
  for (const domain of Object.keys(allCookies)) {
    if (normalize_domain(domain).includes(search)) {
      filtered[domain] = allCookies[domain];
    }
  }

  return sort_cookie_domains(filtered);
}

function sort_cookie_domains(cookieData: CookieData): CookieData {
  return Object.keys(cookieData)
    .sort((left, right) => normalize_domain(left).localeCompare(normalize_domain(right)))
    .reduce((result, domain) => {
      result[domain] = cookieData[domain].slice().sort((left, right) => {
        const leftName = `${left.name || ''}${left.path || ''}`;
        const rightName = `${right.name || ''}${right.path || ''}`;
        return leftName.localeCompare(rightName);
      });
      return result;
    }, {} as CookieData);
}

export async function upsert_cookie(cookie: ManagedCookie): Promise<any> {
  const payload: any = {
    url: buildUrl(cookie.secure, cookie.domain, cookie.path),
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
  };

  if (cookie.sameSite) {
    payload.sameSite = cookie.sameSite;
  }
  if (cookie.expirationDate && !cookie.session) {
    payload.expirationDate = cookie.expirationDate;
  }
  if (cookie.storeId) {
    payload.storeId = cookie.storeId;
  }
  if (cookie.partitionKey) {
    payload.partitionKey = cookie.partitionKey;
  }

  return browser.cookies.set(payload);
}

export async function delete_cookie(cookie: ManagedCookie): Promise<any> {
  const payload: any = {
    url: buildUrl(cookie.secure, cookie.domain, cookie.path),
    name: cookie.name,
  };

  if (cookie.storeId) {
    payload.storeId = cookie.storeId;
  }
  if (cookie.partitionKey) {
    payload.partitionKey = cookie.partitionKey;
  }

  return browser.cookies.remove(payload);
}

export async function add_domain_to_blacklist(domain: string): Promise<ConfigData> {
  return update_domains_config('blacklist', [domain], 'add');
}

export async function append_sync_log(input: Omit<SyncLogEntry, 'id' | 'timestamp'>): Promise<void> {
  const currentLogs = await list_sync_logs();
  const nextLogs: SyncLogEntry[] = [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      ...input,
    },
    ...currentLogs,
  ].slice(0, 100);

  await save_data(SYNC_LOG_STORAGE_KEY, nextLogs);
}

export async function list_sync_logs(): Promise<SyncLogEntry[]> {
  const logs = await load_data(SYNC_LOG_STORAGE_KEY);
  return Array.isArray(logs) ? logs : [];
}

export async function remove_domain_from_blacklist(domain: string): Promise<ConfigData> {
  return update_domains_config('blacklist', [domain], 'remove');
}

export async function add_domain_to_sync_list(domain: string): Promise<ConfigData> {
  return update_domains_config('domains', [domain], 'add');
}

export async function remove_domain_from_sync_list(domain: string): Promise<ConfigData> {
  return update_domains_config('domains', [domain], 'remove');
}

export async function add_domains_to_blacklist(domains: string[]): Promise<ConfigData> {
  return update_domains_config('blacklist', domains, 'add');
}

export async function remove_domains_from_blacklist(domains: string[]): Promise<ConfigData> {
  return update_domains_config('blacklist', domains, 'remove');
}

export async function add_domains_to_sync_list(domains: string[]): Promise<ConfigData> {
  return update_domains_config('domains', domains, 'add');
}

export async function remove_domains_from_sync_list(domains: string[]): Promise<ConfigData> {
  return update_domains_config('domains', domains, 'remove');
}

async function update_domains_config(field: 'domains' | 'blacklist', domains: string[], action: 'add' | 'remove'): Promise<ConfigData> {
  const current = normalize_config(await load_data('COOKIE_SYNC_SETTING'));
  const normalizedTargets = Array.from(new Set(domains.map(normalize_domain).filter(Boolean)));
  const currentItems = split_lines(current[field]);
  let nextItems = currentItems;

  if (action === 'add') {
    const itemSet = new Set(currentItems.map(normalize_domain));
    nextItems = currentItems.slice();
    for (const target of normalizedTargets) {
      if (!itemSet.has(target)) {
        nextItems.push(target);
        itemSet.add(target);
      }
    }
  } else {
    const targetSet = new Set(normalizedTargets);
    nextItems = currentItems.filter(item => !targetSet.has(normalize_domain(item)));
  }

  const nextConfig = {
    ...current,
    [field]: nextItems.join('\n')
  };

  await save_data('COOKIE_SYNC_SETTING', nextConfig);
  return nextConfig;
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
  const browserAction = browser.action ?? browser.browserAction;
  if (!browserAction?.setBadgeText || !browserAction?.setBadgeBackgroundColor) {
    return;
  }

  browserAction.setBadgeText({ text });
  browserAction.setBadgeBackgroundColor({ color });
  setTimeout(() => {
    browserAction.setBadgeText({ text: '' });
  }, delay);
}
