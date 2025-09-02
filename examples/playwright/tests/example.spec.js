const { test, expect } = require('@playwright/test');
const { COOKIE_CLOUD_HOST, COOKIE_CLOUD_UUID, COOKIE_CLOUD_PASSWORD } = require('./config') ;

test('使用CookieCloud访问nexusphp', async ({ page, browser }) => {
  // 读取云端cookie并解密
  const cookies = await cloud_cookie(COOKIE_CLOUD_HOST, COOKIE_CLOUD_UUID, COOKIE_CLOUD_PASSWORD);
  // 添加cookie到浏览器上下文
  const context = await browser.newContext();
  await context.addCookies(cookies);
  page = await context.newPage();
  // 这之后已经带着Cookie了，按正常流程访问
  await page.goto('https://demo.nexusphp.org/index.php');
  await expect(page.getByRole('link', { name: 'magik' })).toHaveText("magik");
  await context.close();
});


async function cloud_cookie( host, uuid, password, crypto_type = 'legacy' )
{
  const fetch = require('cross-fetch');
  let url = host+'/get/'+uuid;
  // 如果指定了加密算法，添加查询参数
  if (crypto_type && crypto_type !== 'legacy') {
    url += `?crypto_type=${crypto_type}`;
  }
  const ret = await fetch(url);
  const json = await ret.json();
  let cookies = [];
  if( json && json.encrypted )
  {
    // 优先使用参数指定的算法，其次使用服务器返回的算法，最后使用legacy
    const useCryptoType = crypto_type || json.crypto_type || 'legacy';
    const {cookie_data, local_storage_data} = cookie_decrypt(uuid, json.encrypted, password, useCryptoType);
    for( const key in cookie_data )
    {
      // merge cookie_data[key] to cookies
      cookies = cookies.concat(cookie_data[key].map( item => {
        if( item.sameSite == 'unspecified' ) item.sameSite = 'Lax';
        return item;
      } ));
    }
  }
  return cookies;
}

function cookie_decrypt( uuid, encrypted, password, crypto_type = 'legacy' )
{
    const CryptoJS = require('crypto-js');
    const hash = CryptoJS.MD5(uuid+'-'+password).toString();
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