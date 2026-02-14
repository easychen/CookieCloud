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

    response = await request({ method: 'GET', path: '/setup/api/download/chrome' });
    assert.strictEqual(response.statusCode, 401, 'extension download without login header should be blocked');

    response = await request({
      method: 'GET',
      path: '/setup/api/download/chrome',
      headers: { 'X-HC-User-ID': 'u10001' }
    });
    assert.strictEqual(response.statusCode, 404, 'extension download should return 404 when package is missing');

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
        'Content-Type': 'application/json',
        'Origin': `http://127.0.0.1:${port}`
      },
      body: JSON.stringify({
        api_root: '/api',
        hmac_keys: [{ key_id: 'k1', secret: realSecret }],
        hmac_ttl_sec: 300,
        max_body_mb: 10,
        allowed_origins: [],
        enable_legacy_read: true
      })
    });
    assert.strictEqual(response.statusCode, 200, 'same-origin preview request should be allowed');

    // Extra coverage: LazyCat deployment may rewrite Host to an internal service name while the browser
    // origin remains the public domain. Start a second server with LAZYCAT_APP_DOMAIN set.
    const port2 = port + 2000 + Math.floor(Math.random() * 500);
    const runtimeRoot2 = fs.mkdtempSync(path.join(os.tmpdir(), 'cookiecloud-setup-'));
    const runtimeFile2 = path.join(runtimeRoot2, 'runtime-config.json');
    const dataDir2 = path.join(runtimeRoot2, 'data');
    const env2 = {
      ...env,
      PORT: String(port2),
      LAZYCAT_APP_DOMAIN: 'cookiecloud.example.test',
      CC_RUNTIME_CONFIG_FILE: runtimeFile2,
      CC_DATA_DIR: dataDir2
    };
    const child2 = spawn('node', ['app.js'], {
      cwd: apiDir,
      env: env2,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    try {
      await waitForHealth(8000, port2);
      response = await request({
        method: 'POST',
        path: '/setup/api/preview',
        port: port2,
        headers: {
          'X-HC-User-ID': 'u10001',
          'Content-Type': 'application/json',
          'Origin': 'https://cookiecloud.example.test',
          'Host': 'cookiecloud:8088',
          'X-Forwarded-Proto': 'https'
        },
        body: JSON.stringify({
          api_root: '/api',
          hmac_keys: [{ key_id: 'k1', secret: realSecret }],
          hmac_ttl_sec: 300,
          max_body_mb: 10,
          allowed_origins: [],
          enable_legacy_read: true
        })
      });
      assert.strictEqual(response.statusCode, 200, 'same-site preview should be allowed when LAZYCAT_APP_DOMAIN is set');
    } finally {
      child2.kill('SIGTERM');
      await wait(150);
      safeRm(runtimeRoot2);
    }

    response = await request({
      method: 'POST',
      path: '/setup/api/preview',
      headers: {
        'X-HC-User-ID': 'u10001',
        'Content-Type': 'application/json',
        'Origin': 'https://evil.example'
      },
      body: JSON.stringify({
        api_root: '/api',
        hmac_keys: [{ key_id: 'k1', secret: realSecret }],
        hmac_ttl_sec: 300,
        max_body_mb: 10,
        allowed_origins: [],
        enable_legacy_read: true
      })
    });
    assert.strictEqual(response.statusCode, 403, 'cross-origin preview request should still be blocked');
    assert.strictEqual(response.json?.message, 'Origin is not allowed', 'cross-origin preview should return CORS message');

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

async function waitForHealth(timeoutMs = 8000, targetPort = port) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const result = await request({ method: 'GET', path: '/api/health', port: targetPort }).catch(() => null);
    if (result && result.statusCode === 200) return;
    await wait(200);
  }

  throw new Error('server failed to start in time');
}

function request({ method, path: reqPath, headers, body, port: portOverride }) {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      hostname: '127.0.0.1',
      port: portOverride || port,
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
