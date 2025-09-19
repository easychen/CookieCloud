# CookieCloud

[中文](./README_cn.md) | [English](./README.md)

![](extension/assets/icon.png)

CookieCloud is a small tool for syncing cookies with your self-hosted server, allowing you to synchronize browser cookies and local storage to your phone and cloud. It features built-in end-to-end encryption and allows you to set a synchronization interval.

> Since version 0.3.0, the project has been rewritten using **wxt**. It now supports encryption algorithms with a fixed IV and supports more standard libraries for decryption. See the **wxt** branch for details.


> The latest version now supports synchronization of local storage under the same domain name.

[Telegram channel](https://t.me/CookieCloudTG) | [Telegram group](https://t.me/CookieCloudGroup)

## ⚠️ Breaking Change

Due to the high demand for local storage support, plugin version 0.1.5+ now also supports local storage in addition to cookies. This has resulted in a change to the encrypted text format (from a separate cookie object to `{ cookie_data, local_storage_data }`).

Furthermore, to avoid conflicts in configuration synchronization, the configuration storage has been moved from remote to local. Users of previous versions will need to reconfigure their setup.

We apologize for any inconvenience this may cause 🙇🏻‍♂️


## Official Tutorials

![](images/20230121141854.png)  

1. Video: [Bilibili](https://www.bilibili.com/video/BV1fR4y1a7zb) | [YouTube](https://youtu.be/3oeSiGHXeQw) - Please follow and subscribe 🥺
2. Tutorial: [Juejin](https://juejin.cn/post/7190963442017108027)

## FAQ

1. Currently, synchronization is only one-way, meaning one browser can upload while another downloads.
2. The browser extension officially supports Chrome and Edge. Other Chromium-based browsers might work but have not been tested. Use the source code `cd extension && pnpm build --target=firefox-mv2` to compile a version for Firefox yourself. Be aware that Firefox's cookie format is different from Chrome's and they cannot be mixed.

![](images/20230121092535.png)  

## Browser Plugin

1. Installation from store: [Edge Store](https://microsoftedge.microsoft.com/addons/detail/cookiecloud/bffenpfpjikaeocaihdonmgnjjdpjkeo) | [Chrome Store](https://chrome.google.com/webstore/detail/cookiecloud/ffjiejobkoibkjlhjnlgmcnnigeelbdl) (Note: Versions in the store might be delayed due to review processes)
2. Manual download and installation: See Release


## Server Side

### Third Party

> Free server-side services provided by third parties are available for trial. Stability is determined by the third parties. We appreciate their sharing 👏

> Some server-side versions might be outdated. If tests fail, try adding domain keywords before retrying.

- <http://45.138.70.177:8088> provided by [LSRNB](https://github.com/lsrnb)
- <http://45.145.231.148:8088> provided by [shellingford37](https://github.com/shellingford37)
- <http://nastool.cn:8088> provided by [nastools](https://github.com/jxxghp/nas-tools)
- <https://cookies.xm.mk> provided by [Xm798](https://github.com/Xm798)
- <https://cookie.xy213.cn> provided by [xuyan0213](https://github.com/xuyan0213)
- <https://cookie-cloud.vantiszh.com> provided by [vantis](https://github.com/vantis-zh)
- <https://cookiecloud.25wz.cn> provided by [wuquejs](https://github.com/wuquejs)
- <https://cookiecloud.zhensnow.uk> provided by [YeTianXingShi](https://github.com/YeTianXingShi)
- <https://cookiecloud.ddsrem.com> provided by [DDSRem](https://github.com/DDS-Derek)
- <https://cookiecloud.d0zingcat.xyz> provided by [d0zingcat](https://github.com/d0zingcat)

### Self-hosting

#### Option One: Deploy through Docker, simple, recommended method

Supports architectures: linux/amd64, linux/arm64, etc.


##### Start with Docker Command

```bash
docker run -p=8088:8088 easychen/cookiecloud:latest
```
Default port 8088, image address [easychen/cookiecloud](https://hub.docker.com/r/easychen/cookiecloud)

###### Specify API Directory - Optional Step, Can Be Skipped

Add the environment variable -e API_ROOT=/`subdirectory must start with a slash` to specify a subdirectory:

```bash
docker run -e API_ROOT=/cookie -p=8088:8088 easychen/cookiecloud:latest
```

##### Start with Docker-compose

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

[docker-compose.yml provided by aitixiong](https://github.com/easychen/CookieCloud/issues/42)

#### Option Two: Deploy with Node

> Suitable for environments without docker but supporting node, requires installing node in advance

```bash
cd api && yarn install && node app.js
```
Default port 8088, also supports the API_ROOT environment variable

## Debugging and Log Viewing

Enter the browser plugin list, click on service worker, a panel will pop up where you can view the operation log

![](images/20230121095327.png)  

## API Interface

Upload:

- method: POST
- url: /update
- parameters
  - uuid
  - encrypted: the string encrypted locally

Download:

- method: POST/GET
- url: /get/:uuid
- parameters:
   - password: optional, if not provided returns the encrypted string, if provided attempts to decrypt and send the content;


## Cookie Encryption and Decryption Algorithm

### Encryption

const data = JSON.stringify(cookies);

1. md5(uuid+password) take the first 16 characters as the key
2. AES.encrypt(data, the_key)

### Decryption

1. md5(uuid+password) take the first 16 characters as the key
2. AES.decrypt(encrypted, the_key)

After decryption, get data, JSON.parse(data) to obtain the data object { cookie_data, local_storage_data };

Reference function

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

See `extension/function.js` for more

## Headless Browser Example Using CookieCloud

Refer to `examples/playwright/tests/example.spec.js` 

```javascript
test('Access nexusphp using CookieCloud', async ({ page, browser }) => {
  // Read and decrypt cloud cookie
  const cookies = await cloud_cookie(COOKIE_CLOUD_HOST, COOKIE_CLOUD_UUID, COOKIE_CLOUD_PASSWORD);
  // Add cookie to browser context
  const context = await browser.newContext();
  await context.addCookies(cookies);
  page = await context.newPage();
  // From this point on, the Cookie is already attached, proceed as normal
  await page.goto('https://demo.nexusphp.org/index.php');
  await expect(page.getByRole('link', { name: 'magik' })).toHaveText("magik");
  await context.close();
});

```

### Functions

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

## Python Decryption

Refer to the article ["Implementation and Problem Handling of Crypto in Python for AES Encryption and Decryption in JS CryptoJS"](https://blog.homurax.com/2022/08/12/python-crypto/) or use [PyCookieCloud](https://github.com/lupohan44/PyCookieCloud)

[python2](https://github.com/easychen/CookieCloud/issues/76)

[another example](examples/decrypt.py)

## Go Decryption Algorithm

[Thanks to sagan for sharing](https://github.com/easychen/CookieCloud/issues/49) 

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


## Deno Reference

[Thanks to JokerQyou for sharing](https://github.com/easychen/CookieCloud/issues/41)

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

Translated by GPT4


