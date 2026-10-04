const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const https = require('node:https');

function normalizeRules(rules) {
  if (!Array.isArray(rules) || rules.length > 50) throw new Error('保活任务必须是数组，每个 UUID 最多 50 个地址');
  const unique = new Map();
  for (const rule of rules) {
    const url = new URL(rule.url);
    const interval = Number(rule.interval);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        !Number.isSafeInteger(interval) || interval < 1 || interval > 10080) {
      throw new Error('保活地址必须为 HTTP/HTTPS，间隔为 1 至 10080 分钟');
    }
    url.hash = '';
    if (rule.verify_tls !== undefined && typeof rule.verify_tls !== 'boolean') throw new Error('证书校验选项必须为布尔值');
    unique.set(url.href, { url: url.href, interval, verify_tls: rule.verify_tls !== false });
  }
  return [...unique.values()];
}

function requestPage(url, cookie, timeout = 20000, verifyTls = true) {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const request = client.get(url, {
      ...(url.protocol === 'https:' ? { rejectUnauthorized: verifyTls } : {}),
      headers: { 'User-Agent': 'CookieCloud-SessionAlive/1.0', ...(cookie ? { Cookie: cookie } : {}) },
    }, response => {
      clearTimeout(timer);
      // Session renewal is conveyed in headers; do not retain page bodies.
      let bytes = 0;
      response.on('data', chunk => { bytes += chunk.length; if (bytes > 256 * 1024) response.destroy(); });
      response.on('error', () => {});
      response.setTimeout(timeout, () => response.destroy());
      response.resume();
      resolve({ status: response.statusCode, headers: response.headers });
    });
    const timer = setTimeout(() => request.destroy(new Error('保活请求超时')), timeout);
    request.on('error', error => { clearTimeout(timer); reject(error); });
  });
}

function identity(cookie) {
  return JSON.stringify([cookie.name, cookie.domain, cookie.path || '/', cookie.hostOnly === true || !cookie.domain.startsWith('.'), cookie.storeId || '']);
}

function atomicWrite(file, value) {
  const temporary = `${file}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

function createKeepAlive({ dataDir, decrypt, encrypt, CookieJar, Cookie, request = requestPage, now = Date.now }) {
  const taskDir = path.join(dataDir, '.keep-alive');
  fs.mkdirSync(taskDir, { recursive: true, mode: 0o700 });
  const keyFile = path.join(taskDir, 'key');
  if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, crypto.randomBytes(32), { mode: 0o600, flag: 'wx' });
  const key = fs.readFileSync(keyFile);
  if (key.length !== 32) throw new Error('服务端保活密钥文件无效');
  const tasks = new Map();
  let running = false;
  let stopped = false;
  let timer;

  const uuidPath = uuid => {
    if (typeof uuid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(uuid)) throw new Error('UUID 格式无效');
    return path.join(dataDir, `${uuid}.json`);
  };
  const taskPath = uuid => { uuidPath(uuid); return path.join(taskDir, `${uuid}.json`); };
  const seal = password => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
    return { iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), value: encrypted.toString('hex') };
  };
  const unseal = secret => {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(secret.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(secret.tag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(secret.value, 'hex')), decipher.final()]).toString('utf8');
  };
  const readRecord = (uuid, password) => {
    const stored = JSON.parse(fs.readFileSync(uuidPath(uuid), 'utf8'));
    const mode = stored.crypto_type || 'legacy';
    if (!['none', 'legacy', 'aes-128-cbc-fixed'].includes(mode)) throw new Error('不支持此记录的加密算法');
    if (mode !== 'none' && !password) throw new Error('保活此 UUID 需要解密密码');
    let data;
    try { data = decrypt(uuid, stored.encrypted, password, mode); }
    catch { throw new Error('无法解密此 UUID，请检查密码'); }
    if (!data?.cookie_data || typeof data.cookie_data !== 'object' || Array.isArray(data.cookie_data) ||
        Object.values(data.cookie_data).some(cookies => !Array.isArray(cookies))) throw new Error('Cookie 数据格式无效');
    return { stored, data, mode };
  };
  const persist = task => atomicWrite(taskPath(task.uuid), task);
  const publicTask = task => task ? { uuid: task.uuid, enabled: task.enabled, rules: task.rules } : { enabled: false, rules: [] };

  function configure(uuid, { password = '', rules = [], enabled = true }) {
    uuidPath(uuid);
    if (typeof password !== 'string' || typeof enabled !== 'boolean') throw new Error('密码或启用状态格式无效');
    const normalized = normalizeRules(rules);
    if (enabled && normalized.length) readRecord(uuid, password);
    const previous = tasks.get(uuid);
    const task = { uuid, enabled: enabled && normalized.length > 0, revision: crypto.randomUUID(),
      secret: enabled && normalized.length ? seal(password) : null,
      rules: normalized.map(rule => {
        const old = previous?.rules.find(item => item.url === rule.url && item.interval === rule.interval && (item.verify_tls !== false) === rule.verify_tls);
        return { ...rule, next_run: old?.next_run || now(), last_run: old?.last_run || null,
          last_status: old?.last_status || null, last_error: old?.last_error || null };
      }),
    };
    persist(task);
    tasks.set(uuid, task);
    return publicTask(task);
  }

  for (const file of fs.readdirSync(taskDir).filter(file => file.endsWith('.json'))) {
    try {
      const task = JSON.parse(fs.readFileSync(path.join(taskDir, file), 'utf8'));
      if (path.basename(taskPath(task.uuid)) !== file) continue;
      normalizeRules(task.rules);
      if (task.enabled) unseal(task.secret);
      tasks.set(task.uuid, task);
    } catch { console.error('无法恢复一项服务端保活任务，请重新保存该 UUID 的保活配置'); }
  }

  async function runRule(task, rule) {
    const password = unseal(task.secret);
    const original = readRecord(task.uuid, password);
    const allCookies = Object.values(original.data.cookie_data).flat();
    // Browser containers and partitions must not share a request Cookie header.
    const stores = [...new Set(allCookies.map(cookie => cookie.storeId || ''))];
    const storeId = ['', '0', 'firefox-default'].find(id => stores.includes(id)) ?? stores[0];
    if (stores.length > 1 && !['', '0', 'firefox-default'].includes(storeId)) throw new Error('存在多个 Cookie 容器，请为保活使用独立 UUID');
    const selected = allCookies.filter(cookie => (cookie.storeId || '') === storeId && !cookie.partitionKey && !cookie.firstPartyDomain);
    const jar = new CookieJar(undefined, { prefixSecurity: 'strict', allowSecureOnLocal: false });
    const baseline = new Map(selected.map(cookie => [identity(cookie), cookie]));
    for (const cookie of baseline.values()) {
      const domain = cookie.domain.replace(/^\./, '');
      const hostOnly = cookie.hostOnly === true || !cookie.domain.startsWith('.');
      // Host-only cookies have no Domain attribute, including IP/localhost sites.
      const seed = new Cookie({ key: cookie.name, value: cookie.value, domain: hostOnly ? undefined : domain, path: cookie.path || '/',
        secure: !!cookie.secure, httpOnly: !!cookie.httpOnly, hostOnly,
        expires: cookie.expirationDate ? new Date(cookie.expirationDate * 1000) : 'Infinity',
        sameSite: cookie.sameSite === 'no_restriction' ? 'none' : ['strict', 'lax'].includes(cookie.sameSite) ? cookie.sameSite : undefined,
      });
      const host = domain.includes(':') && !domain.startsWith('[') ? `[${domain}]` : domain;
      jar.setCookieSync(seed, `http${cookie.secure ? 's' : ''}://${host}${cookie.path || '/'}`);
    }
    const changes = new Map();
    const sent = new Set();
    let url = new URL(rule.url);
    let response;
    for (let hop = 0; hop <= 5; hop++) {
      if (stopped || tasks.get(task.uuid)?.revision !== task.revision || !tasks.get(task.uuid)?.enabled) return;
      const cookieHeader = jar.getCookieStringSync(url.href);
      for (const cookie of jar.getCookiesSync(url.href)) {
        const id = identity({ name: cookie.key, domain: cookie.hostOnly ? cookie.domain : '.' + cookie.domain,
          path: cookie.path, hostOnly: cookie.hostOnly, storeId });
        if (baseline.has(id)) sent.add(id);
      }
      if (hop === 0 && !cookieHeader) throw new Error('此地址没有可用的 Cookie，请先上传登录 Cookie');
      // A certificate exception does not follow redirects to another origin.
      const verifyTls = rule.verify_tls !== false || url.origin !== new URL(rule.url).origin;
      response = await request(url, cookieHeader, 20000, verifyTls);
      for (const header of response.headers['set-cookie'] || []) {
        const parsed = Cookie.parse(header);
        if (!parsed || parsed.extensions?.some(item => /^partitioned$/i.test(item))) continue;
        let saved;
        try { saved = jar.setCookieSync(parsed, url.href); } catch { continue; }
        if (!saved) continue;
        const expires = saved.expiryTime(new Date(now()));
        const updated = { name: saved.key, value: saved.value,
          domain: saved.hostOnly ? saved.domain : '.' + saved.domain, path: saved.path,
          secure: !!saved.secure, httpOnly: !!saved.httpOnly, hostOnly: !!saved.hostOnly,
          sameSite: saved.sameSite === 'none' ? 'no_restriction' : saved.sameSite || 'unspecified',
          session: !Number.isFinite(expires), ...(storeId ? { storeId } : {}),
          ...(Number.isFinite(expires) ? { expirationDate: expires / 1000 } : {}),
        };
        changes.set(identity(updated), { cookie: updated, deleted: expires <= now() });
      }
      if (![301, 302, 303, 307, 308].includes(response.status) || !response.headers.location) break;
      if (hop === 5) throw new Error('保活重定向次数过多');
      const next = new URL(response.headers.location, url);
      if (!['http:', 'https:'].includes(next.protocol) || next.username || next.password || (url.protocol === 'https:' && next.protocol !== 'https:')) throw new Error('保活重定向地址无效');
      url = next;
    }
    if (stopped || tasks.get(task.uuid)?.revision !== task.revision) return;
    // Re-read after network I/O so browser uploads and other websites survive.
    if (changes.size) {
      const latest = readRecord(task.uuid, password);
      const current = Object.values(latest.data.cookie_data).flat();
      for (const id of new Set([...sent, ...changes.keys()])) {
        const before = baseline.get(id);
        const after = current.find(cookie => identity(cookie) === id && !cookie.partitionKey && !cookie.firstPartyDomain);
        if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('保活期间登录 Cookie 已更新，本次响应未写回；下次使用最新记录');
      }
      for (const [id, change] of changes) {
        let found = false;
        for (const [group, cookies] of Object.entries(latest.data.cookie_data)) {
          latest.data.cookie_data[group] = cookies.flatMap(cookie => {
            if (cookie.partitionKey || cookie.firstPartyDomain || identity(cookie) !== id) return [cookie];
            found = true;
            // Retain browser metadata while applying the response's scope/expiry.
            const updated = { ...cookie, ...change.cookie };
            if (change.cookie.session) delete updated.expirationDate;
            return change.deleted ? [] : [updated];
          });
        }
        if (!found && !change.deleted) {
          const domain = change.cookie.domain;
          if (!Object.hasOwn(latest.data.cookie_data, domain)) Object.defineProperty(latest.data.cookie_data, domain, { value: [], enumerable: true, writable: true, configurable: true });
          latest.data.cookie_data[domain].push(change.cookie);
        }
      }
      latest.data.update_time = new Date(now()).toISOString();
      latest.stored.encrypted = encrypt(task.uuid, latest.data, password, latest.mode);
      atomicWrite(uuidPath(task.uuid), latest.stored);
    }
    if (response.status < 200 || response.status >= 400) throw new Error(`保活请求失败：HTTP ${response.status}`);
    return response.status;
  }

  async function tick() {
    if (running || stopped) return;
    running = true;
    try {
      for (const task of tasks.values()) {
        if (!task.enabled) continue;
        for (const rule of task.rules) {
          if (stopped || tasks.get(task.uuid)?.revision !== task.revision) break;
          if (rule.next_run > now()) continue;
          rule.last_run = now();
          try { rule.last_status = await runRule(task, rule) || null; rule.last_error = null; }
          catch (error) { rule.last_status = null; rule.last_error = error.code ? `网络错误：${error.code}` : error.message; }
          if (!stopped && tasks.get(task.uuid)?.revision === task.revision) {
            rule.next_run = now() + rule.interval * 60_000;
            persist(task);
          }
        }
      }
    } finally { running = false; }
  }

  return {
    configure, status: uuid => { uuidPath(uuid); return publicTask(tasks.get(uuid)); }, tick,
    start() { stopped = false; if (!timer) { timer = setInterval(() => { void tick().catch(() => console.error('服务端保活调度失败')); }, 30_000); timer.unref(); void tick().catch(() => console.error('服务端保活调度失败')); } },
    close() { stopped = true; clearInterval(timer); timer = undefined; },
  };
}

function attachKeepAlive(app, options, apiRoot = '') {
  const service = createKeepAlive(options);
  app.get(`${apiRoot}/keep-alive/:uuid`, (req, res) => {
    try { res.set('Cache-Control', 'no-store').json(service.status(req.params.uuid)); }
    catch { res.status(400).json({ error: 'UUID 格式无效' }); }
  });
  app.post(`${apiRoot}/keep-alive/:uuid`, (req, res) => {
    try {
      res.json({ action: 'done', ...service.configure(req.params.uuid, req.body) });
      void service.tick().catch(() => console.error('服务端保活调度失败'));
    }
    catch (error) {
      res.status(error.code === 'ENOENT' ? 404 : 400).json({ error: error.code === 'ENOENT' ? '请先上传此 UUID 的 Cookie，再启用服务端保活' : error.message });
    }
  });
  service.start();
  return service;
}

module.exports = { createKeepAlive, attachKeepAlive, normalizeRules, requestPage };
