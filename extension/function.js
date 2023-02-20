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
    const with_storage = payload['with_storage'] || 0;
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
    const endpoint = payload['endpoint'].trim().replace(/\/+$/, '')+'/update';

    // get sha256 of the encrypted data
    const sha256 = CryptoJS.SHA256(uuid+"-"+password+"-"+endpoint+"-"+data_to_encrypt).toString();
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
    // console.log( endpoint, payload2 );
    try {
        showBadge("↑", "green");
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: gzip(JSON.stringify(payload2))
        });
        const result = await response.json();

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
    const { uuid, password } = payload;
    const endpoint = payload['endpoint'].trim().replace(/\/+$/, '')+'/get/'+uuid;
    try {
        showBadge("↓", "blue");
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const result = await response.json();
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
        const cookies = await browser.cookies.getAll({});
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
