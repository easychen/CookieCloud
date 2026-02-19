const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function defaultBootstrapPayload() {
  return {
    status: 'ok',
    user: {
      user_id: 'u10001',
      user_name: 'rainier',
      display_name: 'Rainier'
    },
    runtime_config_file: '/lzcapp/var/cookiecloud/runtime-config.json',
    runtime_config_source: 'missing',
    environment: {
      lazycat_app_id: 'cloud.lazycat.app.cookiecloud',
      lazycat_app_domain: 'cookiecloud.example.test',
      lazycat_box_domain: 'example.test',
      lazycat_box_name: 'devbox'
    },
    config: {
      api_root: '/api',
      hmac_ttl_sec: 300,
      max_body_mb: 10,
      allowed_origins: [],
      enable_legacy_read: true,
      data_dir: '/lzcapp/var/cookiecloud/data',
      hmac_keys: [{ key_id: 'k1', secret_masked: 'abcd****wxyz' }]
    },
    plugin_defaults: {
      server_address: '',
      auth_key_id: '',
      crypto_type: 'aes-256-gcm-v1'
    },
    restart: {
      auto_restart_enabled: true,
      disable_flag: 'CC_SETUP_DISABLE_RESTART'
    }
  };
}

function defaultTutorialPayload() {
  return {
    status: 'ok',
    sections: [
      {
        id: 'intro',
        title: '1. 测试章节',
        paragraphs: ['用于测试初始化流程']
      }
    ]
  };
}

function buildPreviewPayload(body, baseUrl = 'https://cookiecloud.example.test') {
  const keyId = body.hmac_keys && body.hmac_keys[0] ? body.hmac_keys[0].key_id : '';

  return {
    status: 'ok',
    summary: {
      api_root: body.api_root,
      key_ids: body.hmac_keys.map((item) => item.key_id),
      hmac_ttl_sec: body.hmac_ttl_sec,
      max_body_mb: body.max_body_mb,
      allowed_origins_count: body.allowed_origins.length,
      enable_legacy_read: body.enable_legacy_read
    },
    blocks: {
      backend_env: [
        `API_ROOT=${body.api_root}`,
        `CC_HMAC_TTL_SEC=${body.hmac_ttl_sec}`,
        `CC_MAX_BODY_MB=${body.max_body_mb}`,
        `CC_ENABLE_LEGACY_READ=${body.enable_legacy_read ? 'true' : 'false'}`
      ].join('\n'),
      plugin_template: [
        `Server Address: ${baseUrl}${body.api_root}`,
        `Auth Key ID: ${keyId}`,
        'Auth Secret: <填写你本地保存的真实密钥>',
        'Encryption Algorithm: AES-256-GCM (PBKDF2)'
      ].join('\n'),
      verify_commands: [
        `curl -i ${baseUrl}${body.api_root}/get/<YOUR_UUID>`,
        'api/scripts/smoke_hmac.sh'
      ].join('\n\n')
    },
    warnings: ['返回内容已脱敏，不包含明文密钥。']
  };
}

function createJsonResponse(statusCode, payload) {
  return {
    ok: statusCode >= 200 && statusCode < 300,
    status: statusCode,
    async json() {
      return payload;
    }
  };
}

async function bootPage(options = {}) {
  const repoRoot = options.repoRoot || path.resolve(__dirname, '..', '..', '..');
  const htmlPath = path.join(repoRoot, 'api/public/setup/index.html');
  const scriptPath = path.join(repoRoot, 'api/public/setup/setup.js');

  let html = fs.readFileSync(htmlPath, 'utf8');
  html = html.replace(/<script\s+src="\/setup\/setup\.js"><\/script>/, '');

  const timers = new Map();
  let timerSeq = 1;
  const clipboardWrites = [];
  const fetchCalls = [];

  const dom = new JSDOM(html, {
    url: 'https://cookiecloud.example.test/setup',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });

  const { window } = dom;
  const { document } = window;

  window.scrollTo = () => {};
  window.confirm = () => true;

  Object.defineProperty(window, 'crypto', {
    configurable: true,
    value: {
      getRandomValues(buffer) {
        for (let i = 0; i < buffer.length; i += 1) {
          buffer[i] = (i * 37 + 11) % 256;
        }
        return buffer;
      }
    }
  });

  window.navigator.clipboard = {
    async writeText(text) {
      clipboardWrites.push(String(text));
    }
  };

  document.execCommand = (cmd) => {
    if (cmd !== 'copy') return false;
    const textarea = document.querySelector('textarea');
    if (textarea) clipboardWrites.push(String(textarea.value || ''));
    return true;
  };

  window.setTimeout = (fn, delay = 0, ...args) => {
    const id = timerSeq;
    timerSeq += 1;
    timers.set(id, {
      fn,
      delay: Number(delay) || 0,
      args
    });
    return id;
  };

  window.clearTimeout = (id) => {
    timers.delete(id);
  };

  function runTimersByDelay(maxDelay) {
    const entries = [...timers.entries()]
      .filter(([, timer]) => timer.delay <= maxDelay)
      .sort((a, b) => (a[1].delay - b[1].delay) || (a[0] - b[0]));

    for (const [id, timer] of entries) {
      timers.delete(id);
      timer.fn(...timer.args);
    }

    return entries.length;
  }

  function runAllTimers(limit = 1000) {
    let count = 0;
    while (true) {
      const ran = runTimersByDelay(Number.POSITIVE_INFINITY);
      if (!ran) return count;
      count += ran;
      if (count > limit) {
        throw new Error('Possible infinite timer loop detected');
      }
    }
  }

  const fetchHandler = options.fetchHandler || (async ({ pathname, body }) => {
    if (pathname === '/setup/api/bootstrap') {
      return createJsonResponse(200, defaultBootstrapPayload());
    }

    if (pathname === '/setup/api/tutorial') {
      return createJsonResponse(200, defaultTutorialPayload());
    }

    if (pathname === '/setup/api/preview') {
      return createJsonResponse(200, buildPreviewPayload(body));
    }

    if (pathname === '/setup/api/apply') {
      return createJsonResponse(202, {
        status: 'accepted',
        message: 'Configuration saved. Restart scheduled.',
        restart_scheduled: true,
        runtime_config_file: '/lzcapp/var/cookiecloud/runtime-config.json',
        applied: {
          api_root: body.api_root,
          key_ids: body.hmac_keys.map((item) => item.key_id)
        }
      });
    }

    return createJsonResponse(404, { message: `unhandled path: ${pathname}` });
  });

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const parsed = new URL(url, window.location.origin);

    let body = null;
    if (typeof init.body === 'string' && init.body.trim()) {
      try {
        body = JSON.parse(init.body);
      } catch (error) {
        body = null;
      }
    }

    fetchCalls.push({
      pathname: parsed.pathname,
      method: init.method || 'GET',
      body,
      rawBody: init.body || null
    });

    return fetchHandler({
      pathname: parsed.pathname,
      method: init.method || 'GET',
      body,
      rawBody: init.body || null,
      headers: init.headers || {}
    });
  };

  const setupScript = fs.readFileSync(scriptPath, 'utf8');
  window.eval(setupScript);

  await flushAsync();

  function query(selector) {
    const element = document.querySelector(selector);
    assert(element, `Element not found: ${selector}`);
    return element;
  }

  function click(selectorOrElement) {
    const element = typeof selectorOrElement === 'string' ? query(selectorOrElement) : selectorOrElement;
    element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  }

  function setValue(selectorOrElement, value) {
    const element = typeof selectorOrElement === 'string' ? query(selectorOrElement) : selectorOrElement;
    element.value = value;
    element.dispatchEvent(new window.Event('input', { bubbles: true }));
    element.dispatchEvent(new window.Event('change', { bubbles: true }));
  }

  function getActiveStep() {
    const active = document.querySelector('.wizard-step.active');
    if (!active) return 0;
    if (active.id === 'wizardStep1') return 1;
    if (active.id === 'wizardStep2') return 2;
    if (active.id === 'wizardStep3') return 3;
    return 0;
  }

  function isStepVisible(step) {
    return query(`#wizardStep${step}`).classList.contains('active');
  }

  function getToast() {
    const toast = query('#globalToast');
    return {
      text: String(toast.textContent || '').trim(),
      visible: toast.classList.contains('show'),
      className: toast.className
    };
  }

  function getLastRequest(pathname) {
    const matched = fetchCalls.filter((item) => item.pathname === pathname);
    return matched.length ? matched[matched.length - 1] : null;
  }

  function text(selector) {
    return String(query(selector).textContent || '');
  }

  function getProgressStep(stepNum) {
    return query(`.progress-step[data-step=\"${stepNum}\"]`);
  }

  async function flushAsync(iterations = 6) {
    for (let i = 0; i < iterations; i += 1) {
      await Promise.resolve();
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  function teardown() {
    dom.window.close();
  }

  return {
    window,
    document,
    query,
    click,
    setValue,
    text,
    clipboardWrites,
    fetchCalls,
    getLastRequest,
    getActiveStep,
    isStepVisible,
    getToast,
    getProgressStep,
    runTimersByDelay,
    runAllTimers,
    flushAsync,
    teardown
  };
}

module.exports = {
  bootPage,
  defaultBootstrapPayload,
  defaultTutorialPayload,
  buildPreviewPayload,
  createJsonResponse
};
