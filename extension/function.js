import CryptoJS from 'crypto-js';
import { gzip } from 'pako';
import browser from 'webextension-polyfill';

function is_firefox()
{
    return navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
}

function is_safari()
{
    return navigator.userAgent.toLowerCase().indexOf('safari') > -1;
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
    // 只返回以prefix开头的key对应的属性
    if( prefix )
    {
        ret = {};
        for( let key in result )
        {
            if( key.startsWith(prefix) )
            {
                // remove prefix from key
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
            // 只返回以prefix开头的key对应的属性
            if( prefix )
            {
                ret = {};
                for( let key in result )
                {
                    if( key.startsWith(prefix) )
                    {
                        // remove prefix from key
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
    // console.log("load",key,data);
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
    // chrome.storage.local.set({key:JSON.stringify(data)});
    const ret = browser?.storage ? await browser_set( key, JSON.stringify(data) )  : window.localStorage.setItem( key, JSON.stringify(data) );
    return ret;
}

const SENSITIVE_CONFIG_KEYS = ['s3_access_key','s3_secret_key','s3_session_token','webdav_password'];

function get_storage_type(payload)
{
    return payload && payload['storage_type'] ? String(payload['storage_type']) : 'http';
}

function get_storage_target_id(payload)
{
    const storage_type = get_storage_type(payload);
    if( storage_type === 's3' )
    {
        return `${payload['s3_bucket']||''}/${get_s3_object_key(payload)}`;
    }
    if( storage_type === 'webdav' )
    {
        return get_webdav_file_url(payload);
    }
    return payload['endpoint'] || '';
}

function get_s3_object_key(payload)
{
    const prefix = (payload['s3_path_prefix'] && String(payload['s3_path_prefix']).trim()) ? String(payload['s3_path_prefix']).trim().replace(/^\/+|\/+$/g,'') : 'cookiecloud';
    const uuid = payload['uuid'];
    return `${prefix}/${uuid}.json`;
}

function get_webdav_file_url(payload)
{
    const endpoint = String(payload['webdav_endpoint']||'').trim().replace(/\/+$/,'');
    const prefix = (payload['webdav_path'] && String(payload['webdav_path']).trim()) ? String(payload['webdav_path']).trim().replace(/^\/+|\/+$/g,'') : 'cookiecloud';
    const uuid = payload['uuid'];
    const parts = [endpoint, ...prefix.split('/').map(encodeURIComponent), `${encodeURIComponent(uuid)}.json`];
    return parts.filter(Boolean).join('/');
}

function get_webdav_auth_header(payload)
{
    const username = payload['webdav_username'] ? String(payload['webdav_username']) : '';
    const password = payload['webdav_password'] ? String(payload['webdav_password']) : '';
    if( !username && !password ) return null;
    return 'Basic ' + btoa(`${username}:${password}`);
}

function base64url_encode(word_array)
{
    const b64 = CryptoJS.enc.Base64.stringify(word_array);
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');
}

function get_sensitive_key(config)
{
    if( !config || !config['uuid'] || !config['password'] ) return null;
    return CryptoJS.SHA256(`${config['uuid']}-${config['password']}-cred`).toString().substring(0,16);
}

function encrypt_value(value, key)
{
    if( value === null || value === undefined ) return value;
    if( value === '' ) return value;
    if( !key ) return value;
    if( typeof value === 'object' && value.__enc ) return value;
    const cipher = CryptoJS.AES.encrypt(String(value), key).toString();
    return {__enc: 1, v: cipher};
}

function decrypt_value(value, key)
{
    if( value === null || value === undefined ) return value;
    if( typeof value === 'object' && value.__enc )
    {
        if( !key ) return '';
        try {
            return CryptoJS.AES.decrypt(value.v, key).toString(CryptoJS.enc.Utf8);
        } catch (error) {
            return '';
        }
    }
    return value;
}

export async function save_config(config)
{
    const key = get_sensitive_key(config);
    const saved = {...config};
    for( const k of SENSITIVE_CONFIG_KEYS )
        saved[k] = encrypt_value(saved[k], key);
    return await save_data("COOKIE_SYNC_SETTING", saved);
}

export async function load_config()
{
    const config = await load_data("COOKIE_SYNC_SETTING");
    if( !config ) return config;
    const key = get_sensitive_key(config);
    const loaded = {...config};
    for( const k of SENSITIVE_CONFIG_KEYS )
        loaded[k] = decrypt_value(loaded[k], key);
    return loaded;
}

function generate_random_string(length = 64)
{
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function aws_hmac(key, data)
{
    return CryptoJS.HmacSHA256(data, key);
}

function aws_sha256_hex(data)
{
    return CryptoJS.SHA256(data).toString();
}

function aws_get_signature_key(key, date_stamp, region_name, service_name)
{
    const k_date = aws_hmac(`AWS4${key}`, date_stamp);
    const k_region = aws_hmac(k_date, region_name);
    const k_service = aws_hmac(k_region, service_name);
    const k_signing = aws_hmac(k_service, 'aws4_request');
    return k_signing;
}

function aws_amz_date(date = new Date())
{
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth()+1).padStart(2,'0');
    const d = String(date.getUTCDate()).padStart(2,'0');
    const hh = String(date.getUTCHours()).padStart(2,'0');
    const mm = String(date.getUTCMinutes()).padStart(2,'0');
    const ss = String(date.getUTCSeconds()).padStart(2,'0');
    return `${y}${m}${d}T${hh}${mm}${ss}Z`;
}

function aws_date_stamp(date = new Date())
{
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth()+1).padStart(2,'0');
    const d = String(date.getUTCDate()).padStart(2,'0');
    return `${y}${m}${d}`;
}

function aws_encode_uri(path)
{
    return path.split('/').map(p => encodeURIComponent(p)).join('/');
}

async function s3_signed_request(payload, method, key, body = '')
{
    const region = payload['s3_region'] ? String(payload['s3_region']).trim() : 'us-east-1';
    const bucket = String(payload['s3_bucket']||'').trim();
    const access_key = String(payload['s3_access_key']||'').trim();
    const secret_key = String(payload['s3_secret_key']||'').trim();
    const session_token = payload['s3_session_token'] ? String(payload['s3_session_token']).trim() : '';
    if( !bucket || !access_key || !secret_key ) return {ok:false, note:'s3_missing_config'};
    const endpoint_raw = payload['s3_endpoint'] ? String(payload['s3_endpoint']).trim() : `https://s3.${region}.amazonaws.com`;
    const endpoint = new URL(endpoint_raw);
    const force_path_style = String(payload['s3_force_path_style']||'0') === '1';
    const object_key = aws_encode_uri(key);
    const base_path = endpoint.pathname.replace(/\/+$/,'');
    let host = endpoint.host;
    let canonical_uri = '';
    let url = '';
    if( force_path_style )
    {
        canonical_uri = `${base_path}/${bucket}/${object_key}`.replace(/\/+$/,'');
        if( !canonical_uri.startsWith('/') ) canonical_uri = '/' + canonical_uri;
        url = `${endpoint.origin}${canonical_uri}`;
    }else
    {
        host = `${bucket}.${host}`;
        canonical_uri = `${base_path}/${object_key}`.replace(/\/+$/,'');
        if( !canonical_uri.startsWith('/') ) canonical_uri = '/' + canonical_uri;
        url = `${endpoint.protocol}//${host}${canonical_uri}`;
    }
    const amz_date = aws_amz_date();
    const date_stamp = aws_date_stamp();
    const payload_hash = aws_sha256_hex(body || '');
    const headers_to_sign = {
        host,
        'x-amz-date': amz_date,
        'x-amz-content-sha256': payload_hash
    };
    if( session_token ) headers_to_sign['x-amz-security-token'] = session_token;
    const sorted_keys = Object.keys(headers_to_sign).sort();
    const canonical_headers = sorted_keys.map(k => `${k}:${String(headers_to_sign[k]).trim()}\n`).join('');
    const signed_headers = sorted_keys.join(';');
    const canonical_request = `${method}\n${canonical_uri}\n\n${canonical_headers}\n${signed_headers}\n${payload_hash}`;
    const credential_scope = `${date_stamp}/${region}/s3/aws4_request`;
    const string_to_sign = `AWS4-HMAC-SHA256\n${amz_date}\n${credential_scope}\n${aws_sha256_hex(canonical_request)}`;
    const signing_key = aws_get_signature_key(secret_key, date_stamp, region, 's3');
    const signature = aws_hmac(signing_key, string_to_sign).toString();
    const authorization = `AWS4-HMAC-SHA256 Credential=${access_key}/${credential_scope}, SignedHeaders=${signed_headers}, Signature=${signature}`;
    const headers = {
        'x-amz-date': amz_date,
        'x-amz-content-sha256': payload_hash,
        'Authorization': authorization
    };
    if( session_token ) headers['x-amz-security-token'] = session_token;
    return {ok:true, url, headers};
}

async function s3_upload(payload, payload2)
{
    const key = get_s3_object_key(payload);
    const body = JSON.stringify(payload2);
    const signed = await s3_signed_request(payload, 'PUT', key, body);
    if( !signed.ok ) return {action:false, note: signed.note || 's3_sign_failed'};
    const response = await fetch(signed.url, {
        method: 'PUT',
        headers: signed.headers,
        body
    });
    if( response.ok ) return {action:'done'};
    return {action:false, note:'s3_upload_failed'};
}

async function s3_download(payload)
{
    const key = get_s3_object_key(payload);
    const signed = await s3_signed_request(payload, 'GET', key, '');
    if( !signed.ok ) return {action:false, note: signed.note || 's3_sign_failed'};
    const response = await fetch(signed.url, {
        method: 'GET',
        headers: signed.headers
    });
    if( response.status === 404 ) return {action:false, note:'s3_file_not_found'};
    if( !response.ok ) return {action:false, note:'s3_download_failed'};
    const text = await response.text();
    const parsed = JSON.parse(text);
    return {action:'done', payload: parsed};
}

async function webdav_upload(payload, payload2)
{
    const url = get_webdav_file_url(payload);
    if( !url ) return {action:false, note:'webdav_missing_endpoint'};
    const auth = get_webdav_auth_header(payload);
    const headers = {'Content-Type':'application/json'};
    if( auth ) headers['Authorization'] = auth;
    const response = await fetch(url, {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload2)
    });
    if( response.ok ) return {action:'done'};
    return {action:false, note:'webdav_upload_failed'};
}

async function webdav_download(payload)
{
    const url = get_webdav_file_url(payload);
    if( !url ) return {action:false, note:'webdav_missing_endpoint'};
    const auth = get_webdav_auth_header(payload);
    const headers = {};
    if( auth ) headers['Authorization'] = auth;
    const response = await fetch(url, {
        method: 'GET',
        headers
    });
    if( response.status === 404 ) return {action:false, note:'webdav_file_not_found'};
    if( !response.ok ) return {action:false, note:'webdav_download_failed'};
    const text = await response.text();
    const parsed = JSON.parse(text);
    return {action:'done', payload: parsed};
}

async function upload_via_storage(payload, payload2, headers)
{
    const storage_type = get_storage_type(payload);
    if( storage_type === 's3' )
        return await s3_upload(payload, payload2);
    if( storage_type === 'webdav' )
        return await webdav_upload(payload, payload2);
    return await upload_via_http(payload, payload2, headers);
}

async function download_via_storage(payload)
{
    const storage_type = get_storage_type(payload);
    if( storage_type === 's3' )
        return await s3_download(payload);
    if( storage_type === 'webdav' )
        return await webdav_download(payload);
    return await download_via_http(payload);
}

async function upload_via_http(payload, payload2, headers)
{
    const endpoint = payload['endpoint'].trim().replace(/\/+$/, '')+'/update';
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: gzip(JSON.stringify(payload2))
    });
    const result = await response.json();
    return result;
}

async function download_via_http(payload)
{
    const endpoint = payload['endpoint'].trim().replace(/\/+$/, '')+'/get/'+payload['uuid'];
    const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    });
    const result = await response.json();
    return result;
}

export async function upload_cookie( payload )
{
    const { uuid, password } = payload;
    // console.log( payload );
    // none of the fields can be empty
    if (!password || !uuid) {
        alert("错误的参数");
        showBadge("err");
        return false;
    }
    const domains = payload['domains']?.trim().length > 0 ? payload['domains']?.trim().split("\n") : [];

    const blacklist = payload['blacklist']?.trim().length > 0 ? payload['blacklist']?.trim().split("\n") : [];

    const cookies = await get_cookie_by_domains( domains, blacklist );
    const with_storage = Number(payload['with_storage']) === 1;
    const local_storages = with_storage ? await get_local_storage_by_domains( domains ) : {};

    let headers = { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }
    // 添加鉴权的 header
    try {
        if (payload['headers']?.trim().length > 0) {
            let extraHeaderPairs = payload['headers']?.trim().split("\n");
            extraHeaderPairs.forEach((extraHeaderPair, index) => {
                let extraHeaderPairKV = String(extraHeaderPair).split(":");
                if (extraHeaderPairKV?.length > 1) {
                    headers[extraHeaderPairKV[0]] = extraHeaderPairKV[1];
                } else {
                    console.log("error", "解析 header 错误: ", extraHeaderPair);
                    showBadge("fail", "orange");
                }
            })
        }
    } catch (error) {
        console.log("error", error);
        showBadge("err");
        return false;
    } 
    // 用aes对cookie进行加密
    const the_key = CryptoJS.MD5(payload['uuid']+'-'+payload['password']).toString().substring(0,16);
    const data_to_encrypt = JSON.stringify({"cookie_data":cookies,"local_storage_data":local_storages,"update_time":new Date()});
    const encrypted = CryptoJS.AES.encrypt(data_to_encrypt, the_key).toString();
    const storage_type = get_storage_type(payload);
    const storage_target_id = get_storage_target_id(payload);
    // get sha256 of the encrypted data
    const sha256 = CryptoJS.SHA256(uuid+"-"+password+"-"+storage_type+"-"+storage_target_id+"-"+data_to_encrypt).toString();
    console.log( "sha256", sha256 );
    const last_uploaded_info = await load_data( 'LAST_UPLOADED_COOKIE' );
    // 如果24小时内已经上传过同样内容的数据，则不再上传
    if( ( !payload['no_cache'] || parseInt(payload['no_cache']) < 1 ) && last_uploaded_info && last_uploaded_info.sha256 === sha256 && new Date().getTime() - last_uploaded_info.timestamp < 1000*60*60*24 )
    {
        console.log("same data in 24 hours, skip1");
        return {action:'done',note:'本地Cookie数据无变动，不再上传'};
    }
    
    const payload2 = {
            uuid: payload['uuid'],
            encrypted: encrypted
    };
    try {
        showBadge("↑", "green");
        const result = await upload_via_storage(payload, payload2, headers);

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
    try {
        showBadge("↓", "blue");
        const result = await download_via_storage(payload);
        if( result && result.encrypted )
        {
            const { cookie_data, local_storage_data } = cookie_decrypt( uuid, result.encrypted, password );
            let action = 'done';
            if(cookie_data)
            {
                for( let domain in cookie_data )
                {
                    // console.log( "domain" , cookies[domain] );
                    if( Array.isArray(cookie_data[domain]) )
                    {
                        for( let cookie of cookie_data[domain] )
                        {
                            let new_cookie = {};
                            ['name','value','domain','path','secure','httpOnly','sameSite'].forEach( key => {
                                if( key == 'sameSite' && cookie[key].toLowerCase() == 'unspecified' && is_firefox() )
                                {
                                    // firefox 下 unspecified 会导致cookie无法设置
                                    // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/cookies/SameSiteStatus
                                    new_cookie['sameSite'] = 'no_restriction';
                                }else
                                {
                                    new_cookie[key] = cookie[key];
                                }
                            } );
                            if( expire_minutes )
                            {
                                // 当前时间戳（秒）
                                const now = parseInt(new Date().getTime()/1000);
                                console.log("now", now);
                                new_cookie.expirationDate = now + parseInt(expire_minutes)*60;
                                console.log("new_cookie.expirationDate", new_cookie.expirationDate);

                            } 
                            new_cookie.url = buildUrl(cookie.secure, cookie.domain, cookie.path);
                            console.log( "new cookie", new_cookie);
                            try {
                                const set_ret = await browser.cookies.set(new_cookie);
                                    console.log("set cookie", set_ret);
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

            console.log("local_storage_data",local_storage_data);
            if( local_storage_data )
            {
                for( let domain in local_storage_data )
                {
                    const key = 'LS-'+domain;
                    await save_data( key, local_storage_data[domain] );
                    console.log("save local storage", key, local_storage_data[domain] );
                }
            }

            return {action};
        }else if( result && result.payload )
        {
            const { cookie_data, local_storage_data } = cookie_decrypt( uuid, result.payload.encrypted, password );
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

function cookie_decrypt( uuid, encrypted, password )
{
    const CryptoJS = require('crypto-js');
    const the_key = CryptoJS.MD5(uuid+'-'+password).toString().substring(0,16);
    const decrypted = CryptoJS.AES.decrypt(encrypted, the_key).toString(CryptoJS.enc.Utf8);
    const parsed = JSON.parse(decrypted);
    return parsed;
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
                    console.log( "domain 匹配", domain, key );
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
    // 获取cookie
    if( browser.cookies )
    {
        const cookies = await browser.cookies.getAll({ partitionKey: {} });
        // console.log("cookies", cookies);
        if( Array.isArray(domains) && domains.length > 0 )
        {
            console.log("domains", domains);
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
            console.log("domains为空");
            for( const cookie of cookies )
            {
                // console.log("the cookie", cookie);
                if( cookie.domain )
                {
                    
                    let in_blacklist = false;
                    for( const black of blacklist )
                    {
                        if( cookie.domain.includes(black) )
                        {
                            console.log("blacklist 匹配", cookie.domain, black);
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
    // console.log( "ret_cookies", ret_cookies );
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
