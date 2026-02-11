const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const apiDir = path.join(__dirname, '..');
const port = 19000 + Math.floor(Math.random() * 1000);

const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cookiecloud-setup-'));
const runtimeFile = path.join(runtimeRoot, 'runtime-config.json');
const dataDir = path.join(runtimeRoot, 'data');

const env = {
  ...process.env,
  PORT: String(port),
  API_ROOT: '/api',
  CC_HMAC_KEYS: 'default:abcde12345abcde12345abcde12345abcde12345abcde12345abcde12345',
  CC_SETUP_UI_ENABLE: 'true',
  CC_SETUP_DISABLE_RESTART: 'true',
  CC_RUNTIME_CONFIG_FILE: runtimeFile,
  CC_DATA_DIR: dataDir,
  NODE_ENV: 'test'
};

const child = spawn('node', ['app.js'], {
  cwd: apiDir,
  env,
  stdio: ['ignore', 'pipe', 'pipe']
});

let stderrLogs = '';
child.stderr.on('data', (chunk) => {
  stderrLogs += String(chunk || '');
});

(async () => {
  try {
    await waitForHealth();

    let response = await request({ method: 'GET', path: '/setup' });
    assert.strictEqual(response.statusCode, 401, 'setup page without login header should be blocked');

    response = await request({
      method: 'GET',
      path: '/setup',
      headers: { 'X-HC-User-ID': 'u10001' }
    });
    assert.strictEqual(response.statusCode, 200, 'setup page with login header should be available');
    assert.match(response.bodyText, /CookieCloud.*配置向导/, 'setup page html should be returned');

    response = await request({
      method: 'GET',
      path: '/setup/api/bootstrap',
      headers: { 'X-HC-User-ID': 'u10001' }
    });
    assert.strictEqual(response.statusCode, 200, 'bootstrap should work');
    assert.ok(Array.isArray(response.json.config.hmac_keys), 'bootstrap should contain masked hmac keys');

    response = await request({
      method: 'POST',
      path: '/setup/api/preview',
      headers: {
        'X-HC-User-ID': 'u10001',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        api_root: 'api',
        hmac_keys: [{ key_id: 'k1', secret: 'short' }],
        hmac_ttl_sec: 300,
        max_body_mb: 10,
        allowed_origins: [],
        enable_legacy_read: true
      })
    });
    assert.strictEqual(response.statusCode, 400, 'invalid preview payload should fail');

    const realSecret = 'abcde12345abcde12345abcde12345abcde12345abcde12345abcde12345';
    response = await request({
      method: 'POST',
      path: '/setup/api/preview',
      headers: {
        'X-HC-User-ID': 'u10001',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        api_root: '/api',
        hmac_keys: [{ key_id: 'k1', secret: realSecret }],
        hmac_ttl_sec: 300,
        max_body_mb: 10,
        allowed_origins: ['chrome-extension://abcdefghijklmnopqrstuvwxzyabcd'],
        enable_legacy_read: true
      })
    });
    assert.strictEqual(response.statusCode, 200, 'valid preview should succeed');
    assert.ok(!response.bodyText.includes(realSecret), 'preview must not return plaintext secret');

    response = await request({
      method: 'POST',
      path: '/setup/api/apply',
      headers: {
        'X-HC-User-ID': 'u10001',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        api_root: '/api',
        hmac_keys: [{ key_id: 'k1', secret: realSecret }],
        hmac_ttl_sec: 300,
        max_body_mb: 10,
        allowed_origins: ['chrome-extension://abcdefghijklmnopqrstuvwxzyabcd'],
        enable_legacy_read: true
      })
    });
    assert.strictEqual(response.statusCode, 202, 'apply should return accepted');
    assert.strictEqual(response.json.restart_scheduled, false, 'restart should be disabled in test');

    await wait(120);
    const runtimeConfig = JSON.parse(fs.readFileSync(runtimeFile, 'utf8'));
    assert.strictEqual(runtimeConfig.api_root, '/api', 'runtime config should persist api_root');
    assert.ok(String(runtimeConfig.cc_hmac_keys || '').includes('k1:'), 'runtime config should persist hmac key string');
    assert.strictEqual(runtimeConfig.updated_by_user_id, 'u10001', 'runtime config should persist audit user id');

    response = await request({ method: 'GET', path: '/api/get/test_user_001' });
    assert.strictEqual(response.statusCode, 401, 'unsigned read request should still be blocked');

    console.log('setup-ui.test.js passed');
  } catch (error) {
    console.error('setup-ui.test.js failed:', error);
    if (stderrLogs) {
      console.error('stderr logs:\n', stderrLogs);
    }
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
    await wait(150);
    safeRm(runtimeRoot);
  }
})();

function safeRm(target) {
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch (error) {
    // ignore cleanup errors
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(timeoutMs = 8000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const result = await request({ method: 'GET', path: '/api/health' }).catch(() => null);
    if (result && result.statusCode === 200) return;
    await wait(200);
  }

  throw new Error('server failed to start in time');
}

function request({ method, path: reqPath, headers, body }) {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      hostname: '127.0.0.1',
      port,
      path: reqPath,
      method,
      headers: headers || {}
    };

    const req = http.request(requestOptions, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const bodyText = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try {
          json = JSON.parse(bodyText);
        } catch (error) {
          json = null;
        }

        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          bodyText,
          json
        });
      });
    });

    req.on('error', reject);

    if (body) req.write(body);
    req.end();
  });
}
