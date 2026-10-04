const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

const cors = require('cors');
app.use(cors());

const data_dir = process.env.DATA_DIR || path.join(__dirname, 'data');
// make dir if not exist
if (!fs.existsSync(data_dir)) fs.mkdirSync(data_dir);

var multer = require('multer');
var forms = multer({limits: { fieldSize: 100*1024*1024 }});
app.use(forms.array());

const bodyParser = require('body-parser')
app.use(bodyParser.json({limit : '50mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

const api_root = process.env.API_ROOT ? process.env.API_ROOT.trim().replace(/\/+$/, '') : '';
const { attachKeepAlive } = require('./server-keep-alive.cjs');
const { CookieJar, Cookie } = require('tough-cookie');
const keepAlive = attachKeepAlive(app, {
    dataDir: data_dir, decrypt: cookie_decrypt, encrypt: cookie_encrypt, CookieJar, Cookie,
}, api_root);
process.on('SIGTERM', () => { keepAlive.close(); process.exit(0); });
// console.log(api_root, process.env);

app.all(`${api_root}/`, (req, res) => {
    res.send('Hello World!'+`API ROOT = ${api_root}`);
});

// List all uploaded UUIDs without changing browser cookies or server data.
app.get(`${api_root}/records`, (req, res) => {
    try {
        const records = fs.readdirSync(data_dir, { withFileTypes: true })
            .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(entry => {
                const uuid = entry.name.slice(0, -5);
                try {
                    const data = JSON.parse(fs.readFileSync(path.join(data_dir, entry.name), 'utf8'));
                    if (typeof data.encrypted !== 'string') throw new Error('Invalid record');
                    return { uuid, encrypted: data.encrypted, crypto_type: data.crypto_type || 'legacy' };
                } catch (error) {
                    return { uuid, error: 'Record cannot be read' };
                }
            });
        res.set('Cache-Control', 'no-store');
        res.json({ records });
    } catch (error) {
        res.status(500).json({ error: 'Failed to list uploaded records' });
    }
});

// Clear cookies while retaining UUID records, LocalStorage and encryption.
app.post(`${api_root}/records/clear-cookies`, (req, res) => {
    if (req.body.confirm !== 'clear-all-cookies') {
        res.status(400).json({ error: 'Explicit cleanup confirmation is required' });
        return;
    }
    try {
        let cleared_uuids = 0;
        let deleted_cookies = 0;
        const skipped = [];
        const entries = fs.readdirSync(data_dir, { withFileTypes: true })
            .filter(entry => entry.isFile() && entry.name.endsWith('.json'));
        for (const entry of entries) {
            const uuid = entry.name.slice(0, -5);
            try {
                const file_path = path.join(data_dir, entry.name);
                const stored = JSON.parse(fs.readFileSync(file_path, 'utf8'));
                const mode = stored.crypto_type || 'legacy';
                if (!['none', 'legacy', 'aes-128-cbc-fixed'].includes(mode)) throw new Error('Unsupported encryption');
                if (mode !== 'none' && !req.body.password) throw new Error('Password required');
                const data = cookie_decrypt(uuid, stored.encrypted, req.body.password || '', mode);
                if (!data || !data.cookie_data || typeof data.cookie_data !== 'object' || Array.isArray(data.cookie_data)) throw new Error('Invalid cookie data');
                const count = Object.values(data.cookie_data).reduce((total, cookies) => total + (Array.isArray(cookies) ? cookies.length : 0), 0);
                if (!count) continue;
                data.cookie_data = {};
                data.update_time = new Date().toISOString();
                stored.encrypted = cookie_encrypt(uuid, data, req.body.password || '', mode);
                fs.writeFileSync(file_path, JSON.stringify(stored));
                cleared_uuids++;
                deleted_cookies += count;
            } catch (error) {
                skipped.push({ uuid, error: 'Cannot read, decrypt or clear this record' });
            }
        }
        res.json({ action: 'done', cleared_uuids, deleted_cookies, skipped });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear cookies' });
    }
});

app.post(`${api_root}/update`, (req, res) => {
    const { encrypted, uuid, crypto_type = 'legacy' } = req.body;
    // none of the fields can be empty
    if (!encrypted || !uuid) {
        res.status(400).send('Bad Request');
        return;
    }

    // save encrypted to uuid file
    const file_path = path.join(data_dir, path.basename(uuid)+'.json');
        // Editing a queried record must not overwrite a newer upload.
        if (req.body.expected_encrypted !== undefined) {
            if (!fs.existsSync(file_path) || JSON.parse(fs.readFileSync(file_path, 'utf8')).encrypted !== req.body.expected_encrypted) {
                res.status(409).json({ error: 'Record changed; query again before editing' });
                return;
            }
        }

    const content = JSON.stringify({encrypted, crypto_type});
    fs.writeFileSync(file_path, content);
    if( fs.readFileSync(file_path) == content )
        res.json({"action":"done"});
    else
        res.json({"action":"error"});
});

app.all(`${api_root}/get/:uuid`, (req, res) => {
    const { uuid } = req.params;
    // none of the fields can be empty
    if (!uuid) {
        res.status(400).send('Bad Request');
        return;
    }
    // get encrypted from uuid file
    const file_path = path.join(data_dir, path.basename(uuid)+'.json');
    if (!fs.existsSync(file_path)) {
        res.status(404).send('Not Found');
        return;
    }
    const data = JSON.parse(fs.readFileSync(file_path));
    if( !data )
    {
        res.status(500).send('Internal Serverless Error');
        return;
    }
    else
    {
        // 如果传递了password，则返回解密后的数据
        if( req.body.password )
        {
            const parsed = cookie_decrypt( uuid, data.encrypted, req.body.password, data.crypto_type || 'legacy' );
            res.json(parsed);
        }else
        {
            res.json(data);
        }
    }
});


app.use(function (err, req, res, next) {
    console.error(err);
    res.status(500).send('Internal Serverless Error');
});


const port = process.env.PORT || 8088;
app.listen(port, () => {
    console.log(`Server start on http://localhost:${port}${api_root}`);
});

function cookie_decrypt( uuid, encrypted, password, crypto_type = 'legacy' )
{
    if (crypto_type === 'none') return JSON.parse(encrypted);
    const CryptoJS = require('crypto-js');

    if (crypto_type === 'aes-128-cbc-fixed') {
        // 新的标准 AES-128-CBC 算法，使用固定 IV
        const hash = CryptoJS.MD5(uuid+'-'+password).toString();
        const the_key = hash.substring(0,16);
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
        const the_key = CryptoJS.MD5(uuid+'-'+password).toString().substring(0,16);
        const decrypted = CryptoJS.AES.decrypt(encrypted, the_key).toString(CryptoJS.enc.Utf8);
        const parsed = JSON.parse(decrypted);
        return parsed;
    }
}

function cookie_encrypt( uuid, data, password, crypto_type = 'legacy' )
{
    const CryptoJS = require('crypto-js');
    const data_to_encrypt = JSON.stringify(data);
    if (crypto_type === 'none') return data_to_encrypt;

    if (crypto_type === 'aes-128-cbc-fixed') {
        // 新的标准 AES-128-CBC 算法，使用固定 IV
        const hash = CryptoJS.MD5(uuid+'-'+password).toString();
        const the_key = hash.substring(0,16);
        const fixedIv = CryptoJS.enc.Hex.parse('00000000000000000000000000000000'); // 16字节的0
        const options = {
            iv: fixedIv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        };
        // 使用原始加密数据，不包含 CryptoJS 格式包装
        const encrypted = CryptoJS.AES.encrypt(data_to_encrypt, CryptoJS.enc.Utf8.parse(the_key), options);
        return encrypted.ciphertext.toString(CryptoJS.enc.Base64);
    } else {
        // 原有的 legacy 算法
        const the_key = CryptoJS.MD5(uuid+'-'+password).toString().substring(0,16);
        const encrypted = CryptoJS.AES.encrypt(data_to_encrypt, the_key).toString();
        return encrypted;
    }
}
