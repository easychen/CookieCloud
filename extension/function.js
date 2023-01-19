import CryptoJS from 'crypto-js';
import { gzip } from 'pako';

export async function storage_set( key, value )
{
    return new Promise((resolve, reject) => {
        chrome.storage.sync.set( {[key]:value}, function () {
          return resolve(true);
        });
      });
}

export async function storage_get( key )
{
    return new Promise((resolve, reject) => {
        chrome.storage.sync.get([key], function (result) {
          if (result[key] === undefined) {
            resolve(null);
          } else {
            resolve(result[key]);
          }
        });
      });
}

export async function load_data( key  )
{
    const data = chrome?.storage ? await storage_get(key) : window.localStorage.getItem( key );
    // console.log("load",key,data);
    try {
        return JSON.parse(data);
    } catch (error) {
        return data||[];
    }

}

export async function save_data( key, data )
{
    // chrome.storage.local.set({key:JSON.stringify(data)});
    const ret = chrome?.storage ? await storage_set( key, JSON.stringify(data) )  : window.localStorage.setItem( key, JSON.stringify(data) );
    return ret;
}

export async function upload_cookie( payload )
{
    const { uuid, password } = payload;
    // console.log( payload );
    // none of the fields can be empty
    if (!password || !uuid) {
        alert("错误的参数");
        return false;
    }
    const domains = payload['domains']?.trim().length > 0 ? payload['domains']?.trim().split("\n") : [];

    const cookies = await get_cookie_by_domains( domains );
    // 用aes对cookie进行加密
    const the_key = CryptoJS.MD5(payload['uuid']+'-'+payload['password']).toString().substring(0,16);
    const encrypted = CryptoJS.AES.encrypt(JSON.stringify(cookies), the_key).toString();
    const endpoint = payload['endpoint'].trim().replace(/\/+$/, '')+'/update';

    // get sha256 of the encrypted data
    const sha256 = CryptoJS.SHA256(uuid+"-"+endpoint+"-"+JSON.stringify(cookies)).toString();
    console.log( "sha256", sha256 );
    const last_uploaded_info = await load_data( 'LAST_UPLOADED_COOKIE' );
    // 如果24小时内已经上传过同样内容的数据，则不再上传
    if( last_uploaded_info && last_uploaded_info.sha256 === sha256 && new Date().getTime() - last_uploaded_info.timestamp < 1000*60*60*24 )
    {
        console.log("same data in 24 hours, skip");
        return {action:'done'};
    }
    
    const payload2 = {
            uuid: payload['uuid'],
            encrypted: encrypted
    };
    // console.log( endpoint, payload2 );
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Encoding': 'gzip',
            },
            body: gzip(JSON.stringify(payload2))
        });
        const result = await response.json();

        if( result && result.action === 'done' ) 
            await save_data( 'LAST_UPLOADED_COOKIE', {"timestamp": new Date().getTime(), "sha256":sha256 } );    

        return result;
    } catch (error) {
        console.log("error", error);
        return false;
    }  
}

export async function download_cookie(payload)
{
    const { uuid, password } = payload;
    const endpoint = payload['endpoint'].trim().replace(/\/+$/, '')+'/get/'+uuid;
    try {
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const result = await response.json();
        if( result && result.encrypted )
        {
            const cookie_data = cookie_decrypt( uuid, result.encrypted, password );
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
                                new_cookie[key] = cookie[key];
                            } );
                            new_cookie.url = buildUrl(cookie.secure, cookie.domain, cookie.path);
                            // console.log(new_cookie);
                            chrome.cookies.set(new_cookie, (e)=>{
                               console.log("set cookie", e);
                            });
                        }
                    }
                }
            }else
            {
                action = false;
            }
            return {action};
        }
    } catch (error) {
        console.log("error", error);
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

async function get_cookie_by_domains( domains = [] )
{
    let ret_cookies = {};
    // 获取cookie
    if( chrome.cookies )
    {
        const cookies = await chrome.cookies.getAll({});
        // console.log("cookies", cookies);
        if( Array.isArray(domains) && domains.length > 0 )
        {
            for( const domain of domains )
            {
                ret_cookies[domain] = [];
                for( const cookie of cookies )
                {
                    if( cookie.domain?.indexOf(domain) >= 0 || domain.indexOf(cookie.domain) >= 0 )
                    {
                        ret_cookies[domain].push( cookie );
                    }
                }    
            }
        }
        else
        {
            // console.log("domains为空");
            for( const cookie of cookies )
            {
                // console.log("the cookie", cookie);
                if( cookie.domain )
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
