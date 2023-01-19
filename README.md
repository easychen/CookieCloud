# CookieCloud

![](extension/assets/icon.png)

CookieCloud是一个和自架服务器同步Cookie的小工具，可以将浏览器的登录态同步到手机和云端，它内置端对端加密，可设定同步时间间隔。

## 商店安装

[Edge商店](https://microsoftedge.microsoft.com/addons/detail/cookiecloud/bffenpfpjikaeocaihdonmgnjjdpjkeo)

## 浏览器插件下载

见 Release

## 服务端[友情贡献|安全|FREE]
一:45.138.70.177:8088  |  来自LSRNB

## 服务器端搭建

### Docker部署

支持架构：linux/amd64,linux/arm/v7,linux/arm64/v8,linux/ppc64le,linux/s390x

```bash
docker run -p=8088:8088 easychen/cookiecloud:latest
```
默认端口 8088 ，镜像地址 [easychen/cookiecloud](https://hub.docker.com/r/easychen/cookiecloud)


### node部署

```bash
cd api && yarn install && node app.js
```
默认端口 8088 

## API 接口

上传：

- method: POST
- url: /update
- 参数
  - uuid
  - encrypted: 本地加密后的字符串

下载：

- method: POST/GET
- url: /get/:uuid
- 参数：
   - password:可选，不提供返回加密后的字符串，提供则发送尝试解密后的内容；


## Cookie加解密算法

### 加密

const text = JSON.stringify(cookies);

1. md5(uuid+password) 取前16位作为key
2. AES.encrypt(text, the_key)

### 解密

1. md5(uuid+password) 取前16位作为key
2. AES.decrypt(encrypted, the_key)

解密后得到 text ，JSON.parse(text) 得到Cookie;

参考函数

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

extension/function.js 查看更多
