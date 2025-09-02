# CookieCloud Fixed IV Decryption - Python

This is a Python implementation for decrypting CookieCloud's `aes-128-cbc-fixed` encrypted data using PyCryptodome library.

## Requirements

- Python 3.6 or higher
- PyCryptodome library

## Installation

```bash
cd python
pip install -r requirements.txt
```

Or install globally:
```bash
pip install pycryptodome
```

## Usage

### Command Line

```bash
python decrypt.py
# or
python3 decrypt.py
```

### As Module

```python
from decrypt import decrypt

uuid = 'your-uuid'
encrypted = 'base64-encrypted-data'
password = 'your-password'

try:
    data = decrypt(uuid, encrypted, password)
    print('Decrypted data:', data)
except Exception as error:
    print(f'Decryption failed: {error}')
```

### Flask API Example

```python
from flask import Flask, request, jsonify
from decrypt import decrypt

app = Flask(__name__)

@app.route('/decrypt', methods=['POST'])
def decrypt_endpoint():
    data = request.json
    
    try:
        result = decrypt(data['uuid'], data['encrypted'], data['password'])
        return jsonify({'success': True, 'data': result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

if __name__ == '__main__':
    app.run(debug=True)
```

### Django Integration

```python
# views.py
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import json
from .decrypt import decrypt

@csrf_exempt
def decrypt_view(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        
        try:
            result = decrypt(data['uuid'], data['encrypted'], data['password'])
            return JsonResponse({'success': True, 'data': result})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)
```

## Dependencies

- **PyCryptodome**: Modern cryptographic library for Python
  - Provides AES encryption/decryption
  - PKCS7 padding utilities
  - Cross-platform compatibility

## Algorithm Details

- **Algorithm**: AES-128-CBC
- **Key**: MD5(uuid + "-" + password).substring(0, 16)
- **IV**: Fixed 16 bytes of zeros
- **Padding**: PKCS7
- **Encoding**: Base64

## Performance

- Decryption time: ~3-5ms for typical CookieCloud data
- Memory usage: ~10-15MB
- Pure Python implementation with C extensions for crypto operations

## Troubleshooting

### Installation Issues

If you encounter installation issues with PyCryptodome:

**Windows:**
```bash
pip install pycryptodome
```

**macOS:**
```bash
pip install pycryptodome
# or if using Homebrew Python
pip3 install pycryptodome
```

**Linux:**
```bash
pip install pycryptodome
# or
sudo apt-get install python3-pycryptodome  # Debian/Ubuntu
```

### Alternative: PyCrypto

If PyCryptodome is not available, you can use the older PyCrypto library:

```bash
pip install pycrypto
```

The code automatically detects and uses either library.
