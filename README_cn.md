# CookieCloud

[中文](./README_cn.md) | [English](./README.md)

![](extension/assets/icon.png)

CookieCloud是一个和自架服务器同步Cookie的小工具，可以将浏览器的Cookie及Local storage同步到手机和云端，它内置端对端加密，可设定同步时间间隔。

> 0.3.0 版本改用 wxt 重写了，支持固定 IV 的加密算法，解密时支持更多的标准库，详见 wxt 分支

> 最新版本支持了对同域名下local storage的同步

[Telegram频道](https://t.me/CookieCloudTG) | [Telegram交流群](https://t.me/CookieCloudGroup)

## ⚠️ Breaking Change

由于支持 local storage 的呼声很高，因此插件版本 0.1.5+ 除了 cookie 也支持了 local storage，这导致加密文本格式变化（从独立cookie对象变成{ cookie_data, local_storage_data }）。

另外，为避免配置同步导致的上下行冲突，配置存储从 remote 改到了 local，使用之前版本的同学需要重新配置一下。

对此带来的不便深表歉意 🙇🏻‍♂️


## 官方教程

![](images/20230121141854.png)  

1. 视频教程：[B站](https://www.bilibili.com/video/BV1fR4y1a7zb) | [Youtube](https://youtu.be/3oeSiGHXeQw) 求关注求订阅🥺
1. 图文教程：[掘金](https://juejin.cn/post/7190963442017108027)

## FAQ

1. 目前只支持单向同步，即一个浏览器上传，一个浏览器下载
2. 浏览器扩展只官方支持 Chrome 和 Edge。其他 Chrome 内核浏览器可用，但未经测试。使用源码 `cd extension && pnpm build --target=firefox-mv2` 可自行编译 Firefox 版本，注意 Firefox 的 Cookie 格式和 Chrome 系有差异，不能混用

![](images/20230121092535.png)  

## 浏览器插件

1. 商店安装：[Edge商店](https://microsoftedge.microsoft.com/addons/detail/cookiecloud/bffenpfpjikaeocaihdonmgnjjdpjkeo) | [Chrome商店](https://chrome.google.com/webstore/detail/cookiecloud/ffjiejobkoibkjlhjnlgmcnnigeelbdl)（ 注意：商店版本会因审核有延迟
1. 手动下载安装：见 Release

## 服务器端

### 官方测试服务器

> 仅供测试使用，不保证稳定性，建议自行搭建以进一步加强数据安全

- <https://ccc.ft07.com>

### 第三方

> 由第三方提供的免费服务器端，可供试用，稳定性由第三方决定。感谢他们的分享 👏

> 由于部分服务器端版本较久，如测试提示失败可添加域名关键词再试

- <http://45.138.70.177:8088> 由[LSRNB](https://github.com/lsrnb)提供
- <http://45.145.231.148:8088> 由[shellingford37](https://github.com/shellingford37)提供
- <http://nastool.cn:8088> 由[nastools](https://github.com/jxxghp/nas-tools)提供
- <https://cookies.xm.mk> 由[Xm798](https://github.com/Xm798)提供
- <https://cookie.xy213.cn> 由[xuyan0213](https://github.com/xuyan0213)提供
- <https://cookie-cloud.vantis-space.com> 由[vantis](https://github.com/vantis-zh)提供
- <https://cookiecloud.25wz.cn> 由[wuquejs](https://github.com/wuquejs)提供
- <https://cookiecloud.zhensnow.uk> 由[YeTianXingShi](https://github.com/YeTianXingShi)提供
- <https://cookiecloud.ddsrem.com> 由[DDSRem](https://github.com/DDS-Derek)提供
- <https://cookiecloud.d0zingcat.xyz> 由[d0zingcat](https://github.com/d0zingcat)提供

### 自行架设

#### 方案一：通过Docker部署，简单、推荐方案

支持架构：linux/amd64,linux/arm/v7,linux/arm64/v8,linux/ppc64le,linux/s390x

##### 用 Docker 命令启动

```bash
docker run -p=8088:8088 easychen/cookiecloud:latest
```
默认端口 8088 ，镜像地址 [easychen/cookiecloud](https://hub.docker.com/r/easychen/cookiecloud)

###### 指定API目录·可选步骤可跳过

添加环境变量 -e API_ROOT=/`二级目录需要以斜杠开头` 可以指定二级目录:

```bash
docker run -e API_ROOT=/cookie -p=8088:8088 easychen/cookiecloud:latest
```

##### 用 Docker-compose 启动

```yml
version: '3'
services:
  cookiecloud:
    image: easychen/cookiecloud:latest
    container_name: cookiecloud-app
    restart: always
    volumes:
      - ./data:/data/api/data
    ports:
      - 8088:8088
```

[docker-compose.yml由aitixiong提供](https://github.com/easychen/CookieCloud/issues/42)

#### 方案二：通过 Node 部署

> 适用于没有 docker 但支持 node 的环境，需要自行先安装 node

```bash
cd api && yarn install && node app.js
```
默认端口 8088 ，同样也支持 API_ROOT 环境变量

## 调试和日志查看

进入浏览器插件列表，点击 service worker，会弹出一个面板，可查看运行日志

![](images/20230121095327.png)  

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


### 内网明文模式

在插件的「加密算法」中选择「不加密（明文）」，密码可以留空，保存后即可同步。默认仍使用原有加密算法。

此模式同时适用于 Cookie 和 LocalStorage，上传和服务器存储均为明文，仅适用于可信内网。需要使用包含此改动的插件和服务端；现有 Docker Compose 使用预构建镜像，须自行构建并替换镜像才能启用。

协议使用 `crypto_type: "none"`，`encrypted` 字段为未经加密的 JSON 字符串（包含 `cookie_data`、`local_storage_data`、`update_time`）。`GET /get/:uuid` 返回该字段及模式标记，调用方可直接 `JSON.parse(encrypted)` 获取数据；`POST /get/:uuid` 带 `password` 时也会直接解析明文。原有加密数据不会自动转换，选择新模式后需要重新上传。

### 下次自动同步时间

设置页显示按已保存配置与浏览器后台计时计算的下次自动上传/下载时间及倒计时。修改草稿不会影响计划，保存后刷新显示；暂停时显示暂停状态。浏览器休眠或后台调度可能使实际执行时间晚于预计时间。

### 清空服务端全部 Cookie

查询区域提供「清空服务端全部 Cookie」，确认服务器地址并点击「确认清空全部 Cookie」后，处理所有 UUID 的记录，清空 `cookie_data`，保留 UUID、LocalStorage、其他字段和原有加密方式。清理结果显示 UUID 和 Cookie 数量。

加密记录使用当前填写的密码，密码不同、数据损坏或无法写入的 UUID 会保留并列在跳过结果中，可换用对应密码后再次清理。浏览器本地 Cookie 不会删除，自动上传可能重新填充服务端。

接口为 `POST /records/clear-cookies`，JSON 参数 `{ "confirm": "clear-all-cookies", "password": "..." }`。缺少明确确认标记会返回 HTTP 400，不会清理数据。

### 修改服务端 Cookie

修改面板提供「同时更新当前浏览器的 Cookie」。在当前配置 UUID 的上传模式下默认勾选，保存后将相同范围、路径、存储和分区的 Cookie 值写入本地，保留域名和 HttpOnly，避免后续手动上传用本地旧值覆盖服务端修改。未勾选时仅修改服务端。浏览器已有的其他范围 Cookie 不会删除，仍可能被上传。

查询结果的「删除」按钮可删除指定范围、路径及分区的 Cookie。操作面板显示 UUID、实际域名和路径，点击「删除并上传」后写入服务端，保留其他数据及加密方式，并沿用最新记录合并和冲突保护。此操作不会删除当前浏览器 Cookie，自动上传可能再次上传它。

查询全部记录并搜索目标 Cookie 后，点击该行「修改值」，编辑后点击「保存并上传」。修改写入该行所属的 UUID，保留其他 Cookie、LocalStorage、Cookie 属性和原有加密方式；加密记录需使用对应密码。允许空值。

保存前读取最新记录，按 Cookie 名称、域名、路径、主机范围、存储及分区定位目标，保留其他 Cookie 和 LocalStorage 的最新数据。无关的自动上传会合并；提交 `expected_encrypted` 检测读写之间的更新，HTTP 409 时自动重试，最多三次。目标 Cookie 的值已被其他同步改动时提示重新查询。浏览器自动上传可能在后续同步时覆盖服务端手动修改。

同步到浏览器时保留 `hostOnly` 和分区属性，主机 Cookie 不传入 `domain`，避免错误地新增域 Cookie。查询表格显示「仅当前主机」或「域及子域」范围。服务端已有的两个不同范围的记录会保留，需确认后手动清理不需要的记录。

### 当前页面 Cookie 与服务端保活

在已登录的网站页面点击工具栏中的 CookieCloud，设置页顶部会显示「当前页面 Cookie」。读取适用于该页面 URL 的 Cookie（包含 HttpOnly），保留域名、路径、Secure、SameSite 和存储范围。切换到其他网站后再次点击插件会更新目标页面。

可复制 Cookie Header 或完整 JSON，也可直接修改各 Cookie 的值，保持原值上传。「保存修改到浏览器」只写回本地；「上传页面 Cookie」将这些 Cookie 合并到当前 UUID 的服务端记录，保留其他网站 Cookie、LocalStorage 和已有记录的加密方式。默认同时将修改写回浏览器，避免后续自动上传旧值；网站已更新登录 Cookie 时需重新读取。

先上传已登录页面的 Cookie，再点击「将此页面加入服务端保活」，设置间隔，最后在「服务端 Session Alive 保活」区域点击「保存并启用服务端保活」。地址按 `https://example.com/account|10` 配置，一行一个，默认间隔 60 分钟，支持 1 至 10080 分钟，每个 UUID 最多 50 个地址。点击「刷新任务状态」查看最近执行结果、错误和下次执行时间。

保活由服务端独立执行，插件不会打开、刷新网页或发起保活请求；关闭浏览器后任务仍会继续。服务端每 30 秒检查到期任务，使用该 UUID 的最新 Cookie 发起 GET 请求，遵守域名、路径、Secure 和普通存储范围，处理重定向和响应的 Set-Cookie，并保留其他网站数据、LocalStorage 与原有加密方式。任务和进度在服务端重启后恢复。

加密 UUID 需要将解密密码交给服务端。任务凭据通过 AES-256-GCM 加密保存到 `data/.keep-alive/`，该目录的密钥文件权限为 0600，目录权限为 0700；备份时必须同时保留密钥和任务文件。状态接口不返回密码。底部「保存」和插件暂停模式仅影响浏览器同步，服务端任务需单独点击「停用服务端保活」停止。

需要部署包含此功能的新服务端。服务端仅执行 HTTP 请求，不运行 JavaScript，HTTP 200 不代表仍然登录，访问能否续期由网站决定。浏览器再次自动上传时可能覆盖服务端更新的 Cookie，需按使用方式选择同步模式。普通容器、隐私容器和分区 Cookie 不会混入同一请求；多个容器建议使用独立 UUID。

### 配置导入与导出

设置页顶部提供「导出配置」和「导入配置」。导出下载当前页面配置的 JSON 文件，包含 UUID、密码、请求 Header 及其他设置，不包含 Cookie 或 LocalStorage 数据，请妥善保管。

导入支持此插件导出的版本 1 配置，以及直接保存的配置 JSON 对象。导入前校验字段，成功后填入草稿，缺少的字段保留当前值；检查后点击「保存」才应用于自动同步。文件大小上限为 1 MB。

### 设置标签页与查询全部 Cookie

点击插件图标会打开 `popup.html` 设置标签页，再次点击会将已有设置页的目标更新为当前网站。未保存的配置自动保留为草稿，点击「保存」才应用于后台同步；重新读取或切换目标页面会放弃尚未保存的 Cookie 值修改。

页面底部的「查询 / 刷新全部记录」读取当前服务器所有 UUID 的上传记录，可按 UUID、域名、Cookie 名称或值搜索，并展开查看完整数据。明文记录无需密码；加密记录使用当前填写的密码在插件内解密，不同密码的 UUID 需分别填写对应密码后重新查询。

服务端增加 `GET /records`，返回 `{ "records": [{ "uuid": "...", "crypto_type": "...", "encrypted": "..." }] }`，不写入浏览器 Cookie。此接口按内网部署需求提供全部记录，不要求逐个提供 UUID。损坏的文件保留 UUID 并返回 `error`，不影响其余记录。

## Cookie加解密算法

### 加密

const data = JSON.stringify(cookies);

1. md5(uuid+password) 取前16位作为key
2. AES.encrypt(data, the_key)

### 解密

1. md5(uuid+password) 取前16位作为key
2. AES.decrypt(encrypted, the_key)

解密后得到 data ，JSON.parse(data) 得到数据对象{ cookie_data, local_storage_data };

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

`extension/function.js` 查看更多

## 无头浏览器使用CookieCloud示例

请参考 `examples/playwright/tests/example.spec.js` 

```javascript
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

```

### 函数

```javascript
async function cloud_cookie( host, uuid, password )
{
  const fetch = require('cross-fetch');
  const url = host+'/get/'+uuid;
  const ret = await fetch(url);
  const json = await ret.json();
  let cookies = [];
  if( json && json.encrypted )
  {
    const {cookie_data, local_storage_data} = cookie_decrypt(uuid, json.encrypted, password);
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

function cookie_decrypt( uuid, encrypted, password )
{
    const CryptoJS = require('crypto-js');
    const the_key = CryptoJS.MD5(uuid+'-'+password).toString().substring(0,16);
    const decrypted = CryptoJS.AES.decrypt(encrypted, the_key).toString(CryptoJS.enc.Utf8);
    const parsed = JSON.parse(decrypted);
    return parsed;
}
```

## Python 解密

可参考这篇文章 [《Python 中 Crypto 对 JS 中 CryptoJS AES 加密解密的实现及问题处理》](https://blog.homurax.com/2022/08/12/python-crypto/) 或使用[PyCookieCloud](https://github.com/lupohan44/PyCookieCloud)

[python2实现](https://github.com/easychen/CookieCloud/issues/76)

[另一个使用实例](examples/decrypt.py)

## Go 解密算法

[感谢sagan分享](https://github.com/easychen/CookieCloud/issues/49) 

```go
package main

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/md5"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
)

const (
	pkcs5SaltLen = 8
	aes256KeyLen = 32
)

type CookieCloudBody struct {
	Uuid      string `json:"uuid,omitempty"`
	Encrypted string `json:"encrypted,omitempty"`
}

func main() {
	apiUrl := strings.TrimSuffix(os.Getenv("COOKIE_CLOUD_HOST"), "/")
	uuid := os.Getenv("COOKIE_CLOUD_UUID")
	password := os.Getenv("COOKIE_CLOUD_PASSWORD")

	if apiUrl == "" || uuid == "" || password == "" {
		log.Fatalf("COOKIE_CLOUD_HOST, COOKIE_CLOUD_UUID and COOKIE_CLOUD_PASSWORD env must be set")
	}
	var data *CookieCloudBody
	res, err := http.Get(apiUrl + "/get/" + uuid)
	if err != nil {
		log.Fatalf("Failed to request server: %v", err)
	}
	if res.StatusCode != 200 {
		log.Fatalf("Server return status %d", res.StatusCode)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		log.Fatalf("Failed to read server response: %v", err)
	}
	err = json.Unmarshal(body, &data)
	if err != nil {
		log.Fatalf("Failed to parse server response as json: %v", err)
	}
	keyPassword := Md5String(uuid, "-", password)[:16]
	decrypted, err := DecryptCryptoJsAesMsg(keyPassword, data.Encrypted)
	if err != nil {
		log.Fatalf("Failed to decrypt: %v", err)
	}
	fmt.Printf("Decrypted: %s\n", decrypted)
}

// Decrypt a CryptoJS.AES.encrypt(msg, password) encrypted msg.
// ciphertext is the result of CryptoJS.AES.encrypt(), which is the base64 string of
// "Salted__" + [8 bytes random salt] + [actual ciphertext].
// actual ciphertext is padded (make it's length align with block length) using Pkcs7.
// CryptoJS use a OpenSSL-compatible EVP_BytesToKey to derive (key,iv) from (password,salt),
// using md5 as hash type and 32 / 16 as length of key / block.
// See: https://stackoverflow.com/questions/35472396/how-does-cryptojs-get-an-iv-when-none-is-specified ,
// https://stackoverflow.com/questions/64797987/what-is-the-default-aes-config-in-crypto-js
func DecryptCryptoJsAesMsg(password string, ciphertext string) ([]byte, error) {
	const keylen = 32
	const blocklen = 16
	rawEncrypted, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		return nil, fmt.Errorf("failed to base64 decode Encrypted: %v", err)
	}
	if len(rawEncrypted) < 17 || len(rawEncrypted)%blocklen != 0 || string(rawEncrypted[:8]) != "Salted__" {
		return nil, fmt.Errorf("invalid ciphertext")
	}
	salt := rawEncrypted[8:16]
	encrypted := rawEncrypted[16:]
	key, iv := BytesToKey(salt, []byte(password), md5.New(), keylen, blocklen)
	newCipher, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("failed to create aes cipher: %v", err)
	}
	cfbdec := cipher.NewCBCDecrypter(newCipher, iv)
	decrypted := make([]byte, len(encrypted))
	cfbdec.CryptBlocks(decrypted, encrypted)
	decrypted, err = pkcs7strip(decrypted, blocklen)
	if err != nil {
		return nil, fmt.Errorf("failed to strip pkcs7 paddings (password may be incorrect): %v", err)
	}
	return decrypted, nil
}

// From https://github.com/walkert/go-evp .
// BytesToKey implements the Openssl EVP_BytesToKey logic.
// It takes the salt, data, a hash type and the key/block length used by that type.
// As such it differs considerably from the openssl method in C.
func BytesToKey(salt, data []byte, h hash.Hash, keyLen, blockLen int) (key, iv []byte) {
	saltLen := len(salt)
	if saltLen > 0 && saltLen != pkcs5SaltLen {
		panic(fmt.Sprintf("Salt length is %d, expected %d", saltLen, pkcs5SaltLen))
	}
	var (
		concat   []byte
		lastHash []byte
		totalLen = keyLen + blockLen
	)
	for ; len(concat) < totalLen; h.Reset() {
		// concatenate lastHash, data and salt and write them to the hash
		h.Write(append(lastHash, append(data, salt...)...))
		// passing nil to Sum() will return the current hash value
		lastHash = h.Sum(nil)
		// append lastHash to the running total bytes
		concat = append(concat, lastHash...)
	}
	return concat[:keyLen], concat[keyLen:totalLen]
}

// BytesToKeyAES256CBC implements the SHA256 version of EVP_BytesToKey using AES CBC
func BytesToKeyAES256CBC(salt, data []byte) (key []byte, iv []byte) {
	return BytesToKey(salt, data, sha256.New(), aes256KeyLen, aes.BlockSize)
}

// BytesToKeyAES256CBCMD5 implements the MD5 version of EVP_BytesToKey using AES CBC
func BytesToKeyAES256CBCMD5(salt, data []byte) (key []byte, iv []byte) {
	return BytesToKey(salt, data, md5.New(), aes256KeyLen, aes.BlockSize)
}

// return the MD5 hex hash string (lower-case) of input string(s)
func Md5String(inputs ...string) string {
	keyHash := md5.New()
	for _, str := range inputs {
		io.WriteString(keyHash, str)
	}
	return hex.EncodeToString(keyHash.Sum(nil))
}

// from https://gist.github.com/nanmu42/b838acc10d393bc51cb861128ce7f89c .
// pkcs7strip remove pkcs7 padding
func pkcs7strip(data []byte, blockSize int) ([]byte, error) {
	length := len(data)
	if length == 0 {
		return nil, errors.New("pkcs7: Data is empty")
	}
	if length%blockSize != 0 {
		return nil, errors.New("pkcs7: Data is not block-aligned")
	}
	padLen := int(data[length-1])
	ref := bytes.Repeat([]byte{byte(padLen)}, padLen)
	if padLen > blockSize || padLen == 0 || !bytes.HasSuffix(data, ref) {
		return nil, errors.New("pkcs7: Invalid padding")
	}
	return data[:length-padLen], nil
}

```


## Deno 参考

[感谢JokerQyou分享](https://github.com/easychen/CookieCloud/issues/41)

```ts
import {crypto, toHashString} from 'https://deno.land/std@0.200.0/crypto/mod.ts'
import {decode } from 'https://deno.land/std@0.200.0/encoding/base64.ts'

const evpkdf = async (
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
): Promise<{
  key: Uint8Array,
  iv: Uint8Array,
}> => {
  const keySize = 32
  const ivSize = 16
  const derivedKey = new Uint8Array(keySize + ivSize)
  let currentBlock = 1
  let digest = new Uint8Array(0)
  const hashLength = 16
  while ((currentBlock - 1) * hashLength < keySize + ivSize) {
    const data = new Uint8Array(digest.length + password.length + salt.length)
    data.set(digest)
    data.set(password, digest.length)
    data.set(salt, digest.length + password.length)
    digest = await crypto.subtle.digest('MD5', data).then(buf => new Uint8Array(buf))

    for (let i = 1; i < iterations; i++) {
      digest = await crypto.subtle.digest('MD5', digest).then(buf => new Uint8Array(buf))
    }
    derivedKey.set(digest, (currentBlock - 1) * hashLength)
    currentBlock++
  }
  return {
    key: derivedKey.slice(0, keySize),
    iv: derivedKey.slice(keySize),
  }
}

const main = async (env: Record<string, string>) => {
  const {
    COOKIE_CLOUD_HOST: CC_HOST,
    COOKIE_CLOUD_UUID: CC_UUID,
    COOKIE_CLOUD_PASSWORD: CC_PW,
  } = env
  const resp = await fetch(`${CC_HOST}/get/${CC_UUID}`).then(r => r.json())
  console.log(resp)
  let cookies = []
  if (resp && resp.encrypted)  {
    console.log(resp.encrypted)
    console.log(new TextDecoder().decode(decode(resp.encrypted)).slice(0, 16))
    const decoded = decode(resp.encrypted)
    // Salted__ + 8 bytes salt, followed by cipher text
    const salt = decoded.slice(8, 16)
    const cipher_text = decoded.slice(16)

    const password = await crypto.subtle.digest(
      'MD5',
      new TextEncoder().encode(`${CC_UUID}-${CC_PW}`),
    ).then(
      buf => toHashString(buf).substring(0, 16)
    ).then(
      p => new TextEncoder().encode(p)
    )
    const {key, iv} = await evpkdf(password, salt, 1)
    const privete_key = await crypto.subtle.importKey(
      'raw',
      key,
      'AES-CBC',
      false,
      ['decrypt'],
    )

    const d = await crypto.subtle.decrypt(
      {name: 'AES-CBC', iv},
      privete_key,
      cipher_text,
    )
    console.log('decrypted:', new TextDecoder().decode(d))
}
```

HTTPS 保活默认校验证书。对于证书链不完整的可信地址，可在插件勾选该地址的“不校验 HTTPS 证书”后保存任务，或在该规则中设置 `verify_tls: false`。此时请求无法验证服务器身份；例外仅适用于该规则的原始源，跨源重定向仍校验证书，不影响其他任务和插件同步。

插件设置页顶部提供「浅色 Light / 深色 Dark / 跟随系统」主题选项，默认跟随系统。选择立即生效并保存在当前浏览器，无需点击底部保存；跟随系统会响应系统外观变化。主题偏好独立于同步配置，适用于整个设置页。
