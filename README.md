# CookieCloud

![](extension/assets/icon.png)

CookieCloud是一个向自架服务器同步Cookie的小工具，可以将电脑的登录态同步到手机和云端，它支持端对端加密，可设定同步时间间隔。

## 浏览器插件下载

见 Release

## 服务器端搭建

需要node环境

```bash
cd api && yarn install && node app.js
```
默认端口 8088 

## Cookie解密算法

1. md5(uuid+password) 取前16位作为key
2. AES.decrypt(encrypted, the_key)

```node
function cookie_decrypt( uuid, encrypted, password )
{
    const CryptoJS = require('crypto-js');
    const the_key = CryptoJS.MD5(uuid+'-'+password).toString().substring(0,16);
    const decrypted = CryptoJS.AES.decrypt(encrypted, the_key).toString(CryptoJS.enc.Utf8);
    const parsed = JSON.parse(decrypted);
    return parsed;
}
```
