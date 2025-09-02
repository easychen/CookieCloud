# CookieCloud Fixed IV Decryption - Node.js

This is a Node.js implementation for decrypting CookieCloud's `aes-128-cbc-fixed` encrypted data using standard Node.js crypto library.

## Requirements

- Node.js 12.0.0 or higher
- No external dependencies (uses built-in crypto module)

## Installation

```bash
cd nodejs
npm install
```

## Usage

### Command Line

```bash
npm start
# or
node decrypt.js
```

### As Module

```javascript
const { decrypt } = require('./decrypt.js');

const uuid = 'your-uuid';
const encrypted = 'base64-encrypted-data';
const password = 'your-password';

try {
    const data = decrypt(uuid, encrypted, password);
    console.log('Decrypted data:', data);
} catch (error) {
    console.error('Decryption failed:', error.message);
}
```

### API Integration

```javascript
const express = require('express');
const { decrypt } = require('./decrypt.js');

const app = express();
app.use(express.json());

app.post('/decrypt', (req, res) => {
    const { uuid, encrypted, password } = req.body;
    
    try {
        const data = decrypt(uuid, encrypted, password);
        res.json({ success: true, data });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.listen(3000, () => {
    console.log('CookieCloud decrypt API running on port 3000');
});
```

## Algorithm Details

- **Algorithm**: AES-128-CBC
- **Key**: MD5(uuid + "-" + password).substring(0, 16)
- **IV**: Fixed 16 bytes of zeros
- **Padding**: PKCS7
- **Encoding**: Base64

## Performance

- Decryption time: ~1-2ms for typical CookieCloud data
- Memory usage: ~5-10MB
- No external dependencies required
