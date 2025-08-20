#!/usr/bin/env python3

"""
CookieCloud Fixed IV Decryption - Python Implementation

Algorithm: AES-128-CBC
Key: MD5(uuid + "-" + password).substring(0, 16)
IV: Fixed 16 bytes of zeros (0x00000000000000000000000000000000)
Padding: PKCS7
Encoding: Base64
"""

import hashlib
import json
import base64
import os
from pathlib import Path

try:
    from Crypto.Cipher import AES
    from Crypto.Util.Padding import unpad
except ImportError:
    try:
        from Cryptodome.Cipher import AES
        from Cryptodome.Util.Padding import unpad
    except ImportError:
        print("❌ Error: PyCrypto or PyCryptodome is required")
        print("Install with: pip install -r requirements.txt")
        exit(1)


def decrypt(uuid: str, encrypted: str, password: str) -> dict:
    """
    Decrypt CookieCloud data using standard Python crypto
    
    Args:
        uuid: User UUID
        encrypted: Base64 encrypted data
        password: Password
        
    Returns:
        Decrypted data dictionary
    """
    # 1. Generate key: first 16 characters of MD5(uuid + "-" + password)
    key_input = f"{uuid}-{password}"
    hash_result = hashlib.md5(key_input.encode('utf-8')).hexdigest()
    key = hash_result[:16].encode('utf-8')
    
    # 2. Fixed IV: 16 bytes of zeros
    iv = b'\x00' * 16
    
    # 3. Decode base64 encrypted data
    encrypted_data = base64.b64decode(encrypted)
    
    # 4. Create AES-128-CBC cipher
    cipher = AES.new(key, AES.MODE_CBC, iv)
    
    # 5. Decrypt and remove padding
    decrypted = cipher.decrypt(encrypted_data)
    unpadded = unpad(decrypted, AES.block_size)
    
    # 6. Parse JSON
    result = json.loads(unpadded.decode('utf-8'))
    
    return result


def print_cookies(cookie_data: dict):
    """Pretty print cookie data"""
    print('\n🍪 Cookie Data:')
    for domain, cookies in cookie_data.items():
        print(f'\n📍 {domain}:')
        for i, cookie in enumerate(cookies, 1):
            print(f'  {i}. {cookie["name"]} = {cookie["value"]}')
            if cookie.get('path'):
                print(f'     Path: {cookie["path"]}')
            if cookie.get('secure'):
                print(f'     Secure: {cookie["secure"]}')
            if cookie.get('httpOnly'):
                print(f'     HttpOnly: {cookie["httpOnly"]}')


def print_local_storage(local_storage_data: dict):
    """Pretty print local storage data"""
    print('\n💾 Local Storage Data:')
    for domain, storage in local_storage_data.items():
        print(f'\n📍 {domain}:')
        for key, value in storage.items():
            display_value = value[:50] + '...' if len(value) > 50 else value
            print(f'  {key} = {display_value}')


def main():
    print('=== CookieCloud Fixed IV Decryption - Python ===\n')
    
    # Test parameters
    uuid = 'jNp1T2qZ6shwVW9VmjLvp1'
    password = 'iZ4PCqzfJcHyiwAQcCuupD'
    data_file = Path(__file__).parent.parent / 'jNp1T2qZ6shwVW9VmjLvp1_iZ4PCqzfJcHyiwAQcCuupD.json'
    
    print('📋 Test Parameters:')
    print(f'UUID: {uuid}')
    print(f'Password: {password}')
    print(f'Data File: {data_file.name}')
    
    try:
        # Read encrypted data
        with open(data_file, 'r', encoding='utf-8') as f:
            raw_data = f.read()
        data = json.loads(raw_data)
        
        print(f'\n🔐 Encrypted Data Length: {len(data["encrypted"])} characters')
        print(f'Encrypted Data (first 50 chars): {data["encrypted"][:50]}...')
        
        # Decrypt
        print('\n🔓 Decrypting...')
        decrypted = decrypt(uuid, data['encrypted'], password)
        
        print('✅ Decryption successful!')
        print(f'\n📊 Decrypted Data Summary:')
        print(f'- Cookie domains: {len(decrypted.get("cookie_data", {}))}')
        print(f'- Local storage domains: {len(decrypted.get("local_storage_data", {}))}')
        print(f'- Update time: {decrypted.get("update_time")}')
        
        # Print detailed data
        if decrypted.get('cookie_data'):
            print_cookies(decrypted['cookie_data'])
        
        if decrypted.get('local_storage_data'):
            print_local_storage(decrypted['local_storage_data'])
        
        print('\n🎉 Python decryption completed successfully!')
        
    except FileNotFoundError:
        print(f'❌ Error: Data file not found: {data_file}')
        exit(1)
    except Exception as error:
        print(f'❌ Decryption failed: {error}')
        exit(1)


if __name__ == '__main__':
    main()
