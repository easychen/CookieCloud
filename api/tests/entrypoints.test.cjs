const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');

for (const entry of ['api', 'docker']) {
  test(`${entry} server entrypoint renews and persists a session without the extension`, async t => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cookiecloud-entrypoint-'));
    let visits = 0;
    const website = http.createServer((req, res) => {
      visits++;
      assert.equal(req.headers.cookie, 'session=logged-in');
      res.setHeader('Set-Cookie', 'session=renewed; Path=/; HttpOnly; Max-Age=3600');
      res.end('logged in');
    });
    await new Promise(resolve => website.listen(0, '127.0.0.1', resolve));
    const available = http.createServer();
    await new Promise(resolve => available.listen(0, '127.0.0.1', resolve));
    const port = available.address().port;
    await new Promise(resolve => available.close(resolve));
    const base = `http://127.0.0.1:${port}/test`;
    const root = path.resolve(__dirname, '../..');
    const child = spawn(process.execPath, [path.join(root, entry, 'app.js')], {
      cwd: path.join(root, entry),
      env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, API_ROOT: '/test', NODE_PATH: path.join(root, 'api/node_modules') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    t.after(async () => {
      if (child.exitCode === null) {
        const exited = new Promise(resolve => child.once('exit', resolve));
        child.kill('SIGTERM');
        await exited;
      }
      website.closeAllConnections();
      await new Promise(resolve => website.close(resolve));
      fs.rmSync(dataDir, { recursive: true, force: true });
    });
    const waitFor = async check => {
      const end = Date.now() + 8000;
      let lastError = '';
      while (Date.now() < end) {
        try { if (await check()) return; } catch (error) { lastError = error.message; }
        if (child.exitCode !== null) throw new Error(output);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error('Server test timed out: ' + lastError + '\n' + output);
    };
    await waitFor(async () => (await fetch(base + '/')).ok);
    const post = (url, body) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = { cookie_data: { '127.0.0.1': [{ name: 'session', value: 'logged-in', domain: '127.0.0.1', path: '/', secure: false, hostOnly: true, httpOnly: true }] }, local_storage_data: { retained: { key: 'value' } } };
    assert.equal((await post('/update', { uuid: 'entrypoint-uuid', crypto_type: 'none', encrypted: JSON.stringify(data) })).status, 200);
    const enabled = await post('/keep-alive/entrypoint-uuid', { password: '', rules: [{ url: `http://127.0.0.1:${website.address().port}/account`, interval: 10 }] });
    assert.equal(enabled.status, 200);
    await waitFor(async () => {
      const status = await (await fetch(base + '/keep-alive/entrypoint-uuid')).json();
      if (status.rules[0].last_error) throw new Error(status.rules[0].last_error);
      return status.rules[0].last_status === 200;
    });
    assert.equal(visits, 1);
    const stored = await (await fetch(base + '/get/entrypoint-uuid')).json();
    const renewed = JSON.parse(stored.encrypted);
    assert.equal(renewed.cookie_data['127.0.0.1'][0].value, 'renewed');
    assert.equal(renewed.local_storage_data.retained.key, 'value');
    const records = await (await fetch(base + '/records')).json();
    assert.equal(records.records.length, 1);
    assert.equal(records.records[0].uuid, 'entrypoint-uuid');
    assert.equal((await (await post('/keep-alive/entrypoint-uuid', { enabled: false })).json()).enabled, false);
  });
}
