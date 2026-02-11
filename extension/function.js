import CryptoJS from 'crypto-js';
import { gzip } from 'pako';
import browser from 'webextension-polyfill';

const AES_GCM_TYPE = 'aes-256-gcm-v1';
const FIXED_IV_TYPE = 'aes-128-cbc-fixed';
const LEGACY_TYPE = 'legacy';
const PBKDF2_ITERATIONS = 120000;

function is_firefox()
{
    return navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
}

export async function browser_set( key, value )
{
    return await browser.storage.local.set( {[key]:value});
}

export async function browser_get( key )
{
    const result = await browser.storage.local.get( key );
    if (result[key] === undefined) return null;
    else return result[key];
}

export async function browser_remove( key )
{
    return await browser.storage.local.remove( key );
}

export async function storage_set( key, value )
{
    return new Promise((resolve, reject) => {
        chrome.storage.local.set( {[key]:value}, function () {
          return resolve(true);
        });
      });
}

export async function storage_get( key )
{
    return new Promise((resolve, reject) => {
        chrome.storage.local.get([key], function (result) {
          if (result[key] === undefined) {
            resolve(null);
          } else {
            resolve(result[key]);
          }
        });
      });
}

export async function storage_remove( key )
{
    return new Promise((resolve, reject) => {
        chrome.storage.local.remove([key], function (result) {
            resolve(result);
        });
      });
}

export async function browser_load_all(prefix=null)
{
    const result = await browser.storage.local.get(null);
    let ret = result;
    if( prefix )
    {
        ret = {};
        for( let key in result )
        {
            if( key.startsWith(prefix) )
            {
                ret[key.substring(prefix.length)] = JSON.parse(result[key])??result[key];
            }
        }
    }
    return ret;
}

export async function load_all(prefix=null)
{
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(null, function (result) {
            let ret = result;
            if( prefix )
            {
                ret = {};
                for( let key in result )
                {
                    if( key.startsWith(prefix) )
                    {
                        ret[key.substring(prefix.length)] = JSON.parse(result[key])??result[key];
                    }
                }
            }
            resolve(ret);
        });
      });
}

export async function load_data( key  )
{
    const data = browser?.storage ? await browser_get(key) : window.localStorage.getItem( key );
    try {
        return JSON.parse(data);
    } catch (error) {
        return data||[];
    }

}

export async function remove_data( key  )
{
    const ret = browser?.storage ? await browser_remove(key) : window.localStorage.removeItem( key );
    return ret;
}

export async function save_data( key, data )
{
    const ret = browser?.storage ? await browser_set( key, JSON.stringify(data) )  : window.localStorage.setItem( key, JSON.stringify(data) );
    return ret;
}

export async function upload_cookie( payload )
{
    const { uuid, password } = payload;
    if (!password || !uuid) {
        alert("错误的参数");
        showBadge("err");
        return false;
    }

    if (!payload['auth_key_id'] || !payload['auth_secret']) {
        alert(browser.i18n.getMessage('authConfigRequired') || 'Auth Key ID和Auth Secret不能为空');
        showBadge('err');
        return false;
    }

    const domains = payload['domains']?.trim().length > 0 ? payload['domains']?.trim().split("\n") : [];
    const blacklist = payload['blacklist']?.trim().length > 0 ? payload['blacklist']?.trim().split("\n") : [];

    const cookies = await get_cookie_by_domains( domains, blacklist );
    const with_storage = Number(payload['with_storage']) === 1;
    const local_storages = with_storage ? await get_local_storage_by_domains( domains ) : {};

    const data_to_encrypt = JSON.stringify({"cookie_data":cookies,"local_storage_data":local_storages,"update_time":new Date()});
    const crypto_type = payload['crypto_type'] || AES_GCM_TYPE;
    const encrypted = await cookie_encrypt(payload['uuid'], data_to_encrypt, payload['password'], crypto_type);
    const endpoint = payload['endpoint'].trim().replace(/\/+$/, '')+'/update';

    const sha256 = CryptoJS.SHA256(uuid+"-"+password+"-"+endpoint+"-"+data_to_encrypt).toString();
    const last_uploaded_info = await load_data( 'LAST_UPLOADED_COOKIE' );
    if( ( !payload['no_cache'] || parseInt(payload['no_cache']) < 1 ) && last_uploaded_info && last_uploaded_info.sha256 === sha256 && new Date().getTime() - last_uploaded_info.timestamp < 1000*60*60*24 )
    {
        return {action:'done',note:'本地Cookie数据无变动，不再上传'};
    }

    const payload2 = {
        uuid: payload['uuid'],
        encrypted: encrypted,
        crypto_type: crypto_type
    };

    try {
        showBadge("↑", "green");

        const headers = {
            'Content-Type': 'application/json',
            'Content-Encoding': 'gzip',
            ...parseExtraHeaders(payload['headers']),
            ...buildSignedHeaders(payload, 'POST', endpoint, uuid, payload2)
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: gzip(JSON.stringify(payload2))
        });

        const result = await response.json().catch(() => ({ action: 'error' }));
        if (!response.ok) {
            return result;
        }

        if( result && result.action === 'done' ) 
            await save_data( 'LAST_UPLOADED_COOKIE', {"timestamp": new Date().getTime(), "sha256":sha256 } );    

        return result;
    } catch (error) {
        console.log("error", error);
        showBadge("err");
        return false;
    }  
}

export async function download_cookie(payload)
{
    const { uuid, password, expire_minutes } = payload;

    if (!payload['auth_key_id'] || !payload['auth_secret']) {
        alert(browser.i18n.getMessage('authConfigRequired') || 'Auth Key ID和Auth Secret不能为空');
        showBadge('err');
        return false;
    }

    let endpoint = payload['endpoint'].trim().replace(/\/+$/, '')+'/get/'+uuid;
    if (payload['crypto_type']) {
        endpoint += `?crypto_type=${payload['crypto_type']}`;
    }

    try {
        showBadge("↓", "blue");
        const response = await fetch(endpoint, {
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

        if( result && result.encrypted )
        {
            const useCryptoType = normalizeCryptoType(payload['crypto_type'] || result.crypto_type || LEGACY_TYPE);
            const { cookie_data, local_storage_data } = await cookie_decrypt( uuid, result.encrypted, password, useCryptoType );
            let action = 'done';
            if(cookie_data)
            {
                for( let domain in cookie_data )
                {
                    if( Array.isArray(cookie_data[domain]) )
                    {
                        for( let cookie of cookie_data[domain] )
                        {
                            let new_cookie = {};
                            ['name','value','domain','path','secure','httpOnly','sameSite'].forEach( key => {
                                if( key == 'sameSite' && cookie[key].toLowerCase() == 'unspecified' && is_firefox() )
                                {
                                    new_cookie['sameSite'] = 'no_restriction';
                                }else
                                {
                                    new_cookie[key] = cookie[key];
                                }
                            } );
                            if( expire_minutes )
                            {
                                const now = parseInt(new Date().getTime()/1000);
                                new_cookie.expirationDate = now + parseInt(expire_minutes)*60;
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
            }else
            {
                action = false;
            }

            if( local_storage_data )
            {
                for( let domain in local_storage_data )
                {
                    const key = 'LS-'+domain;
                    await save_data( key, local_storage_data[domain] );
                }
            }

            return {action};
        }
    } catch (error) {
        console.log("error", error);
        showBadge("err");
        return false;
    }
}

function normalizeCryptoType(cryptoType)
{
    return String(cryptoType || '').trim().toLowerCase() || LEGACY_TYPE;
}

async function cookie_decrypt( uuid, encrypted, password, crypto_type = LEGACY_TYPE )
{
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
        const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBytes);
        return JSON.parse(new TextDecoder().decode(plainBuffer));
    }

    const hash = CryptoJS.MD5(uuid+'-'+password).toString();
    const the_key = hash.substring(0,16);

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

async function cookie_encrypt( uuid, data, password, crypto_type = AES_GCM_TYPE )
{
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

    const hash = CryptoJS.MD5(uuid+'-'+password).toString();
    const the_key = hash.substring(0,16);

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

async function deriveAesGcmKey(uuid, password, salt, iterations)
{
    const keyMaterial = await crypto.subtle.importKey(
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
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

function bytesToBase64(bytes)
{
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToBytes(base64)
{
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function buildSignedHeaders(payload, method, endpoint, uuid, body)
{
    const keyId = String(payload['auth_key_id'] || '').trim();
    const secret = String(payload['auth_secret'] || '').trim();
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

function parseExtraHeaders(rawHeaders)
{
    const headers = {};
    if (!rawHeaders || !rawHeaders.trim()) return headers;

    const rows = rawHeaders.trim().split('\n');
    rows.forEach((row) => {
        const index = row.indexOf(':');
        if (index <= 0) return;
        const key = row.slice(0, index).trim();
        const value = row.slice(index + 1).trim();
        if (!key || !value) return;
        headers[key] = value;
    });

    return headers;
}

function hashBody(body)
{
    if (body === null || body === undefined || body === '') return CryptoJS.SHA256('').toString();
    if (typeof body === 'string') return CryptoJS.SHA256(body).toString();
    return CryptoJS.SHA256(stableStringify(body)).toString();
}

function stableStringify(value)
{
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;

    if (typeof value === 'object') {
        const keys = Object.keys(value).sort();
        return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }

    return JSON.stringify(value);
}

function generateNonce(length = 16)
{
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(bytes).map((item) => item.toString(16).padStart(2, '0')).join('');
}

export async function get_local_storage_by_domains( domains = [] )
{
    let ret_storage = {};
    const local_storages = await browser_load_all('LS-');
    if( Array.isArray(domains) && domains.length > 0 )
    {
        for( const domain of domains )
        {
            for( const key in local_storages )
            {
                if( key.indexOf(domain) >= 0 )
                {
                    ret_storage[key] = local_storages[key];
                }
            }
        }
    }
    return ret_storage;
}

async function get_cookie_by_domains( domains = [], blacklist = [] )
{
    let ret_cookies = {};
    if( browser.cookies )
    {
        const cookies = await browser.cookies.getAll({ partitionKey: {} });
        if( Array.isArray(domains) && domains.length > 0 )
        {
            for( const domain of domains )
            {
                ret_cookies[domain] = [];
                for( const cookie of cookies )
                {
                    if( cookie.domain?.includes(domain) )
                    {
                        ret_cookies[domain].push( cookie );
                    }
                }    
            }
        }
        else
        {
            for( const cookie of cookies )
            {
                if( cookie.domain )
                {
                    let in_blacklist = false;
                    for( const black of blacklist )
                    {
                        if( cookie.domain.includes(black) )
                        {
                            in_blacklist = true;
                        }
                    }

                    if( !in_blacklist )
                    {
                        if( !ret_cookies[cookie.domain] )
                        {
                            ret_cookies[cookie.domain] = [];
                        }
                        ret_cookies[cookie.domain].push( cookie );
                    }
                }
            }
        }
    }
    return ret_cookies;
}

function buildUrl(secure, domain, path) 
{
    if (domain.startsWith('.')) {
        domain = domain.substr(1);
    }
    return `http${secure ? 's' : ''}://${domain}${path}`;
}

export function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
}

export function showBadge(text, color = "red", delay = 5000) {
    chrome.action.setBadgeText({text:text});
    chrome.action.setBadgeBackgroundColor({color:color});
    setTimeout(() => {
        chrome.action.setBadgeText({ text: '' });
    }, delay);
}
