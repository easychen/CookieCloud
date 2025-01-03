import os
import sys
import json
import hashlib
import requests
from base64 import b64decode
try:
    from Cryptodome.Cipher import AES
    from Cryptodome.Util.Padding import unpad
    from Cryptodome.Protocol.KDF import PBKDF2
except ImportError:
    from Crypto.Cipher import AES
    from Crypto.Util.Padding import unpad
    from Crypto.Protocol.KDF import PBKDF2


def decrypt_cookie(server_url, uuid, password):
    try:
        # 构建API URL
        url = f"{server_url}/get/{uuid}"

        # 发送请求获取加密数据
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()

        # 生成解密密钥 (MD5(uuid + '-' + password)的前16位)
        key = hashlib.md5(f"{uuid}-{password}".encode()
                          ).hexdigest()[:16].encode()

        # 解密数据
        try:
            # 解析加密文本
            ciphertext = data['encrypted']

            # 分离salt和IV (CryptoJS格式)
            encrypted = b64decode(ciphertext)
            salt = encrypted[8:16]
            ct = encrypted[16:]

            # 使用OpenSSL EVP_BytesToKey导出方式
            key_iv = b""
            prev = b""
            while len(key_iv) < 48:
                prev = hashlib.md5(prev + key + salt).digest()
                key_iv += prev

            _key = key_iv[:32]
            _iv = key_iv[32:48]

            # 创建cipher并解密
            cipher = AES.new(_key, AES.MODE_CBC, _iv)
            pt = unpad(cipher.decrypt(ct), AES.block_size)

            # 解析JSON
            return json.loads(pt.decode('utf-8'))

        except Exception as e:
            print(f"数据格式错误: {e}")
            return None

    except requests.exceptions.RequestException as e:
        print(f"请求错误: {e}")
        return None
    except Exception as e:
        print(f"解密错误: {e}")
        return None


def main():
    # 设置默认值
    default_server = "http://127.0.0.1:8088"
    default_uuid = "default-uuid"
    default_password = "default-password"

    # 网站和对应的环境变量名映射
    WEBSITE_ENV_MAPPING = {
        'bilibili.com': 'BILIBILI_COOKIE_12345678',
        'zhihu.com': 'ZHIHU_COOKIES',
        'xiaohongshu.com': 'XIAOHONGSHU_COOKIE'
    }

    if len(sys.argv) == 1:
        server_url = default_server
        uuid = default_uuid
        password = default_password
    elif len(sys.argv) == 4:
        server_url = sys.argv[1]
        uuid = sys.argv[2]
        password = sys.argv[3]
    else:
        print("使用方法: python decrypt.py [服务器地址] [uuid] [password]")
        print("示例: python decrypt.py http://your-server:8088 your-uuid your-password")
        print(f"未提供参数时使用默认值：")
        print(f"服务器地址: {default_server}")
        print(f"UUID: {default_uuid}")
        print(f"Password: {default_password}")
        sys.exit(1)

    decrypted_data = decrypt_cookie(server_url, uuid, password)
    if decrypted_data:
        print("解密成功！")
        cookie_data_all = json.dumps(
            decrypted_data['cookie_data'], ensure_ascii=False, indent=2)
        cookie_data = json.loads(cookie_data_all)

    # 删除已存在的 rsshub.env 文件
    if os.path.exists('rsshub.env'):
        os.remove('rsshub.env')
        print("已删除现有的 rsshub.env 文件")

    # 收集所有支持的网站的cookie
    env_contents = []

    # 处理每个网站的 cookie
    for website, cookies in cookie_data.items():
        formatted_cookies = []
        for cookie in cookies:
            formatted_cookies.append(f"{cookie['name']}={cookie['value']}")

        # 将格式化的 cookie 连接成一个字符串
        result = '; '.join(formatted_cookies)

        # 打印网站和对应的结果
        print(f"{website}:")
        print(result)
        print()  # 添加空行以分隔不同网站的结果

        # 检查是否是需要特殊处理的网站
        website_lower = website.lower()
        if website_lower in WEBSITE_ENV_MAPPING:
            env_var = WEBSITE_ENV_MAPPING[website_lower]
            env_contents.append(f"{env_var} = {result}")
            print(f"已处理 {website} 的 cookie")

    # 将所有收集到的环境变量一次性写入文件
    if env_contents:
        with open('rsshub.env', 'w', encoding='utf-8') as f:
            f.write('\n'.join(env_contents) + '\n')
        print("已将所有 cookie 写入 rsshub.env 文件")


if __name__ == "__main__":
    main()
